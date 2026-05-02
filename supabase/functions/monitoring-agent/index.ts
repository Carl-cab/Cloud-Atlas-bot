import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MonitorRequest {
  user_id: string;
  dry_run?: boolean;
  source?: string;
}

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'critical';
  message: string;
  context?: Record<string, unknown>;
}

interface IncidentPayload {
  user_id: string;
  source: string;
  severity: 'info' | 'warning' | 'critical';
  incident_type: string;
  title: string;
  description: string;
  context: Record<string, unknown>;
  action_taken: string[];
}

const STALE_SIGNALS_MINUTES = 30;
const STALE_MARKET_DATA_MINUTES = 30;
const NO_TRADES_ACTIVE_HOURS = 4;
const NOTIFICATION_FAILURE_WINDOW_MINUTES = 60;
const NOTIFICATION_FAILURE_THRESHOLD = 5;
const RISK_EVENTS_WARNING_THRESHOLD = 3;
const RISK_EVENTS_WINDOW_HOURS = 1;
const SYMBOL_CONCENTRATION_THRESHOLD_PCT = 50;

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

type SB = ReturnType<typeof getSupabase>;

async function checkBotConfig(sb: SB, userId: string): Promise<{ check: CheckResult; config: Record<string, unknown> | null }> {
  const { data: config, error } = await sb
    .from('bot_config')
    .select('is_active,mode,capital_cad,daily_stop_loss,max_positions')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !config) {
    return {
      check: { name: 'bot_config', status: 'critical', message: 'bot_config row not found', context: { error: error?.message } },
      config: null,
    };
  }
  return {
    check: { name: 'bot_config', status: 'ok', message: `mode=${config.mode} is_active=${config.is_active}` },
    config,
  };
}

async function checkSignalFreshness(sb: SB, isActive: boolean): Promise<CheckResult> {
  const { data: latest } = await sb
    .from('strategy_signals')
    .select('timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return { name: 'signal_freshness', status: isActive ? 'warning' : 'ok', message: 'No strategy signals found', context: { is_active: isActive } };
  }

  const ageMinutes = (Date.now() - new Date(latest.timestamp as string).getTime()) / 60000;
  if (ageMinutes > STALE_SIGNALS_MINUTES && isActive) {
    return {
      name: 'signal_freshness', status: 'warning',
      message: `Last signal is ${ageMinutes.toFixed(0)}m old (threshold: ${STALE_SIGNALS_MINUTES}m)`,
      context: { last_signal: latest.timestamp, age_minutes: ageMinutes },
    };
  }
  return { name: 'signal_freshness', status: 'ok', message: `Last signal ${ageMinutes.toFixed(0)}m ago` };
}

async function checkMarketDataFreshness(sb: SB, isActive: boolean): Promise<CheckResult> {
  const { data: latest } = await sb
    .from('market_data')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return { name: 'market_data_freshness', status: isActive ? 'warning' : 'ok', message: 'No market data found', context: { is_active: isActive } };
  }

  const ageMinutes = (Date.now() - new Date(latest.created_at as string).getTime()) / 60000;
  if (ageMinutes > STALE_MARKET_DATA_MINUTES && isActive) {
    return {
      name: 'market_data_freshness', status: 'warning',
      message: `Last market data is ${ageMinutes.toFixed(0)}m old (threshold: ${STALE_MARKET_DATA_MINUTES}m)`,
      context: { last_data: latest.created_at, age_minutes: ageMinutes },
    };
  }
  return { name: 'market_data_freshness', status: 'ok', message: `Last market data ${ageMinutes.toFixed(0)}m ago` };
}

