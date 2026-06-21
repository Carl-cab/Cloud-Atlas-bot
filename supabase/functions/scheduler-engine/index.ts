// =============================================================================
// SCHEDULER ENGINE — Phase 5: Automated Daily Task Runner
//
// This function is designed to be called by Supabase's pg_cron extension or
// an external cron service (e.g., GitHub Actions, Upstash QStash) on a
// scheduled basis. It orchestrates all time-based maintenance tasks.
//
// Scheduled jobs:
//   daily_maintenance    — runs at 00:05 UTC daily
//     1. Take daily P&L snapshot for all active users
//     2. Run daily performance report for all users with daily_reports=true
//     3. Run threshold checks for all active users
//     4. Trigger Kraken reconciliation for all active users
//     5. Clean up audit log entries older than retention_days
//     6. Clean up stale rate limit entries
//     7. Clean up stale deployment check results (keep last 10 per category)
//
//   weekly_maintenance   — runs at 00:10 UTC every Monday
//     1. Generate weekly performance reports
//     2. Purge soft-deleted records
//
// Actions (callable via HTTP for manual triggers):
//   run_daily_maintenance   — trigger the full daily job immediately
//   run_weekly_maintenance  — trigger the full weekly job immediately
//   run_audit_cleanup       — clean up old audit log entries only
//   run_reconciliation_all  — trigger reconciliation for all active users
//   run_threshold_checks_all — run alert threshold checks for all active users
//
// Security:
//   - HTTP calls require a valid JWT.
//   - Cron calls use the service-role key via the Authorization header.
//   - Per-user actions always scope to that user's data.
// =============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { auditLog, AuditCategory, AuditSeverity } from '../_shared/auditLogger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ---------------------------------------------------------------------------
// Helper: invoke another edge function as service role
// ---------------------------------------------------------------------------
async function invokeFunction(
  functionName: string,
  body: Record<string, unknown>,
  userToken?: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const authToken = userToken ?? SERVICE_ROLE_KEY;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { success: false, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Get all active users (have a bot_config row and are not globally paused)
// ---------------------------------------------------------------------------
async function getActiveUsers(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('bot_config')
    .select('user_id')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch active users:', error.message);
    return [];
  }

  return (data ?? []).map(r => r.user_id);
}

// ---------------------------------------------------------------------------
// Get all users with daily reports enabled
// ---------------------------------------------------------------------------
async function getReportUsers(reportType: 'daily' | 'weekly'): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('notification_settings')
    .select('user_id')
    .eq('daily_reports', true);

  if (error) {
    console.error('Failed to fetch report users:', error.message);
    return [];
  }

  return (data ?? []).map(r => r.user_id);
}

