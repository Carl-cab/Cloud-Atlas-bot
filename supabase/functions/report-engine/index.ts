// =============================================================================
// REPORT ENGINE — Phase 5: Performance Reporting
//
// Actions:
//   generate_daily_report    — compile and send a daily performance report
//   generate_weekly_report   — compile and send a weekly performance summary
//   get_report_history       — paginated list of previously generated reports
//   get_performance_summary  — real-time performance metrics for the dashboard
//
// Report contents:
//   - Portfolio value (available + locked)
//   - Realized P&L (today / week / all-time)
//   - Unrealized P&L on open positions
//   - Win rate, average win, average loss, profit factor
//   - Total fees paid
//   - Number of trades executed
//   - Kill switch status
//   - Top performing and worst performing positions
//   - Reconciliation status
//
// Delivery:
//   - HTML email via Resend
//   - Telegram message (condensed summary)
//   - Stored in report_history table
//
// Security:
//   - All actions require a valid JWT.
//   - user_id is ALWAYS taken from the JWT.
// =============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyRateLimit, rateLimitConfigs } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// ---------------------------------------------------------------------------
// Data collection helpers
// ---------------------------------------------------------------------------

async function collectPortfolioData(userId: string, periodStart: Date) {
  // Wallet balances
  const { data: wallet } = await supabaseAdmin
    .from('user_wallets')
    .select('available_balance, locked_in_trades, total_deposited, total_withdrawn, total_realized_pnl, total_fees_paid')
    .eq('user_id', userId)
    .eq('currency', 'USD')
    .maybeSingle();

  // Trades in period
  const { data: trades } = await supabaseAdmin
    .from('executed_trades')
    .select('id, symbol, side, quantity, price, pnl, fees, created_at')
    .eq('user_id', userId)
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: false });

  // Open positions
  const { data: positions } = await supabaseAdmin
    .from('trading_positions')
    .select('id, symbol, side, entry_price, current_price, quantity, unrealized_pnl, opened_at')
    .eq('user_id', userId)
    .eq('status', 'open');

  // Bot config status
  const { data: botConfig } = await supabaseAdmin
    .from('bot_config')
    .select('is_active, is_paused, paper_trading_mode, paused_reason')
    .eq('user_id', userId)
    .maybeSingle();

  // Latest reconciliation
  const { data: recon } = await supabaseAdmin
    .from('reconciliation_log')
    .select('status, discrepancy_usd, reconciled_at')
    .eq('user_id', userId)
    .order('reconciled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { wallet, trades: trades ?? [], positions: positions ?? [], botConfig, recon };
}

function computeMetrics(trades: any[], wallet: any) {
  const winningTrades = trades.filter(t => Number(t.pnl ?? 0) > 0);
  const losingTrades  = trades.filter(t => Number(t.pnl ?? 0) < 0);

  const totalPnl     = trades.reduce((s, t) => s + Number(t.pnl ?? 0), 0);
  const totalFees    = trades.reduce((s, t) => s + Number(t.fees ?? 0), 0);
  const avgWin       = winningTrades.length > 0
    ? winningTrades.reduce((s, t) => s + Number(t.pnl), 0) / winningTrades.length : 0;
  const avgLoss      = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((s, t) => s + Number(t.pnl), 0) / losingTrades.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  const winRate      = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

  const totalUnrealized = 0; // Populated from positions separately

  const portfolioValue = wallet
    ? Number(wallet.available_balance) + Number(wallet.locked_in_trades) : 0;

  return {
    trade_count:    trades.length,
    win_count:      winningTrades.length,
    loss_count:     losingTrades.length,
    win_rate:       winRate,
    total_pnl:      totalPnl,
    total_fees:     totalFees,
    avg_win:        avgWin,
    avg_loss:       avgLoss,
    profit_factor:  profitFactor,
    portfolio_value: portfolioValue,
    available_balance: wallet ? Number(wallet.available_balance) : 0,
    locked_in_trades: wallet ? Number(wallet.locked_in_trades) : 0,
    all_time_pnl:   wallet ? Number(wallet.total_realized_pnl) : 0,
    all_time_fees:  wallet ? Number(wallet.total_fees_paid) : 0,
  };
}