async function checkOpenPositions(sb: SB, userId: string, maxPositions: number): Promise<CheckResult> {
  const { count } = await sb
    .from('trading_positions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'open');

  const openCount = count ?? 0;
  if (openCount > maxPositions) {
    return {
      name: 'position_count', status: 'warning',
      message: `Open positions (${openCount}) exceeds max_positions (${maxPositions})`,
      context: { open: openCount, max: maxPositions },
    };
  }
  return { name: 'position_count', status: 'ok', message: `${openCount}/${maxPositions} positions open` };
}

async function checkDailyLoss(sb: SB, userId: string, capitalCad: number, dailyStopLossPercent: number): Promise<CheckResult> {
  const today = new Date().toISOString().split('T')[0];
  const { data: pnl } = await sb
    .from('daily_pnl')
    .select('total_pnl')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (!pnl) {
    return { name: 'daily_loss', status: 'ok', message: 'No daily P&L record for today' };
  }

  const totalPnl = Number(pnl.total_pnl);
  const lossPercent = capitalCad > 0 ? Math.abs(Math.min(0, totalPnl)) / capitalCad * 100 : 0;
  if (totalPnl < 0 && lossPercent >= dailyStopLossPercent) {
    return {
      name: 'daily_loss', status: 'critical',
      message: `Daily loss ${lossPercent.toFixed(2)}% exceeds stop loss ${dailyStopLossPercent}%`,
      context: { total_pnl: totalPnl, loss_percent: lossPercent, threshold: dailyStopLossPercent },
    };
  }
  return { name: 'daily_loss', status: 'ok', message: `Daily P&L: $${totalPnl.toFixed(2)} (${lossPercent.toFixed(2)}% of capital)` };
}

async function checkRiskLimits(sb: SB, userId: string): Promise<CheckResult> {
  const { data: rows } = await sb
    .from('risk_limits_monitoring')
    .select('limit_type,utilization_percentage,status')
    .eq('user_id', userId);

  const breached = (rows ?? []).filter((r: any) => r.status === 'breach' || Number(r.utilization_percentage) >= 100);
  if (breached.length > 0) {
    const types = breached.map((r: any) => `${r.limit_type}(${Number(r.utilization_percentage).toFixed(0)}%)`).join(', ');
    return { name: 'risk_limits', status: 'warning', message: `Risk limit breaches: ${types}`, context: { breached } };
  }
  return { name: 'risk_limits', status: 'ok', message: `${(rows ?? []).length} limits within bounds` };
}

async function checkRecentRiskEvents(sb: SB, userId: string): Promise<CheckResult> {
  const { count } = await sb
    .from('risk_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', hoursAgo(RISK_EVENTS_WINDOW_HOURS));

  const recent = count ?? 0;
  if (recent >= RISK_EVENTS_WARNING_THRESHOLD) {
    return { name: 'risk_events', status: 'warning', message: `${recent} risk events in last hour`, context: { count: recent } };
  }
  return { name: 'risk_events', status: 'ok', message: `${recent} risk events in last hour` };
}

async function checkNotificationFailures(sb: SB, userId: string): Promise<CheckResult> {
  const { count } = await sb
    .from('notification_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'failed')
    .gte('created_at', minutesAgo(NOTIFICATION_FAILURE_WINDOW_MINUTES));

  const failures = count ?? 0;
  if (failures >= NOTIFICATION_FAILURE_THRESHOLD) {
    return {
      name: 'notification_failures', status: 'warning',
      message: `${failures} notification failures in last ${NOTIFICATION_FAILURE_WINDOW_MINUTES}m`,
      context: { failures, window_minutes: NOTIFICATION_FAILURE_WINDOW_MINUTES },
    };
  }
  return { name: 'notification_failures', status: 'ok', message: `${failures} notification failures` };
}

async function checkRecentTrades(sb: SB, userId: string, isActive: boolean, mode: string): Promise<CheckResult> {
  if (!isActive) {
    return { name: 'recent_trades', status: 'ok', message: 'Bot is paused — skipping trade activity check' };
  }
  const { count } = await sb
    .from('executed_trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('timestamp', hoursAgo(NO_TRADES_ACTIVE_HOURS));

  const recentCount = count ?? 0;
  if (recentCount === 0 && mode === 'live') {
    return {
      name: 'recent_trades', status: 'warning',
      message: `No trades in last ${NO_TRADES_ACTIVE_HOURS}h while bot is active in live mode`,
      context: { window_hours: NO_TRADES_ACTIVE_HOURS, mode },
    };
  }
  return { name: 'recent_trades', status: 'ok', message: `${recentCount} trades in last ${NO_TRADES_ACTIVE_HOURS}h` };
}

async function checkSymbolConcentration(sb: SB, userId: string): Promise<CheckResult> {
  const { data: positions } = await sb
    .from('trading_positions')
    .select('symbol')
    .eq('user_id', userId)
    .eq('status', 'open');

  if (!positions || positions.length < 3) {
    return { name: 'symbol_concentration', status: 'ok', message: 'Not enough positions to check concentration' };
  }

  const counts: Record<string, number> = {};
  for (const p of positions) counts[p.symbol as string] = (counts[p.symbol as string] ?? 0) + 1;
  const maxCount = Math.max(...Object.values(counts));
  const maxSymbol = Object.keys(counts).find(k => counts[k] === maxCount) ?? '';
  const concentrationPct = maxCount / positions.length * 100;

  if (concentrationPct > SYMBOL_CONCENTRATION_THRESHOLD_PCT) {
    return {
      name: 'symbol_concentration', status: 'warning',
      message: `${maxSymbol} represents ${concentrationPct.toFixed(0)}% of open positions`,
      context: { symbol: maxSymbol, pct: concentrationPct, total: positions.length },
    };
  }
  return { name: 'symbol_concentration', status: 'ok', message: `Max concentration: ${concentrationPct.toFixed(0)}% (${maxSymbol})` };
}

// PNL_CONSISTENCY_TOLERANCE_PCT: if daily_pnl.realized_pnl deviates more than this
// from the sum of exit trades' realized_pnl, flag a warning.
const PNL_CONSISTENCY_TOLERANCE_PCT = 5;

async function checkPnlConsistency(sb: SB, userId: string): Promise<CheckResult> {
  const today = new Date().toISOString().split('T')[0];
  const todayStart = new Date(today + 'T00:00:00.000Z');

  const [pnlRes, tradesRes] = await Promise.allSettled([
    sb.from('daily_pnl')
      .select('realized_pnl, total_trades')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),
    sb.from('executed_trades')
      .select('realized_pnl')
      .eq('user_id', userId)
      .in('trade_type', ['exit', 'stop_loss', 'take_profit'])
      .gte('timestamp', todayStart.toISOString()),
  ]);

  if (pnlRes.status === 'rejected' || tradesRes.status === 'rejected') {
    return { name: 'pnl_consistency', status: 'warning', message: 'Could not fetch data for PnL consistency check' };
  }

  const pnl = pnlRes.value.data;
  const trades = tradesRes.value.data ?? [];

  if (!pnl) {
    // No daily_pnl record yet — not a consistency error, just no data
    return { name: 'pnl_consistency', status: 'ok', message: 'No daily_pnl record for today yet' };
  }

  // Sum realized_pnl from exit/stop_loss/take_profit trades only
  // (daily_pnl.total_trades counts ALL trades including entries, so we only compare PnL values)
  const sumTradesPnl = trades.reduce((sum: number, t: any) => sum + Number(t.realized_pnl ?? 0), 0);
  const recordedPnl = Number(pnl.realized_pnl);

  // Check PnL mismatch using average-magnitude denominator to avoid false positives
  // when values have opposite signs (e.g. +0.50 vs -0.50)
  const pnlDiff = Math.abs(recordedPnl - sumTradesPnl);
  const pnlBase = Math.max((Math.abs(recordedPnl) + Math.abs(sumTradesPnl)) / 2, 1);
  const pnlDiffPct = (pnlDiff / pnlBase) * 100;

  if (pnlDiffPct > PNL_CONSISTENCY_TOLERANCE_PCT) {
    return {
      name: 'pnl_consistency',
      status: 'warning',
      message: `PnL mismatch: daily_pnl=$${recordedPnl.toFixed(2)} vs trades_sum=$${sumTradesPnl.toFixed(2)} (${pnlDiffPct.toFixed(1)}% deviation)`,
      context: {
        recorded_pnl: recordedPnl,
        trades_sum_pnl: sumTradesPnl,
        diff_pct: pnlDiffPct,
      },
    };
  }

  return {
    name: 'pnl_consistency',
    status: 'ok',
    message: `PnL consistent: $${recordedPnl.toFixed(2)} (${trades.length} closing trades)`,
  };
}

const GHOST_POSITION_DAYS = 7;

async function checkSystemHealth(sb: SB, userId: string, isActive: boolean): Promise<CheckResult> {
  const today = new Date().toISOString().split('T')[0];
  const ghostCutoff = new Date(Date.now() - GHOST_POSITION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [dailyPnlRes, riskMonRes, ghostPosRes] = await Promise.allSettled([
    // Check: active bot should have a daily_pnl record for today
    sb.from('daily_pnl')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('date', today),

    // Check: risk_limits_monitoring should have rows when bot is active
    sb.from('risk_limits_monitoring')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    // Check: positions open for more than GHOST_POSITION_DAYS days
    sb.from('trading_positions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'open')
      .lt('opened_at', ghostCutoff),
  ]);

  const issues: string[] = [];
  const contextData: Record<string, unknown> = {};

  // Missing daily_pnl when bot is active
  if (isActive) {
    if (dailyPnlRes.status === 'rejected') {
      issues.push('Could not query daily_pnl record');
      contextData.daily_pnl_query_error = true;
    } else if ((dailyPnlRes.value.count ?? 0) === 0) {
      issues.push('No daily_pnl record for today despite bot being active');
      contextData.missing_daily_pnl = true;
    }
  }

  // Empty risk monitoring table when bot is active
  if (isActive) {
    if (riskMonRes.status === 'rejected') {
      issues.push('Could not query risk_limits_monitoring');
      contextData.risk_mon_query_error = true;
    } else if ((riskMonRes.value.count ?? 0) === 0) {
      issues.push('risk_limits_monitoring table is empty while bot is active');
      contextData.empty_risk_monitoring = true;
    }
  }

  // Ghost positions
  if (ghostPosRes.status === 'fulfilled') {
    const ghostCount = ghostPosRes.value.count ?? 0;
    if (ghostCount > 0) {
      issues.push(`${ghostCount} open position(s) older than ${GHOST_POSITION_DAYS} days`);
      contextData.ghost_positions = ghostCount;
    }
  }

  if (issues.length > 0) {
    return {
      name: 'system_health',
      status: 'warning',
      message: issues.join('; '),
      context: contextData,
    };
  }

  return { name: 'system_health', status: 'ok', message: 'System health checks passed' };
}

async function logIncident(sb: SB, payload: IncidentPayload, dryRun: boolean): Promise<string | null> {
  if (dryRun) {
    console.log('[dry_run] Would log incident:', payload.title);
    return null;
  }
  const { data, error } = await sb
    .from('agent_incidents')
    .insert({
      user_id:       payload.user_id,
      source:        payload.source,
      severity:      payload.severity,
      incident_type: payload.incident_type,
      title:         payload.title,
      description:   payload.description,
      context:       payload.context,
      action_taken:  payload.action_taken,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log incident:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: MonitorRequest = await req.json();
    const { user_id, dry_run = false, source = 'manual' } = request;

    if (!user_id) {
      return new Response(JSON.stringify({ success: false, error: 'user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = getSupabase();
    const triggeredChecks: string[] = [];
    const actionsTaken: string[] = [];
    const incidentIds: string[] = [];
    const allChecks: CheckResult[] = [];

    const { check: configCheck, config } = await checkBotConfig(sb, user_id);
    allChecks.push(configCheck);

    if (!config) {
      return new Response(JSON.stringify({
        success: false,
        overall_status: 'critical',
        triggered_checks: ['bot_config'],
        actions_taken: [],
        incident_ids: [],
        checks: allChecks,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const isActive = Boolean(config.is_active);
    const mode = String(config.mode ?? 'paper');
    const capitalCad = Number(config.capital_cad ?? 100);
    const dailyStopLoss = Number(config.daily_stop_loss ?? 2);
    const maxPositions = Number(config.max_positions ?? 4);

    const checkNames = [
      'signal_freshness', 'market_data_freshness', 'position_count',
      'daily_loss', 'risk_limits', 'risk_events', 'notification_failures',
      'recent_trades', 'symbol_concentration', 'pnl_consistency', 'system_health',
    ] as const;

    const checkResults = await Promise.allSettled([
      checkSignalFreshness(sb, isActive),
      checkMarketDataFreshness(sb, isActive),
      checkOpenPositions(sb, user_id, maxPositions),
      checkDailyLoss(sb, user_id, capitalCad, dailyStopLoss),
      checkRiskLimits(sb, user_id),
      checkRecentRiskEvents(sb, user_id),
      checkNotificationFailures(sb, user_id),
      checkRecentTrades(sb, user_id, isActive, mode),
      checkSymbolConcentration(sb, user_id),
      checkPnlConsistency(sb, user_id),
      checkSystemHealth(sb, user_id, isActive),
    ]);

    const [
      signalCheck,
      marketDataCheck,
      positionCheck,
      dailyLossCheck,
      riskLimitsCheck,
      riskEventsCheck,
      notifFailureCheck,
      recentTradesCheck,
      concentrationCheck,
      pnlConsistencyCheck,
      systemHealthCheck,
    ] = checkResults.map((result, i): CheckResult =>
      result.status === 'fulfilled'
        ? result.value
        : { name: checkNames[i], status: 'warning' as const, message: `Check failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}` }
    );

    allChecks.push(
      signalCheck, marketDataCheck, positionCheck, dailyLossCheck,
      riskLimitsCheck, riskEventsCheck, notifFailureCheck, recentTradesCheck,
      concentrationCheck, pnlConsistencyCheck, systemHealthCheck,
    );

    // Composite: both data sources stale while bot is active = critical
    if (isActive && signalCheck.status !== 'ok' && marketDataCheck.status !== 'ok') {
      allChecks.push({
        name: 'data_staleness_combined',
        status: 'critical',
        message: 'Bot is active but both signals and market data are stale',
      });
    }

    const hasCritical = allChecks.some(c => c.status === 'critical');
    const hasWarning = allChecks.some(c => c.status === 'warning');
    const overallStatus = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';

    for (const check of allChecks) {
      if (check.status === 'ok') continue;
      triggeredChecks.push(check.name);

      const severity: 'warning' | 'critical' = check.status === 'critical' ? 'critical' : 'warning';
      const incidentPayload: IncidentPayload = {
        user_id,
        source,
        severity,
        incident_type: check.name,
        title: check.message,
        description: `Detected by monitoring-agent (${source})`,
        context: { ...(check.context ?? {}), overall_status: overallStatus, dry_run },
        action_taken: [],
      };

      // Critical daily loss → pause bot
      if (check.name === 'daily_loss' && severity === 'critical' && isActive) {
        let action: string;
        if (dry_run) {
          action = '[dry_run] Would pause bot due to daily loss limit breach';
        } else {
          const { error: pauseErr } = await sb.from('bot_config').update({ is_active: false, updated_at: new Date().toISOString() }).eq('user_id', user_id);
          if (pauseErr) {
            console.error('Failed to pause bot on daily loss breach:', pauseErr.message);
            action = 'Failed to pause bot due to daily loss limit breach';
          } else {
            action = 'Bot paused due to daily loss limit breach';
          }
        }
        incidentPayload.action_taken.push(action);
        actionsTaken.push(action);
      }

      // Critical combined staleness → pause bot
      if (check.name === 'data_staleness_combined' && severity === 'critical' && isActive) {
        let action: string;
        if (dry_run) {
          action = '[dry_run] Would pause bot due to combined data staleness';
        } else {
          const { error: pauseErr } = await sb.from('bot_config').update({ is_active: false, updated_at: new Date().toISOString() }).eq('user_id', user_id);
          if (pauseErr) {
            console.error('Failed to pause bot on data staleness:', pauseErr.message);
            action = 'Failed to pause bot due to combined data staleness';
          } else {
            action = 'Bot paused due to stale signals and market data';
          }
        }
        incidentPayload.action_taken.push(action);
        actionsTaken.push(action);
      }

      const incidentId = await logIncident(sb, incidentPayload, dry_run);
      if (incidentId) incidentIds.push(incidentId);
    }

    return new Response(JSON.stringify({
      success: true,
      overall_status: overallStatus,
      triggered_checks: triggeredChecks,
      actions_taken: actionsTaken,
      incident_ids: incidentIds,
      checks: allChecks,
      dry_run,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('monitoring-agent error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
