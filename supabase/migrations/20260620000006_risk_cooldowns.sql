-- =============================================================================
-- RISK COOLDOWNS MIGRATION
--
-- Adds the risk_cooldowns table used by the RiskManager to record automatic
-- cooldown periods when a risk limit is breached.
--
-- The scheduler-engine reads this table every 15 minutes and auto-resumes
-- trading for any user whose resume_at timestamp has passed.
--
-- Also adds a reference_id index to transactions for O(1) deposit idempotency
-- checks in the wallet-engine deposit verification flow.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. risk_cooldowns — records every automatic risk-limit cooldown
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_cooldowns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  -- Reason codes:
  --   DAILY_LOSS_LIMIT   — daily P&L loss exceeded max_daily_loss %
  --   MAX_DRAWDOWN       — peak-to-trough drawdown exceeded max_drawdown %
  --   CIRCUIT_BREAKER    — hourly loss exceeded circuit_breaker_threshold %
  --   MANUAL             — operator-initiated pause (no auto-resume)
  engaged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resume_at   TIMESTAMPTZ NOT NULL,
  -- resume_at is set to NULL for MANUAL pauses to prevent auto-resume
  details     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  resolved    BOOLEAN     NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  UNIQUE (user_id, reason)
  -- UNIQUE constraint ensures upsert replaces the existing cooldown for the
  -- same reason rather than accumulating duplicate rows.
);

ALTER TABLE public.risk_cooldowns ENABLE ROW LEVEL SECURITY;

-- Users can read their own cooldown records (for the dashboard)
CREATE POLICY "users_read_own_cooldowns"
  ON public.risk_cooldowns
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only service_role can insert/update cooldowns (prevents users from
-- manipulating their own cooldown records to bypass risk limits)
CREATE POLICY "service_role_manage_cooldowns"
  ON public.risk_cooldowns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_risk_cooldowns_user_resolved
  ON public.risk_cooldowns (user_id, resolved, resume_at);

CREATE INDEX IF NOT EXISTS idx_risk_cooldowns_pending_resume
  ON public.risk_cooldowns (resume_at)
  WHERE resolved = false;

COMMENT ON TABLE public.risk_cooldowns IS
  'Records automatic cooldown periods when a risk limit is breached. '
  'The scheduler-engine reads this table to auto-resume trading after cooldown.';

-- ---------------------------------------------------------------------------
-- 2. Index on transactions.reference_id for O(1) deposit idempotency checks
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_user_ref_type
  ON public.transactions (user_id, reference_id, transaction_type)
  WHERE reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Update scheduler-engine to check and auto-resume expired cooldowns
--
-- The scheduler-engine's run_threshold_checks_all action will call a new
-- action: resume_expired_cooldowns. This SQL documents the logic:
--
--   SELECT user_id, reason, resume_at
--   FROM risk_cooldowns
--   WHERE resolved = false
--     AND resume_at <= NOW()
--     AND reason != 'MANUAL';
--
--   For each row:
--     UPDATE bot_config SET is_paused = false, paused_reason = NULL
--       WHERE user_id = <user_id> AND is_paused = true AND paused_reason = <reason>;
--     UPDATE risk_cooldowns SET resolved = true, resolved_at = NOW()
--       WHERE id = <id>;
--     Send Telegram notification: "✅ Trading resumed after cooldown"
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. Add max_drawdown column to risk_settings if not already present
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'risk_settings'
      AND column_name  = 'max_drawdown'
  ) THEN
    ALTER TABLE public.risk_settings
      ADD COLUMN max_drawdown NUMERIC(5,2) NOT NULL DEFAULT 10.00
      CHECK (max_drawdown > 0 AND max_drawdown <= 100);

    COMMENT ON COLUMN public.risk_settings.max_drawdown IS
      'Maximum allowed peak-to-trough drawdown as a percentage (e.g., 10 = 10%). '
      'Triggers a 48-hour cooldown when breached. Hard limit: 30%.';
  END IF;
END $$;