// ---------------------------------------------------------------------------
// Task: Audit log cleanup
// ---------------------------------------------------------------------------
async function runAuditCleanup(): Promise<{ deleted: number }> {
  // Get retention days from app_settings
  const { data: setting } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .is('user_id', null)
    .eq('setting_key', 'audit_log_retention_days')
    .maybeSingle();

  const retentionDays = parseInt(setting?.value ?? '90', 10);
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabaseAdmin
    .from('security_audit_log')
    .delete({ count: 'exact' })
    .lt('created_at', cutoffDate)
    .not('severity_level', 'eq', 'critical'); // Retain all CRITICAL entries regardless

  if (error) {
    console.error('Audit log cleanup failed:', error.message);
    return { deleted: 0 };
  }

  console.log(`Audit log cleanup: deleted ${count ?? 0} entries older than ${retentionDays} days`);
  return { deleted: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Task: Rate limit table cleanup
// ---------------------------------------------------------------------------
async function runRateLimitCleanup(): Promise<{ deleted: number }> {
  // Delete entries where window_start is more than 1 hour ago
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { error, count } = await supabaseAdmin
    .from('rate_limit_entries')
    .delete({ count: 'exact' })
    .lt('window_start', cutoff);

  if (error) {
    console.error('Rate limit cleanup failed:', error.message);
    return { deleted: 0 };
  }

  return { deleted: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Task: Deployment checks cleanup (keep last 10 per category)
// ---------------------------------------------------------------------------
async function runDeploymentChecksCleanup(): Promise<void> {
  // Keep only the 10 most recent entries per check_category
  const { data: categories } = await supabaseAdmin
    .from('deployment_checks')
    .select('check_category')
    .order('check_category');

  const uniqueCategories = [...new Set((categories ?? []).map(r => r.check_category))];

  for (const category of uniqueCategories) {
    const { data: toKeep } = await supabaseAdmin
      .from('deployment_checks')
      .select('id')
      .eq('check_category', category)
      .order('checked_at', { ascending: false })
      .limit(10);

    const keepIds = (toKeep ?? []).map(r => r.id);
    if (keepIds.length === 0) continue;

    await supabaseAdmin
      .from('deployment_checks')
      .delete()
      .eq('check_category', category)
      .not('id', 'in', `(${keepIds.map(id => `'${id}'`).join(',')})`);
  }
}

// ---------------------------------------------------------------------------
// Daily maintenance job
// ---------------------------------------------------------------------------
async function runDailyMaintenance(): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const results: Record<string, unknown> = {};

  console.log('Starting daily maintenance job...');

  // 1. Audit log cleanup
  results.audit_cleanup = await runAuditCleanup();

  // 2. Rate limit cleanup
  results.rate_limit_cleanup = await runRateLimitCleanup();

  // 3. Deployment checks cleanup
  await runDeploymentChecksCleanup();
  results.deployment_checks_cleanup = 'ok';

  // 4. P&L snapshots for all active users
  const activeUsers = await getActiveUsers();
  results.active_users = activeUsers.length;

  const snapshotResults = { success: 0, failed: 0 };
  for (const userId of activeUsers) {
    const r = await invokeFunction('pnl-engine', { action: 'take_daily_snapshot', user_id: userId });
    if (r.success) snapshotResults.success++;
    else snapshotResults.failed++;
  }
  results.pnl_snapshots = snapshotResults;

  // 5. Reconciliation for all active users
  const reconResults = { success: 0, failed: 0, skipped: 0 };
  for (const userId of activeUsers) {
    const r = await invokeFunction('reconciliation-engine', {
      action: 'reconcile',
      user_id: userId,
      auto_adjust: false,
    });
    if (r.success) reconResults.success++;
    else reconResults.failed++;
  }
  results.reconciliation = reconResults;

  // 6. Alert threshold checks for all active users
  const alertResults = { success: 0, failed: 0 };
  for (const userId of activeUsers) {
    const r = await invokeFunction('alert-engine', { action: 'check_thresholds', user_id: userId });
    if (r.success) alertResults.success++;
    else alertResults.failed++;
  }
  results.alert_checks = alertResults;

  // 7. Daily reports for users who have them enabled
  const reportUsers = await getReportUsers('daily');
  const reportResults = { success: 0, failed: 0 };
  for (const userId of reportUsers) {
    const r = await invokeFunction('report-engine', { action: 'generate_daily_report', user_id: userId });
    if (r.success) reportResults.success++;
    else reportResults.failed++;
  }
  results.daily_reports = reportResults;

  results.duration_ms = Date.now() - startTime;

  // Log completion
  await auditLog(supabaseAdmin, {
    userId: null,
    action: 'DAILY_MAINTENANCE_COMPLETE',
    category: AuditCategory.SYSTEM,
    severity: AuditSeverity.INFO,
    details: results,
  });

  console.log('Daily maintenance complete:', results);
  return results;
}

// ---------------------------------------------------------------------------
// Weekly maintenance job
// ---------------------------------------------------------------------------
async function runWeeklyMaintenance(): Promise<Record<string, unknown>> {
  const startTime = Date.now();
  const results: Record<string, unknown> = {};

  console.log('Starting weekly maintenance job...');

  // Weekly reports
  const reportUsers = await getReportUsers('weekly');
  const reportResults = { success: 0, failed: 0 };
  for (const userId of reportUsers) {
    const r = await invokeFunction('report-engine', { action: 'generate_weekly_report', user_id: userId });
    if (r.success) reportResults.success++;
    else reportResults.failed++;
  }
  results.weekly_reports = reportResults;
  results.duration_ms = Date.now() - startTime;

  await auditLog(supabaseAdmin, {
    userId: null,
    action: 'WEEKLY_MAINTENANCE_COMPLETE',
    category: AuditCategory.SYSTEM,
    severity: AuditSeverity.INFO,
    details: results,
  });

  return results;
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

    // Allow service-role key for cron invocations
    const isServiceRole = token === SERVICE_ROLE_KEY;

    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { action = 'run_daily_maintenance' } = body;

    switch (action) {

      case 'run_daily_maintenance': {
        const results = await runDailyMaintenance();
        return new Response(JSON.stringify({ success: true, action, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'run_weekly_maintenance': {
        const results = await runWeeklyMaintenance();
        return new Response(JSON.stringify({ success: true, action, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'run_audit_cleanup': {
        const results = await runAuditCleanup();
        return new Response(JSON.stringify({ success: true, action, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'run_reconciliation_all': {
        const activeUsers = await getActiveUsers();
        const results = { success: 0, failed: 0, users: activeUsers.length };
        for (const userId of activeUsers) {
          const r = await invokeFunction('reconciliation-engine', { action: 'reconcile', user_id: userId });
          if (r.success) results.success++;
          else results.failed++;
        }
        return new Response(JSON.stringify({ success: true, action, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'run_threshold_checks_all': {
        const activeUsers = await getActiveUsers();
        const results = { success: 0, failed: 0, users: activeUsers.length };
        for (const userId of activeUsers) {
          const r = await invokeFunction('alert-engine', { action: 'check_thresholds', user_id: userId });
          if (r.success) results.success++;
          else results.failed++;
        }
        return new Response(JSON.stringify({ success: true, action, results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Scheduler engine error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
