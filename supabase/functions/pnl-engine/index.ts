// =============================================================================
// P&L ENGINE — Phase 3: Realized and Unrealized Profit/Loss Tracking
//
// Actions:
//   close_position      — record realized P&L when a position is closed,
//                         unlock funds via wallet-engine, write pnl_snapshot
//   get_unrealized_pnl  — calculate unrealized P&L for all open positions
//                         using current market prices from Kraken
//   get_daily_summary   — return today's P&L summary for the user
//   get_pnl_history     — paginated pnl_snapshots history
//   take_daily_snapshot — write a 'daily' pnl_snapshot (called by scheduler)
//
// Security:
//   - All actions require a valid JWT.
//   - user_id is ALWAYS taken from the JWT.
//   - Balance mutations are delegated to wallet-engine via internal call.
// =============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { audit, AuditCategory, AuditSeverity, auditLog } from '../_shared/auditLogger.ts';
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
// Helper: fetch current market price from market_data table
// Falls back to position's entry_price if no recent data available
// ---------------------------------------------------------------------------
async function getCurrentPrice(symbol: string): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('market_data')
    .select('close_price, timestamp')
    .eq('symbol', symbol)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // Reject stale prices older than 10 minutes
  const ageMs = Date.now() - new Date(data.timestamp).getTime();
  if (ageMs > 10 * 60 * 1000) return null;

  return Number(data.close_price);
}

// ---------------------------------------------------------------------------
// Helper: calculate P&L for a single position
// ---------------------------------------------------------------------------
function calcPositionPnl(
  side: string,
  entryPrice: number,
  currentPrice: number,
  quantity: number
): number {
  if (side === 'buy' || side === 'long') {
    return (currentPrice - entryPrice) * quantity;
  } else {
    // short
    return (entryPrice - currentPrice) * quantity;
  }
}

