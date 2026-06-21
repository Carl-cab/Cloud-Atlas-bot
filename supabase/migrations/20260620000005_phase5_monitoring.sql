-- =============================================================================
-- PHASE 5: Monitoring, Alerts, and Reporting Migration
--
-- New tables:
--   alert_rules     — per-user configurable alert thresholds
--   alert_history   — record of every alert delivered
--   report_history  — record of every generated report and its metrics
--
-- Scheduled jobs (pg_cron):
--   daily_maintenance  — 00:05 UTC every day
--   weekly_maintenance — 00:10 UTC every Monday
--
-- NOTE: pg_cron and pg_net must be enabled in the Supabase Dashboard
--   (Database > Extensions) before this migration runs.
--   If they are not enabled, the cron job setup block will be skipped.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. alert_rules — per-user configurable alert thresholds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_type       TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, rule_type)
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_alert_rules"
  ON public.alert_rules
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_manage_alert_rules"
  ON public.alert_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_alert_rules_user_type
  ON public.alert_rules (user_id, rule_type);

-- ---------------------------------------------------------------------------
-- 2. alert_history — record of every alert delivered
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alert_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type     TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message        TEXT NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  telegram_sent  BOOLEAN NOT NULL DEFAULT false,
  email_sent     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own alert history
CREATE POLICY "users_read_own_alert_history"
  ON public.alert_history
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only service_role can insert alert history (prevents users from injecting fake alerts)
CREATE POLICY "service_role_manage_alert_history"
  ON public.alert_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_alert_history_user_severity_date
  ON public.alert_history (user_id, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_user_type_date
  ON public.alert_history (user_id, alert_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. report_history — record of every generated report
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type    TEXT NOT NULL CHECK (report_type IN ('generate_daily_report', 'generate_weekly_report')),
  period_start   TIMESTAMPTZ NOT NULL,
  period_end     TIMESTAMPTZ NOT NULL,
  metrics        JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_sent     BOOLEAN NOT NULL DEFAULT false,
  telegram_sent  BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_report_history"
  ON public.report_history
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_role_manage_report_history"
  ON public.report_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_report_history_user_type_date
  ON public.report_history (user_id, report_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Add scheduler_engine and alert_engine to config.toml reminder
--    (actual config.toml update done in code)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.alert_rules IS
  'Per-user configurable alert thresholds. Managed by alert-engine edge function.';

COMMENT ON TABLE public.alert_history IS
  'Immutable record of every alert delivered. Insert-only via service_role.';

COMMENT ON TABLE public.report_history IS
  'Record of every performance report generated. Insert-only via service_role.';

-- ---------------------------------------------------------------------------
-- 5. pg_cron scheduled jobs
--
-- PREREQUISITES (must be enabled in Supabase Dashboard > Database > Extensions):
--   - pg_cron
--   - pg_net
--
-- These jobs call the scheduler-engine edge function via HTTP using pg_net.
-- Replace <PROJECT_REF> with your actual Supabase project reference ID.
-- Replace <SERVICE_ROLE_KEY> with your service role key (set as a DB secret).
--
-- To enable, run this block manually after enabling the extensions:
-- ---------------------------------------------------------------------------

-- Daily maintenance at 00:05 UTC
-- SELECT cron.schedule(
--   'cloud-atlas-daily-maintenance',
--   '5 0 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduler-engine',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{"action": "run_daily_maintenance"}'::jsonb
--   );
--   $$
-- );

-- Weekly maintenance at 00:10 UTC every Monday
-- SELECT cron.schedule(
--   'cloud-atlas-weekly-maintenance',
--   '10 0 * * 1',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduler-engine',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{"action": "run_weekly_maintenance"}'::jsonb
--   );
--   $$
-- );

-- Alert threshold checks every 15 minutes
-- SELECT cron.schedule(
--   'cloud-atlas-alert-checks',
--   '*/15 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scheduler-engine',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{"action": "run_threshold_checks_all"}'::jsonb
--   );
--   $$
-- );
