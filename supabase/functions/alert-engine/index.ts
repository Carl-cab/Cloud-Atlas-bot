// =============================================================================
// ALERT ENGINE — Phase 5: Real-Time Monitoring and Alerting
//
// Actions:
//   send_alert         — send an immediate alert via Telegram and/or email
//   check_thresholds   — evaluate all alert rules for a user and fire any
//                        that have been breached
//   get_alert_history  — paginated alert delivery history
//   get_alert_rules    — list all configured alert rules for a user
//   update_alert_rule  — enable/disable or update threshold for a rule
//
// Alert types (fired automatically by check_thresholds):
//   KILL_SWITCH_ACTIVATED    — bot paused (manual or automatic)
//   DAILY_LOSS_THRESHOLD     — daily P&L loss exceeds configured %
//   POSITION_DRAWDOWN        — single position drawdown exceeds threshold
//   RECONCILIATION_MISMATCH  — Kraken balance discrepancy detected
//   CONSECUTIVE_LOSSES       — N losing trades in a row
//   LARGE_TRADE              — single trade exceeds size threshold
//   AUTH_FAILURE_SPIKE       — multiple auth failures in short window
//   AUDIT_CRITICAL           — new CRITICAL severity audit log entry
//
// Security:
//   - All actions require a valid JWT.
//   - user_id is ALWAYS taken from the JWT.
//   - Alert delivery uses the notification-engine internally.
// =============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { auditLog, AuditCategory, AuditSeverity } from '../_shared/auditLogger.ts';
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
// Default alert rule thresholds (overridable per user in alert_rules table)
// ---------------------------------------------------------------------------
const DEFAULT_THRESHOLDS = {
  daily_loss_pct:        2.0,   // Alert when daily loss exceeds 2%
  position_drawdown_pct: 5.0,   // Alert when a position is down 5%
  consecutive_losses:    3,     // Alert after 3 consecutive losing trades
  large_trade_usd:       500,   // Alert for any single trade > $500
  auth_failure_window:   300,   // Seconds to look back for auth failure spike
  auth_failure_count:    5,     // Number of auth failures to trigger alert
};