// ---------------------------------------------------------------------------
// Helper: call wallet-engine to unlock funds after position close
// ---------------------------------------------------------------------------
async function callWalletEngine(
  userId: string,
  token: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const url = `${supabaseUrl}/functions/v1/wallet-engine`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  return data;
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
    // --- JWT Validation ---
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      await audit.authFailure(supabaseAdmin, null, 'Missing authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      await audit.authFailure(supabaseAdmin, null, authError?.message ?? 'Invalid token');
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
      case 'close_position': {
        const { position_id, exit_price, exit_quantity, fee = 0 } = body;

        if (!position_id || !exit_price || !exit_quantity) {
          return new Response(JSON.stringify({
            error: 'position_id, exit_price, and exit_quantity are required'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Fetch the position and verify ownership
        const { data: position, error: posError } = await supabaseAdmin
          .from('trading_positions')
          .select('*')
          .eq('id', position_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (posError || !position) {
          return new Response(JSON.stringify({ error: 'Position not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (position.status !== 'open') {
          return new Response(JSON.stringify({
            error: `Position is already ${position.status}`
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Calculate realized P&L
        const realizedPnl = calcPositionPnl(
          position.side,
          Number(position.entry_price),
          Number(exit_price),
          Number(exit_quantity)
        );

        // Determine the locked amount to release (entry_price * quantity)
        const lockedAmount = Number(position.entry_price) * Number(position.quantity);

        // Update position to closed
        const { error: updateError } = await supabaseAdmin
          .from('trading_positions')
          .update({
            status:         'closed',
            current_price:  exit_price,
            unrealized_pnl: 0,
            closed_at:      new Date().toISOString(),
          })
          .eq('id', position_id);

        if (updateError) throw new Error(`Failed to close position: ${updateError.message}`);

        // Unlock funds and record realized P&L via wallet-engine
        const walletResult = await callWalletEngine(userId, token, {
          action:       'unlock_funds',
          amount:       lockedAmount,
          position_id,
          realized_pnl: realizedPnl,
          fee,
        });

        if (!walletResult.success) {
          throw new Error(`Wallet unlock failed: ${walletResult.error}`);
        }

        // Fetch updated wallet for snapshot
        const { data: wallet } = await supabaseAdmin
          .from('user_wallets')
          .select('*')
          .eq('user_id', userId)
          .eq('currency', 'USD')
          .single();

        // Write a trade_close P&L snapshot
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: todayTrades } = await supabaseAdmin
          .from('executed_trades')
          .select('id, pnl')
          .eq('user_id', userId)
          .gte('created_at', todayStart.toISOString());

        const tradesToday = todayTrades?.length ?? 0;
        const winningToday = todayTrades?.filter(t => Number(t.pnl ?? 0) > 0).length ?? 0;
        const losingToday  = tradesToday - winningToday;

        const { data: openPositions } = await supabaseAdmin
          .from('trading_positions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'open');

        await supabaseAdmin.from('pnl_snapshots').insert({
          user_id:               userId,
          snapshot_type:         'trade_close',
          available_balance:     Number(wallet?.available_balance ?? 0),
          locked_in_trades:      Number(wallet?.locked_in_trades ?? 0),
          total_portfolio_value: Number(wallet?.available_balance ?? 0) + Number(wallet?.locked_in_trades ?? 0),
          realized_pnl_today:    realizedPnl,
          realized_pnl_total:    Number(wallet?.total_realized_pnl ?? 0),
          unrealized_pnl:        0,
          total_pnl:             Number(wallet?.total_realized_pnl ?? 0),
          open_positions:        openPositions?.length ?? 0,
          trades_today:          tradesToday,
          winning_trades_today:  winningToday,
          losing_trades_today:   losingToday,
          position_id,
        });

        await auditLog(supabaseAdmin, {
          userId,
          action: 'POSITION_CLOSED',
          category: AuditCategory.TRADING,
          severity: AuditSeverity.INFO,
          details: {
            position_id,
            exit_price,
            realized_pnl: realizedPnl,
            fee,
          }
        });

        return new Response(JSON.stringify({
          success: true,
          realized_pnl: realizedPnl,
          fee,
          available_balance: Number(wallet?.available_balance ?? 0),
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_unrealized_pnl': {
        const { data: openPositions, error: posError } = await supabaseAdmin
          .from('trading_positions')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'open');

        if (posError) throw new Error(`Failed to fetch positions: ${posError.message}`);
        if (!openPositions || openPositions.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            total_unrealized_pnl: 0,
            positions: []
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        let totalUnrealizedPnl = 0;
        const positionsWithPnl = await Promise.all(
          openPositions.map(async (pos) => {
            const currentPrice = await getCurrentPrice(pos.symbol);
            if (!currentPrice) {
              return { ...pos, current_price: null, unrealized_pnl: null };
            }

            const unrealizedPnl = calcPositionPnl(
              pos.side,
              Number(pos.entry_price),
              currentPrice,
              Number(pos.quantity)
            );

            totalUnrealizedPnl += unrealizedPnl;

            // Update position with latest price and unrealized P&L
            await supabaseAdmin
              .from('trading_positions')
              .update({ current_price: currentPrice, unrealized_pnl: unrealizedPnl })
              .eq('id', pos.id);

            return { ...pos, current_price: currentPrice, unrealized_pnl: unrealizedPnl };
          })
        );

        return new Response(JSON.stringify({
          success: true,
          total_unrealized_pnl: totalUnrealizedPnl,
          positions: positionsWithPnl
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_daily_summary': {
        const { date } = body;
        const targetDate = date ? new Date(date) : new Date();
        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setHours(23, 59, 59, 999);

        // Get wallet state
        const { data: wallet } = await supabaseAdmin
          .from('user_wallets')
          .select('*')
          .eq('user_id', userId)
          .eq('currency', 'USD')
          .maybeSingle();

        // Get today's realized P&L from transactions
        const { data: pnlTxs } = await supabaseAdmin
          .from('transactions')
          .select('amount')
          .eq('user_id', userId)
          .eq('transaction_type', 'realized_pnl')
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString());

        const realizedPnlToday = pnlTxs?.reduce((sum, tx) => sum + Number(tx.amount), 0) ?? 0;

        // Get today's fees
        const { data: feeTxs } = await supabaseAdmin
          .from('transactions')
          .select('amount')
          .eq('user_id', userId)
          .eq('transaction_type', 'fee')
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString());

        const feesToday = feeTxs?.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0) ?? 0;

        // Get today's trade count
        const { data: todayTrades, count: tradeCount } = await supabaseAdmin
          .from('executed_trades')
          .select('id, pnl', { count: 'exact' })
          .eq('user_id', userId)
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString());

        const winningTrades = todayTrades?.filter(t => Number(t.pnl ?? 0) > 0).length ?? 0;
        const losingTrades  = (tradeCount ?? 0) - winningTrades;

        // Get open positions count
        const { count: openCount } = await supabaseAdmin
          .from('trading_positions')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('status', 'open');

        // Get the most recent daily snapshot for starting balance
        const { data: prevSnapshot } = await supabaseAdmin
          .from('pnl_snapshots')
          .select('total_portfolio_value')
          .eq('user_id', userId)
          .eq('snapshot_type', 'daily')
          .lt('snapshot_at', dayStart.toISOString())
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const startingBalance = prevSnapshot
          ? Number(prevSnapshot.total_portfolio_value)
          : Number(wallet?.total_deposited ?? 0);

        const currentPortfolioValue =
          Number(wallet?.available_balance ?? 0) + Number(wallet?.locked_in_trades ?? 0);

        const dailyReturnPct = startingBalance > 0
          ? ((currentPortfolioValue - startingBalance) / startingBalance) * 100
          : 0;

        return new Response(JSON.stringify({
          success: true,
          date: targetDate.toISOString().split('T')[0],
          summary: {
            available_balance:     Number(wallet?.available_balance ?? 0),
            locked_in_trades:      Number(wallet?.locked_in_trades ?? 0),
            total_portfolio_value: currentPortfolioValue,
            realized_pnl_today:    realizedPnlToday,
            realized_pnl_total:    Number(wallet?.total_realized_pnl ?? 0),
            fees_today:            feesToday,
            total_fees_paid:       Number(wallet?.total_fees_paid ?? 0),
            total_deposited:       Number(wallet?.total_deposited ?? 0),
            total_withdrawn:       Number(wallet?.total_withdrawn ?? 0),
            open_positions:        openCount ?? 0,
            trades_today:          tradeCount ?? 0,
            winning_trades_today:  winningTrades,
            losing_trades_today:   losingTrades,
            win_rate_today:        (tradeCount ?? 0) > 0
              ? ((winningTrades / (tradeCount ?? 1)) * 100).toFixed(1)
              : null,
            daily_return_pct:      dailyReturnPct.toFixed(2),
            starting_balance:      startingBalance,
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_pnl_history': {
        const { page = 1, per_page = 30, snapshot_type } = body;
        const offset = (page - 1) * per_page;

        let query = supabaseAdmin
          .from('pnl_snapshots')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('snapshot_at', { ascending: false })
          .range(offset, offset + per_page - 1);

        if (snapshot_type) {
          query = query.eq('snapshot_type', snapshot_type);
        }

        const { data: snapshots, count, error: snapError } = await query;
        if (snapError) throw new Error(`Failed to fetch P&L history: ${snapError.message}`);

        return new Response(JSON.stringify({
          success: true,
          snapshots,
          total: count,
          page,
          per_page
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'take_daily_snapshot': {
        // Typically called by the daily-retraining scheduler or a cron job.
        // Takes a point-in-time 'daily' snapshot for the authenticated user.
        const { data: wallet } = await supabaseAdmin
          .from('user_wallets')
          .select('*')
          .eq('user_id', userId)
          .eq('currency', 'USD')
          .maybeSingle();

        const today = new Date();
        const dayStart = new Date(today);
        dayStart.setHours(0, 0, 0, 0);

        const { data: pnlTxs } = await supabaseAdmin
          .from('transactions')
          .select('amount')
          .eq('user_id', userId)
          .eq('transaction_type', 'realized_pnl')
          .gte('created_at', dayStart.toISOString());

        const realizedPnlToday = pnlTxs?.reduce((sum, tx) => sum + Number(tx.amount), 0) ?? 0;

        const { data: todayTrades, count: tradeCount } = await supabaseAdmin
          .from('executed_trades')
          .select('id, pnl', { count: 'exact' })
          .eq('user_id', userId)
          .gte('created_at', dayStart.toISOString());

        const winningToday = todayTrades?.filter(t => Number(t.pnl ?? 0) > 0).length ?? 0;
        const losingToday  = (tradeCount ?? 0) - winningToday;

        const { count: openCount } = await supabaseAdmin
          .from('trading_positions')
          .select('id', { count: 'exact' })
          .eq('user_id', userId)
          .eq('status', 'open');

        const portfolioValue =
          Number(wallet?.available_balance ?? 0) + Number(wallet?.locked_in_trades ?? 0);

        const { data: snapshot, error: snapError } = await supabaseAdmin
          .from('pnl_snapshots')
          .insert({
            user_id:               userId,
            snapshot_type:         'daily',
            available_balance:     Number(wallet?.available_balance ?? 0),
            locked_in_trades:      Number(wallet?.locked_in_trades ?? 0),
            total_portfolio_value: portfolioValue,
            realized_pnl_today:    realizedPnlToday,
            realized_pnl_total:    Number(wallet?.total_realized_pnl ?? 0),
            unrealized_pnl:        0,
            total_pnl:             Number(wallet?.total_realized_pnl ?? 0),
            open_positions:        openCount ?? 0,
            trades_today:          tradeCount ?? 0,
            winning_trades_today:  winningToday,
            losing_trades_today:   losingToday,
          })
          .select()
          .single();

        if (snapError) throw new Error(`Failed to write daily snapshot: ${snapError.message}`);

        return new Response(JSON.stringify({ success: true, snapshot }), {
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
    console.error('P&L engine error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
