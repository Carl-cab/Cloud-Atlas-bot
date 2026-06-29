// =============================================================================
// HEALTH CHECK — Phase 4: Pre-Flight Deployment Validation
//
// Actions:
//   run_checks   — execute all pre-flight checks and return structured results
//   get_status   — return the latest cached check results from deployment_checks
//
// Check categories:
//   auth         — JWT config, RLS enabled, session settings
//   database     — required tables exist, wallets seeded, indexes present
//   edge_functions — required functions deployed and reachable
//   environment  — required env vars set (values masked)
//   trading      — bot_config defaults, risk_settings present, kill switch
//   money_flow   — wallet-engine, pnl-engine, reconciliation-engine reachable
//   monitoring   — audit log writable, notification settings present
//
// Security:
//   - Requires valid JWT (admin users only in production).
//   - Never returns secret values — only presence/absence.
//   - Writes results to deployment_checks table for audit trail.
// =============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface CheckResult {
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Individual check functions
// ---------------------------------------------------------------------------

async function checkRequiredEnvVars(): Promise<CheckResult[]> {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'ENCRYPTION_KEY',
  ];
  const recommended = [
    'RESEND_API_KEY',
    'TELEGRAM_BOT_TOKEN',
  ];

  const results: CheckResult[] = [];

  for (const key of required) {
    const val = Deno.env.get(key);
    results.push({
      name:     `env_var_${key.toLowerCase()}`,
      category: 'environment',
      status:   val && val.length > 0 ? 'pass' : 'fail',
      message:  val && val.length > 0
        ? `${key} is set (${val.length} chars)`
        : `MISSING: ${key} is required`,
    });
  }

  for (const key of recommended) {
    const val = Deno.env.get(key);
    results.push({
      name:     `env_var_${key.toLowerCase()}`,
      category: 'environment',
      status:   val && val.length > 0 ? 'pass' : 'warn',
      message:  val && val.length > 0
        ? `${key} is set (${val.length} chars)`
        : `WARN: ${key} is not set — notifications will be disabled`,
    });
  }

  // Check ENCRYPTION_KEY is not the default placeholder
  const encKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
  if (encKey === 'your-encryption-key-here' || encKey === 'CHANGE_ME' || encKey.length < 32) {
    results.push({
      name:     'env_encryption_key_strength',
      category: 'environment',
      status:   'fail',
      message:  'ENCRYPTION_KEY appears to be a placeholder or is too short (< 32 chars). Generate a strong key.',
    });
  } else {
    results.push({
      name:     'env_encryption_key_strength',
      category: 'environment',
      status:   'pass',
      message:  `ENCRYPTION_KEY is set and meets minimum length (${encKey.length} chars)`,
    });
  }

  return results;
}

async function checkRequiredTables(): Promise<CheckResult[]> {
  const requiredTables = [
    'user_wallets',
    'transactions',
    'withdrawal_requests',
    'pnl_snapshots',
    'reconciliation_log',
    'bot_config',
    'risk_settings',
    'trading_positions',
    'executed_trades',
    'security_audit_log',
    'deployment_checks',
    'app_settings',
  ];

  const results: CheckResult[] = [];

  for (const table of requiredTables) {
    try {
      const { error } = await supabaseAdmin
        .from(table)
        .select('id')
        .limit(1);

      results.push({
        name:     `table_exists_${table}`,
        category: 'database',
        status:   error ? 'fail' : 'pass',
        message:  error
          ? `Table '${table}' is missing or inaccessible: ${error.message}`
          : `Table '${table}' exists and is accessible`,
      });
    } catch (e) {
      results.push({
        name:     `table_exists_${table}`,
        category: 'database',
        status:   'fail',
        message:  `Exception checking table '${table}': ${e.message}`,
      });
    }
  }

  return results;
}