// ---------------------------------------------------------------------------
// HTML email report generator
// ---------------------------------------------------------------------------
function generateReportHTML(
  reportType: string,
  periodLabel: string,
  metrics: ReturnType<typeof computeMetrics>,
  positions: any[],
  botConfig: any,
  recon: any,
  generatedAt: string
): string {
  const pnlColor  = metrics.total_pnl >= 0 ? '#16a34a' : '#dc2626';
  const pnlSign   = metrics.total_pnl >= 0 ? '+' : '';
  const statusBadge = botConfig?.is_paused
    ? '<span style="background:#dc2626;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">PAUSED</span>'
    : botConfig?.paper_trading_mode
      ? '<span style="background:#d97706;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">PAPER TRADING</span>'
      : '<span style="background:#16a34a;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">LIVE</span>';

  const openPositionsHTML = positions.length === 0
    ? '<p style="color:#6b7280;">No open positions.</p>'
    : positions.map(p => {
        const upnl = Number(p.unrealized_pnl ?? 0);
        const upnlColor = upnl >= 0 ? '#16a34a' : '#dc2626';
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${p.symbol}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${p.side.toUpperCase()}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">$${Number(p.entry_price).toFixed(4)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:${upnlColor};">${upnl >= 0 ? '+' : ''}$${upnl.toFixed(2)}</td>
        </tr>`;
      }).join('');

  const reconStatus = recon
    ? `${recon.status === 'ok' ? '✅' : '⚠️'} Last reconciliation: ${new Date(recon.reconciled_at).toUTCString()} — Discrepancy: $${Number(recon.discrepancy_usd ?? 0).toFixed(4)}`
    : '⚠️ No reconciliation data available.';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Cloud Atlas Bot — ${reportType} Report</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px;">
  <div style="max-width:640px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);color:white;padding:30px;">
      <h1 style="margin:0;font-size:24px;">☁️ Cloud Atlas Bot</h1>
      <p style="margin:8px 0 0;opacity:0.85;">${reportType} Performance Report — ${periodLabel}</p>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.7;">Generated: ${generatedAt}</p>
    </div>

    <!-- Bot Status -->
    <div style="padding:20px;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0;"><strong>Bot Status:</strong> ${statusBadge}
      ${botConfig?.is_paused ? `<span style="color:#6b7280;font-size:12px;margin-left:8px;">Reason: ${botConfig.paused_reason ?? 'Manual pause'}</span>` : ''}</p>
    </div>

    <!-- Portfolio Summary -->
    <div style="padding:20px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 16px;font-size:18px;">Portfolio Summary</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Portfolio Value</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;">$${metrics.portfolio_value.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Available Balance</td>
          <td style="padding:8px 0;text-align:right;">$${metrics.available_balance.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Locked in Trades</td>
          <td style="padding:8px 0;text-align:right;">$${metrics.locked_in_trades.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-weight:bold;">Period P&amp;L</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:${pnlColor};">${pnlSign}$${metrics.total_pnl.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">All-Time Realized P&amp;L</td>
          <td style="padding:8px 0;text-align:right;color:${metrics.all_time_pnl >= 0 ? '#16a34a' : '#dc2626'};">${metrics.all_time_pnl >= 0 ? '+' : ''}$${metrics.all_time_pnl.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Total Fees Paid</td>
          <td style="padding:8px 0;text-align:right;color:#6b7280;">-$${metrics.all_time_fees.toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <!-- Trading Statistics -->
    <div style="padding:20px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 16px;font-size:18px;">Trading Statistics (${periodLabel})</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Total Trades</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;">${metrics.trade_count}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Win Rate</td>
          <td style="padding:8px 0;text-align:right;color:${metrics.win_rate >= 50 ? '#16a34a' : '#dc2626'};">${metrics.win_rate.toFixed(1)}% (${metrics.win_count}W / ${metrics.loss_count}L)</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Average Win</td>
          <td style="padding:8px 0;text-align:right;color:#16a34a;">+$${metrics.avg_win.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Average Loss</td>
          <td style="padding:8px 0;text-align:right;color:#dc2626;">-$${metrics.avg_loss.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Profit Factor</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;">${isFinite(metrics.profit_factor) ? metrics.profit_factor.toFixed(2) : '∞'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280;">Period Fees</td>
          <td style="padding:8px 0;text-align:right;color:#6b7280;">-$${metrics.total_fees.toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <!-- Open Positions -->
    <div style="padding:20px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 16px;font-size:18px;">Open Positions (${positions.length})</h2>
      ${positions.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">SYMBOL</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">SIDE</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">ENTRY</th>
            <th style="padding:8px;text-align:left;font-size:12px;color:#6b7280;">UNREALIZED P&amp;L</th>
          </tr>
        </thead>
        <tbody>${openPositionsHTML}</tbody>
      </table>` : '<p style="color:#6b7280;margin:0;">No open positions.</p>'}
    </div>

    <!-- Reconciliation -->
    <div style="padding:20px;border-bottom:1px solid #e5e7eb;">
      <h2 style="margin:0 0 8px;font-size:18px;">Reconciliation</h2>
      <p style="margin:0;font-size:14px;color:#374151;">${reconStatus}</p>
    </div>

    <!-- Disclaimer -->
    <div style="padding:20px;background:#fef3c7;">
      <p style="margin:0;font-size:12px;color:#92400e;">
        <strong>Disclaimer:</strong> This report is for informational purposes only.
        Past performance does not guarantee future results. Cryptocurrency trading
        involves significant risk of loss. Always trade responsibly.
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Telegram summary generator
// ---------------------------------------------------------------------------
function generateTelegramSummary(
  reportType: string,
  periodLabel: string,
  metrics: ReturnType<typeof computeMetrics>,
  botConfig: any
): string {
  const pnlSign = metrics.total_pnl >= 0 ? '+' : '';
  const status = botConfig?.is_paused ? '🔴 PAUSED' : botConfig?.paper_trading_mode ? '🟡 PAPER' : '🟢 LIVE';

  return `☁️ <b>Cloud Atlas Bot — ${reportType} Report</b>
<i>${periodLabel}</i>

${status}

<b>Portfolio:</b> $${metrics.portfolio_value.toFixed(2)}
<b>Period P&amp;L:</b> ${pnlSign}$${metrics.total_pnl.toFixed(2)}
<b>All-Time P&amp;L:</b> ${metrics.all_time_pnl >= 0 ? '+' : ''}$${metrics.all_time_pnl.toFixed(2)}

<b>Trades:</b> ${metrics.trade_count} | <b>Win Rate:</b> ${metrics.win_rate.toFixed(1)}%
<b>Profit Factor:</b> ${isFinite(metrics.profit_factor) ? metrics.profit_factor.toFixed(2) : '∞'}
<b>Fees:</b> -$${metrics.total_fees.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Serve handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rateLimitResponse = await applyRateLimit(req, rateLimitConfigs.api, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json();
    const { action } = body;
    const userId = user.id;

    switch (action) {

      // -----------------------------------------------------------------------
      case 'generate_daily_report':
      case 'generate_weekly_report': {
        const isWeekly = action === 'generate_weekly_report';
        const periodStart = new Date();
        periodStart.setHours(0, 0, 0, 0);
        if (isWeekly) periodStart.setDate(periodStart.getDate() - 7);

        const reportType  = isWeekly ? 'Weekly' : 'Daily';
        const periodLabel = isWeekly
          ? `${periodStart.toDateString()} – ${new Date().toDateString()}`
          : new Date().toDateString();

        const { wallet, trades, positions, botConfig, recon } = await collectPortfolioData(userId, periodStart);
        const metrics = computeMetrics(trades, wallet);
        const generatedAt = new Date().toUTCString();

        const htmlContent = generateReportHTML(reportType, periodLabel, metrics, positions, botConfig, recon, generatedAt);
        const telegramMsg = generateTelegramSummary(reportType, periodLabel, metrics, botConfig);

        // Fetch notification settings
        const { data: notifSettings } = await supabaseAdmin
          .from('notification_settings')
          .select('email_enabled, telegram_enabled, email_address, telegram_chat_id, daily_reports')
          .eq('user_id', userId)
          .maybeSingle();

        let emailSent = false;
        let telegramSent = false;

        // Send email
        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (notifSettings?.email_enabled && notifSettings?.email_address && resendKey && notifSettings?.daily_reports) {
          try {
            const resp = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Cloud Atlas Bot <reports@resend.dev>',
                to: [notifSettings.email_address],
                subject: `Cloud Atlas Bot — ${reportType} Report (${periodLabel})`,
                html: htmlContent,
              }),
            });
            emailSent = resp.ok;
          } catch (e) { console.error('Report email failed:', e); }
        }

        // Send Telegram
        const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (notifSettings?.telegram_enabled && notifSettings?.telegram_chat_id && telegramToken && notifSettings?.daily_reports) {
          try {
            const resp = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: notifSettings.telegram_chat_id, text: telegramMsg, parse_mode: 'HTML' }),
            });
            telegramSent = resp.ok;
          } catch (e) { console.error('Report Telegram failed:', e); }
        }

        // Store in report_history
        await supabaseAdmin.from('report_history').insert({
          user_id:      userId,
          report_type:  action,
          period_start: periodStart.toISOString(),
          period_end:   new Date().toISOString(),
          metrics:      metrics,
          email_sent:   emailSent,
          telegram_sent: telegramSent,
        });

        return new Response(JSON.stringify({
          success: true,
          report_type: reportType,
          period_label: periodLabel,
          metrics,
          delivery: { email: emailSent, telegram: telegramSent },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_performance_summary': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { wallet, trades, positions, botConfig, recon } = await collectPortfolioData(userId, today);
        const metrics = computeMetrics(trades, wallet);

        const unrealizedPnl = positions.reduce((s, p) => s + Number(p.unrealized_pnl ?? 0), 0);

        return new Response(JSON.stringify({
          success: true,
          summary: {
            ...metrics,
            unrealized_pnl: unrealizedPnl,
            open_positions: positions.length,
            bot_status: {
              is_active:          botConfig?.is_active ?? false,
              is_paused:          botConfig?.is_paused ?? true,
              paper_trading_mode: botConfig?.paper_trading_mode ?? true,
              paused_reason:      botConfig?.paused_reason ?? null,
            },
            last_reconciliation: recon ?? null,
          },
          generated_at: new Date().toISOString(),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_report_history': {
        const { page = 1, per_page = 20 } = body;
        const offset = (page - 1) * per_page;

        const { data: reports, count, error } = await supabaseAdmin
          .from('report_history')
          .select('id, report_type, period_start, period_end, email_sent, telegram_sent, created_at', { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + per_page - 1);

        if (error) throw new Error(`Failed to fetch report history: ${error.message}`);

        return new Response(JSON.stringify({ success: true, reports, total: count, page, per_page }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -----------------------------------------------------------------------
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Report engine error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