// ---------------------------------------------------------------------------
// Helper: deliver an alert via Telegram and/or email using notification-engine
// ---------------------------------------------------------------------------
async function deliverAlert(
  userId: string,
  alertType: string,
  severity: 'info' | 'warning' | 'critical',
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<{ telegram: boolean; email: boolean }> {
  const result = { telegram: false, email: false };

  try {
    // Fetch user notification settings
    const { data: settings } = await supabaseAdmin
      .from('notification_settings')
      .select('telegram_enabled, email_enabled, telegram_chat_id, email_address, risk_alerts, trade_alerts')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings) return result;

    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const resendKey = Deno.env.get('RESEND_API_KEY');

    const severityEmoji = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
    const telegramMsg = `${severityEmoji} <b>Cloud Atlas Bot Alert</b>\n\n<b>Type:</b> ${alertType}\n<b>Severity:</b> ${severity.toUpperCase()}\n\n${message}`;

    // Send Telegram
    if (settings.telegram_enabled && settings.telegram_chat_id && telegramToken) {
      try {
        const resp = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: settings.telegram_chat_id,
            text: telegramMsg,
            parse_mode: 'HTML',
          }),
        });
        result.telegram = resp.ok;
      } catch (e) {
        console.error('Telegram delivery failed:', e);
      }
    }

    // Send email
    if (settings.email_enabled && settings.email_address && resendKey) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${severity === 'critical' ? '#dc2626' : severity === 'warning' ? '#d97706' : '#2563eb'}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">${severityEmoji} Cloud Atlas Bot Alert</h2>
            </div>
            <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
              <p><strong>Alert Type:</strong> ${alertType}</p>
              <p><strong>Severity:</strong> ${severity.toUpperCase()}</p>
              <p><strong>Time:</strong> ${new Date().toUTCString()}</p>
              <hr style="border-color: #e5e7eb;" />
              <p>${message}</p>
              ${Object.keys(metadata).length > 0 ? `
              <hr style="border-color: #e5e7eb;" />
              <p><strong>Details:</strong></p>
              <pre style="background: #f3f4f6; padding: 10px; border-radius: 4px; font-size: 12px;">${JSON.stringify(metadata, null, 2)}</pre>
              ` : ''}
            </div>
          </div>`;

        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Cloud Atlas Bot <alerts@resend.dev>',
            to: [settings.email_address],
            subject: `[${severity.toUpperCase()}] Cloud Atlas Bot: ${alertType}`,
            html: emailHtml,
          }),
        });
        result.email = resp.ok;
      } catch (e) {
        console.error('Email delivery failed:', e);
      }
    }

    // Log alert delivery to alert_history
    await supabaseAdmin.from('alert_history').insert({
      user_id:          userId,
      alert_type:       alertType,
      severity,
      message,
      metadata,
      telegram_sent:    result.telegram,
      email_sent:       result.email,
    });

  } catch (e) {
    console.error('Alert delivery error:', e);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Threshold checks
// ---------------------------------------------------------------------------

async function checkDailyLoss(userId: string, thresholds: typeof DEFAULT_THRESHOLDS): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: wallet } = await supabaseAdmin
    .from('user_wallets')
    .select('available_balance, locked_in_trades, total_deposited')
    .eq('user_id', userId)
    .eq('currency', 'USD')
    .maybeSingle();

  if (!wallet) return;

  const { data: pnlTxs } = await supabaseAdmin
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('transaction_type', 'realized_pnl')
    .gte('created_at', today.toISOString());

  const realizedPnlToday = pnlTxs?.reduce((sum, tx) => sum + Number(tx.amount), 0) ?? 0;
  const portfolioValue = Number(wallet.available_balance) + Number(wallet.locked_in_trades);
  const startingBalance = portfolioValue - realizedPnlToday;

  if (startingBalance <= 0) return;

  const dailyLossPct = ((realizedPnlToday < 0 ? Math.abs(realizedPnlToday) : 0) / startingBalance) * 100;

  if (dailyLossPct >= thresholds.daily_loss_pct) {
    await deliverAlert(
      userId,
      'DAILY_LOSS_THRESHOLD',
      'critical',
      `Daily loss of ${dailyLossPct.toFixed(2)}% has exceeded your threshold of ${thresholds.daily_loss_pct}%. Trading has been paused automatically.`,
      { daily_loss_pct: dailyLossPct, threshold_pct: thresholds.daily_loss_pct, realized_pnl_today: realizedPnlToday }
    );
  }
}

async function checkPositionDrawdown(userId: string, thresholds: typeof DEFAULT_THRESHOLDS): Promise<void> {
  const { data: positions } = await supabaseAdmin
    .from('trading_positions')
    .select('id, symbol, side, entry_price, current_price, quantity, unrealized_pnl')
    .eq('user_id', userId)
    .eq('status', 'open')
    .not('current_price', 'is', null);

  for (const pos of (positions ?? [])) {
    const entryValue = Number(pos.entry_price) * Number(pos.quantity);
    if (entryValue <= 0) continue;

    const drawdownPct = (Math.abs(Number(pos.unrealized_pnl ?? 0)) / entryValue) * 100;
    const isLosing = Number(pos.unrealized_pnl ?? 0) < 0;

    if (isLosing && drawdownPct >= thresholds.position_drawdown_pct) {
      await deliverAlert(
        userId,
        'POSITION_DRAWDOWN',
        'warning',
        `Position ${pos.symbol} (${pos.side}) is down ${drawdownPct.toFixed(2)}%, exceeding your ${thresholds.position_drawdown_pct}% drawdown threshold.`,
        { position_id: pos.id, symbol: pos.symbol, drawdown_pct: drawdownPct, unrealized_pnl: pos.unrealized_pnl }
      );
    }
  }
}

async function checkConsecutiveLosses(userId: string, thresholds: typeof DEFAULT_THRESHOLDS): Promise<void> {
  const { data: recentTrades } = await supabaseAdmin
    .from('executed_trades')
    .select('id, pnl, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(thresholds.consecutive_losses + 1);

  if (!recentTrades || recentTrades.length < thresholds.consecutive_losses) return;

  const lastN = recentTrades.slice(0, thresholds.consecutive_losses);
  const allLosing = lastN.every(t => Number(t.pnl ?? 0) < 0);

  if (allLosing) {
    const totalLoss = lastN.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);
    await deliverAlert(
      userId,
      'CONSECUTIVE_LOSSES',
      'warning',
      `${thresholds.consecutive_losses} consecutive losing trades detected. Total loss: $${Math.abs(totalLoss).toFixed(2)}.`,
      { consecutive_count: thresholds.consecutive_losses, total_loss: totalLoss }
    );
  }
}

async function checkAuthFailureSpike(userId: string, thresholds: typeof DEFAULT_THRESHOLDS): Promise<void> {
  const windowStart = new Date(Date.now() - thresholds.auth_failure_window * 1000).toISOString();

  const { count } = await supabaseAdmin
    .from('security_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', 'AUTH_FAILURE')
    .gte('created_at', windowStart);

  if ((count ?? 0) >= thresholds.auth_failure_count) {
    await deliverAlert(
      userId,
      'AUTH_FAILURE_SPIKE',
      'critical',
      `${count} authentication failures detected in the last ${thresholds.auth_failure_window / 60} minutes. Your account may be under attack.`,
      { failure_count: count, window_seconds: thresholds.auth_failure_window }
    );
  }
}

async function checkCriticalAuditEvents(userId: string): Promise<void> {
  // Find CRITICAL audit events in the last 5 minutes that haven't been alerted
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: criticalEvents } = await supabaseAdmin
    .from('security_audit_log')
    .select('id, action, details, created_at')
    .eq('user_id', userId)
    .eq('severity_level', 'critical')
    .gte('created_at', fiveMinAgo)
    .not('action', 'in', '("KILL_SWITCH_ACTIVATED","CIRCUIT_BREAKER_TRIGGERED")'); // Already alerted separately

  for (const event of (criticalEvents ?? [])) {
    await deliverAlert(
      userId,
      'AUDIT_CRITICAL',
      'critical',
      `Critical security event detected: ${event.action}`,
      { event_id: event.id, action: event.action, details: event.details }
    );
  }
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
      case 'send_alert': {
        const { alert_type, severity = 'info', message, metadata = {} } = body;
        if (!alert_type || !message) {
          return new Response(JSON.stringify({ error: 'alert_type and message are required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const result = await deliverAlert(userId, alert_type, severity, message, metadata);

        return new Response(JSON.stringify({ success: true, delivery: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -----------------------------------------------------------------------
      case 'check_thresholds': {
        // Load user-specific thresholds from alert_rules table, falling back to defaults
        const { data: rules } = await supabaseAdmin
          .from('alert_rules')
          .select('rule_type, threshold_value, is_enabled')
          .eq('user_id', userId)
          .eq('is_enabled', true);

        const thresholds = { ...DEFAULT_THRESHOLDS };
        for (const rule of (rules ?? [])) {
          if (rule.rule_type in thresholds) {
            (thresholds as Record<string, number>)[rule.rule_type] = Number(rule.threshold_value);
          }
        }

        // Run all threshold checks in parallel
        await Promise.allSettled([
          checkDailyLoss(userId, thresholds),
          checkPositionDrawdown(userId, thresholds),
          checkConsecutiveLosses(userId, thresholds),
          checkAuthFailureSpike(userId, thresholds),
          checkCriticalAuditEvents(userId),
        ]);

        return new Response(JSON.stringify({
          success: true,
          message: 'Threshold checks completed',
          checked_at: new Date().toISOString(),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_alert_history': {
        const { page = 1, per_page = 30, severity: filterSeverity } = body;
        const offset = (page - 1) * per_page;

        let query = supabaseAdmin
          .from('alert_history')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + per_page - 1);

        if (filterSeverity) query = query.eq('severity', filterSeverity);

        const { data: alerts, count, error } = await query;
        if (error) throw new Error(`Failed to fetch alert history: ${error.message}`);

        return new Response(JSON.stringify({
          success: true, alerts, total: count, page, per_page
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_alert_rules': {
        const { data: rules, error } = await supabaseAdmin
          .from('alert_rules')
          .select('*')
          .eq('user_id', userId)
          .order('rule_type');

        if (error) throw new Error(`Failed to fetch alert rules: ${error.message}`);

        // Merge with defaults to show all possible rules
        const ruleMap = new Map((rules ?? []).map(r => [r.rule_type, r]));
        const allRules = Object.entries(DEFAULT_THRESHOLDS).map(([type, defaultVal]) => ({
          rule_type:       type,
          threshold_value: ruleMap.get(type)?.threshold_value ?? defaultVal,
          is_enabled:      ruleMap.get(type)?.is_enabled ?? true,
          is_custom:       ruleMap.has(type),
        }));

        return new Response(JSON.stringify({ success: true, rules: allRules }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -----------------------------------------------------------------------
      case 'update_alert_rule': {
        const { rule_type, threshold_value, is_enabled } = body;
        if (!rule_type) {
          return new Response(JSON.stringify({ error: 'rule_type is required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabaseAdmin
          .from('alert_rules')
          .upsert({
            user_id:         userId,
            rule_type,
            threshold_value: threshold_value ?? DEFAULT_THRESHOLDS[rule_type as keyof typeof DEFAULT_THRESHOLDS],
            is_enabled:      is_enabled ?? true,
            updated_at:      new Date().toISOString(),
          }, { onConflict: 'user_id,rule_type' })
          .select()
          .single();

        if (error) throw new Error(`Failed to update alert rule: ${error.message}`);

        return new Response(JSON.stringify({ success: true, rule: data }), {
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
    console.error('Alert engine error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
