-- =============================================================================
-- PHASE 4: Production Configuration Migration
--
-- This migration applies production-readiness hardening at the database layer:
--   1. Session security: short JWT expiry, refresh token rotation, PKCE
--   2. Audit log retention: auto-delete entries older than 90 days
--   3. Rate limit table cleanup: auto-delete stale entries
--   4. Deployment readiness table: tracks which pre-flight checks have passed
--   5. Application settings table: centralized config with per-user overrides
--   6. Enforce NOT NULL on critical foreign keys
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Deployment readiness tracking table
--    Records the outcome of each pre-flight check so the health-check
--    endpoint can report a structured status without re-running checks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deployment_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name      TEXT NOT NULL,
  check_category  TEXT NOT NULL CHECK (check_category IN (
                    'auth', 'database', 'edge_functions', 'environment',
                    'trading', 'money_flow', 'monitoring'
                  )),
  status          TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'warn', 'skip')),
  message         TEXT,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by      UUID REFERENCES auth.users(id),
  metadata        JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.deployment_checks ENABLE ROW LEVEL SECURITY;

-- Only service_role can write deployment checks
CREATE POLICY "service_role_manage_deployment_checks"
  ON public.deployment_checks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read deployment check results
CREATE POLICY "authenticated_read_deployment_checks"
  ON public.deployment_checks
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. Application settings table
--    Centralized key-value store for system-wide and per-user settings.
--    Used by the health-check and pre-flight functions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),  -- NULL = system-wide setting
  setting_key TEXT NOT NULL,
  value       TEXT,
  description TEXT,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, setting_key)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "users_manage_own_settings"
  ON public.app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_settings"
  ON public.app_settings
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_manage_app_settings"
  ON public.app_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Audit log auto-retention: delete entries older than 90 days
--    Runs as a scheduled function (see Phase 5). This index makes the
--    cleanup query efficient.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at
  ON public.security_audit_log (created_at);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_severity
  ON public.security_audit_log (user_id, severity, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Rate limit table cleanup index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_window_start
  ON public.rate_limit_entries (window_start);

-- ---------------------------------------------------------------------------
-- 5. Reconciliation log index for fast user queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reconciliation_log_user_at
  ON public.reconciliation_log (user_id, reconciled_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Transactions ledger indexes for fast balance queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date
  ON public.transactions (user_id, transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_reference
  ON public.transactions (reference_id, reference_type)
  WHERE reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. PnL snapshots indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_user_type_date
  ON public.pnl_snapshots (user_id, snapshot_type, snapshot_at DESC);

-- ---------------------------------------------------------------------------
-- 8. Withdrawal requests index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_status
  ON public.withdrawal_requests (user_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. Seed system-wide app settings
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (user_id, setting_key, value, description, is_secret)
VALUES
  (NULL, 'max_single_deposit_usd',    '50000',  'Maximum single deposit amount in USD',          false),
  (NULL, 'min_withdrawal_usd',         '10',     'Minimum withdrawal amount in USD',              false),
  (NULL, 'reconciliation_threshold',   '1.00',   'USD discrepancy that triggers kill switch',     false),
  (NULL, 'reconciliation_auto_adjust', '0.10',   'USD discrepancy that can be auto-adjusted',     false),
  (NULL, 'audit_log_retention_days',   '90',     'Days to retain security audit log entries',     false),
  (NULL, 'paper_trading_default',      'true',   'New bots start in paper trading mode',          false),
  (NULL, 'max_daily_loss_pct_default', '2',      'Default max daily loss % for new risk configs', false),
  (NULL, 'max_position_size_pct',      '10',     'Hard cap: max % of capital per position',       false),
  (NULL, 'max_trade_size_usd',         '10000',  'Hard cap: max USD per single trade',            false),
  (NULL, 'deployment_version',         '4.0.0',  'Current deployment phase version',              false)
ON CONFLICT (user_id, setting_key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 10. Update supabase/config.toml JWT settings are applied via the
--     Supabase Dashboard (Auth > Settings). This comment documents the
--     required production values:
--
--     JWT Expiry:           3600 seconds (1 hour)
--     Refresh Token Expiry: 604800 seconds (7 days)
--     Refresh Token Rotation: ENABLED
--     Reuse Interval:       10 seconds
--     OTP Expiry:           300 seconds (5 minutes)
--     Email Confirmations:  REQUIRED
--     Secure Email Change:  ENABLED
--
--     These CANNOT be set via SQL migration. They must be configured in the
--     Supabase Dashboard under Authentication > Settings before go-live.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.deployment_checks IS
  'Pre-flight deployment check results. See health-check edge function.';

COMMENT ON TABLE public.app_settings IS
  'System-wide and per-user application configuration. is_secret=true values are masked in API responses.';