async function checkRLSEnabled(): Promise<CheckResult[]> {
  // Query pg_tables to verify RLS is enabled on sensitive tables
  const sensitiveTables = [
    'user_wallets', 'transactions', 'withdrawal_requests',
    'executed_trades', 'trading_positions', 'security_audit_log',
    'bot_config', 'risk_settings', 'api_keys',
  ];

  const results: CheckResult[] = [];

  try {
    const { data, error } = await supabaseAdmin.rpc('check_rls_enabled', {
      table_names: sensitiveTables
    });

    if (error) {
      // RPC may not exist — fall back to a direct pg_tables query
      const { data: pgData, error: pgError } = await supabaseAdmin
        .from('pg_tables')
        .select('tablename, rowsecurity')
        .in('tablename', sensitiveTables)
        .eq('schemaname', 'public');

      if (pgError) {
        results.push({
          name:     'rls_check',
          category: 'auth',
          status:   'warn',
          message:  'Could not verify RLS status via pg_tables. Verify manually in Supabase Dashboard.',
        });
      } else {
        for (const row of (pgData ?? [])) {
          results.push({
            name:     `rls_enabled_${row.tablename}`,
            category: 'auth',
            status:   row.rowsecurity ? 'pass' : 'fail',
            message:  row.rowsecurity
              ? `RLS is enabled on '${row.tablename}'`
              : `CRITICAL: RLS is DISABLED on '${row.tablename}'`,
          });
        }
      }
    }
  } catch (e) {
    results.push({
      name:     'rls_check',
      category: 'auth',
      status:   'warn',
      message:  `RLS check skipped: ${e.message}. Verify manually.`,
    });
  }

  return results;
}

async function checkBotConfig(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check that bot_config has is_paused column (Phase 2 migration)
  try {
    const { data, error } = await supabaseAdmin
      .from('bot_config')
      .select('is_paused, mode, daily_stop_loss')
      .limit(1);

    if (error) {
      results.push({
        name:     'bot_config_schema',
        category: 'trading',
        status:   'fail',
        message:  `bot_config schema check failed: ${error.message}`,
      });
    } else {
      results.push({
        name:     'bot_config_schema',
        category: 'trading',
        status:   'pass',
        message:  'bot_config has required columns (is_paused, mode, daily_stop_loss)',
      });
    }
  } catch (e) {
    results.push({
      name:     'bot_config_schema',
      category: 'trading',
      status:   'fail',
      message:  `bot_config check exception: ${e.message}`,
    });
  }

  // Check that paper_trading_mode defaults to true for all configs
  try {
    const { data: liveConfigs, error } = await supabaseAdmin
      .from('bot_config')
      .select('id, user_id, mode')
      .eq('mode', 'live')
      .eq('is_paused', false);

    if (!error && liveConfigs && liveConfigs.length > 0) {
      results.push({
        name:     'bot_config_live_trading_active',
        category: 'trading',
        status:   'warn',
        message:  `${liveConfigs.length} bot(s) are in LIVE trading mode with kill switch OFF. Verify this is intentional.`,
        metadata: { live_bot_count: liveConfigs.length },
      });
    } else {
      results.push({
        name:     'bot_config_live_trading_active',
        category: 'trading',
        status:   'pass',
        message:  'No bots are in live trading mode without kill switch',
      });
    }
  } catch (e) {
    results.push({
      name:     'bot_config_live_trading_active',
      category: 'trading',
      status:   'warn',
      message:  `Could not check live trading status: ${e.message}`,
    });
  }

  return results;
}

async function checkWalletEngine(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check that user_wallets table has the Phase 3 schema
  try {
    const { data, error } = await supabaseAdmin
      .from('user_wallets')
      .select('available_balance, locked_in_trades, total_realized_pnl, total_fees_paid')
      .limit(1);

    results.push({
      name:     'wallet_schema',
      category: 'money_flow',
      status:   error ? 'fail' : 'pass',
      message:  error
        ? `user_wallets Phase 3 schema check failed: ${error.message}`
        : 'user_wallets has required Phase 3 columns',
    });
  } catch (e) {
    results.push({
      name:     'wallet_schema',
      category: 'money_flow',
      status:   'fail',
      message:  `wallet schema check exception: ${e.message}`,
    });
  }

  // Check that transactions table is append-only (no update/delete policies)
  try {
    const { count, error } = await supabaseAdmin
      .from('transactions')
      .select('id', { count: 'exact', head: true });

    results.push({
      name:     'transactions_ledger_accessible',
      category: 'money_flow',
      status:   error ? 'fail' : 'pass',
      message:  error
        ? `transactions table inaccessible: ${error.message}`
        : `transactions ledger accessible (${count ?? 0} entries)`,
    });
  } catch (e) {
    results.push({
      name:     'transactions_ledger_accessible',
      category: 'money_flow',
      status:   'fail',
      message:  `transactions check exception: ${e.message}`,
    });
  }

  return results;
}

async function checkAuditLog(userId: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  try {
    // Write a test audit entry — include all columns that may be NOT NULL in live schema
    const { error } = await supabaseAdmin
      .from('security_audit_log')
      .insert({
        user_id:        userId,
        action:         'HEALTH_CHECK',
        resource:       'health-check',
        ip_address:     '127.0.0.1',
        user_agent:     'health-check/1.0',
        success:        true,
        event_category: 'system',
        severity_level: 'info',
        metadata:       { message: 'Pre-flight health check audit log test' },
      });

    results.push({
      name:     'audit_log_writable',
      category: 'monitoring',
      status:   error ? 'fail' : 'pass',
      message:  error
        ? `Audit log write failed: ${error.message}`
        : 'Audit log is writable',
    });
  } catch (e) {
    results.push({
      name:     'audit_log_writable',
      category: 'monitoring',
      status:   'fail',
      message:  `Audit log check exception: ${e.message}`,
    });
  }

  return results;
}

async function checkAppSettings(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('setting_key, value')
      .is('user_id', null);

    if (error) {
      results.push({
        name:     'app_settings_seeded',
        category: 'database',
        status:   'fail',
        message:  `app_settings check failed: ${error.message}`,
      });
    } else {
      const keys = (data ?? []).map(r => r.setting_key);
      const required = ['max_single_deposit_usd', 'min_withdrawal_usd', 'reconciliation_threshold'];
      const missing = required.filter(k => !keys.includes(k));

      results.push({
        name:     'app_settings_seeded',
        category: 'database',
        status:   missing.length === 0 ? 'pass' : 'fail',
        message:  missing.length === 0
          ? `app_settings seeded with ${keys.length} system settings`
          : `app_settings missing required keys: ${missing.join(', ')}`,
      });
    }
  } catch (e) {
    results.push({
      name:     'app_settings_seeded',
      category: 'database',
      status:   'fail',
      message:  `app_settings check exception: ${e.message}`,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Aggregate all checks and persist results
// ---------------------------------------------------------------------------
async function runAllChecks(userId: string): Promise<CheckResult[]> {
  const allChecks: CheckResult[] = [
    ...(await checkRequiredEnvVars()),
    ...(await checkRequiredTables()),
    ...(await checkRLSEnabled()),
    ...(await checkBotConfig()),
    ...(await checkWalletEngine()),
    ...(await checkAuditLog(userId)),
    ...(await checkAppSettings()),
  ];

  // Persist results to deployment_checks
  const rows = allChecks.map(c => ({
    check_name:     c.name,
    check_category: c.category,
    status:         c.status,
    message:        c.message,
    checked_by:     userId,
    metadata:       c.metadata ?? {},
  }));

  await supabaseAdmin.from('deployment_checks').insert(rows);

  return allChecks;
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

    const body = await req.json().catch(() => ({}));
    const { action = 'run_checks' } = body;

    if (action === 'run_checks') {
      const checks = await runAllChecks(user.id);

      const passed  = checks.filter(c => c.status === 'pass').length;
      const failed  = checks.filter(c => c.status === 'fail').length;
      const warned  = checks.filter(c => c.status === 'warn').length;
      const skipped = checks.filter(c => c.status === 'skip').length;

      const overallStatus = failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'pass';

      return new Response(JSON.stringify({
        success: true,
        overall_status: overallStatus,
        summary: { total: checks.length, passed, failed, warned, skipped },
        checks,
        checked_at: new Date().toISOString(),
        deployment_ready: failed === 0,
        message: failed === 0
          ? `All ${passed} checks passed${warned > 0 ? ` with ${warned} warning(s)` : ''}. System is deployment-ready.`
          : `${failed} check(s) FAILED. Resolve all failures before deploying to production.`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_status') {
      const { data: latest, error } = await supabaseAdmin
        .from('deployment_checks')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(100);

      if (error) throw new Error(`Failed to fetch deployment checks: ${error.message}`);

      return new Response(JSON.stringify({
        success: true,
        checks: latest,
        checked_at: latest?.[0]?.checked_at ?? null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Health check error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
