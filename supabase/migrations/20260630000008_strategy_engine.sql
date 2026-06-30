-- =============================================================================
-- STRATEGY ENGINE MIGRATION
--
-- Adds tables for the Strategy Engine framework. Additive only — does not
-- modify any existing tables. Mirrors the broker_abstraction migration pattern.
--
-- Tables:
--   strategies            — registered strategy definitions
--   strategy_versions     — version history for each strategy
--   strategy_results      — individual strategy signal outputs
--   strategy_performance  — aggregated performance metrics
--   strategy_metrics      — per-signal execution metrics
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. strategies — registered strategy definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strategies (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id   TEXT         NOT NULL,
  name          TEXT         NOT NULL,
  version       TEXT         NOT NULL DEFAULT '0.1.0',
  category      TEXT         NOT NULL CHECK (category IN (
    'momentum', 'mean_reversion', 'breakout', 'trend_following',
    'ai_hybrid', 'statistical_arbitrage', 'custom'
  )),
  description   TEXT,
  author        TEXT         NOT NULL DEFAULT 'Cloud Atlas',
  enabled       BOOLEAN      NOT NULL DEFAULT true,
  priority      INTEGER      NOT NULL DEFAULT 100,
  weight        NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (weight >= 0 AND weight <= 1),
  config        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  risk_level    TEXT         NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  supported_timeframes TEXT[] NOT NULL DEFAULT ARRAY['1h'],
  supported_symbols    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  min_data_points      INTEGER NOT NULL DEFAULT 20,
  tags          TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, strategy_id)
);

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_strategies"
  ON public.strategies FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_role_manage_strategies"
  ON public.strategies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_strategies_user_enabled
  ON public.strategies (user_id, enabled);

-- ---------------------------------------------------------------------------
-- 2. strategy_versions — version history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strategy_versions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id   TEXT         NOT NULL,
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version       TEXT         NOT NULL,
  changelog     TEXT,
  config_snapshot JSONB      NOT NULL DEFAULT '{}'::jsonb,
  deployed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, strategy_id, version)
);

ALTER TABLE public.strategy_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_strategy_versions"
  ON public.strategy_versions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_role_manage_strategy_versions"
  ON public.strategy_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. strategy_results — individual signal outputs from each strategy run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strategy_results (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id     TEXT         NOT NULL,
  symbol          TEXT         NOT NULL,
  direction       TEXT         NOT NULL CHECK (direction IN ('long', 'short', 'close', 'hold')),
  strength        TEXT         NOT NULL CHECK (strength IN ('strong', 'moderate', 'weak')),
  confidence      NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  risk_score      NUMERIC(5,4) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
  position_size   NUMERIC(8,6),
  stop_loss       NUMERIC(14,4),
  take_profit     NUMERIC(14,4),
  entry_price     NUMERIC(14,4) NOT NULL,
  reasoning       TEXT,
  indicators      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  aggregation_method TEXT,
  was_aggregated  BOOLEAN      NOT NULL DEFAULT false,
  was_executed    BOOLEAN      NOT NULL DEFAULT false,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.strategy_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_strategy_results"
  ON public.strategy_results FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_role_manage_strategy_results"
  ON public.strategy_results FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_strategy_results_user_time
  ON public.strategy_results (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_strategy_results_strategy_symbol
  ON public.strategy_results (user_id, strategy_id, symbol, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. strategy_performance — aggregated performance metrics per strategy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strategy_performance (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id           TEXT         NOT NULL,
  total_signals         INTEGER      NOT NULL DEFAULT 0,
  profitable_signals    INTEGER      NOT NULL DEFAULT 0,
  unprofitable_signals  INTEGER      NOT NULL DEFAULT 0,
  win_rate              NUMERIC(5,4) DEFAULT 0,
  average_return        NUMERIC(8,4) DEFAULT 0,
  sharpe_ratio          NUMERIC(8,4),
  max_drawdown          NUMERIC(8,4) DEFAULT 0,
  average_holding_time  TEXT,
  total_pnl             NUMERIC(14,4) DEFAULT 0,
  best_trade_pnl        NUMERIC(14,4) DEFAULT 0,
  worst_trade_pnl       NUMERIC(14,4) DEFAULT 0,
  period_start          TIMESTAMPTZ,
  period_end            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, strategy_id)
);

ALTER TABLE public.strategy_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_strategy_performance"
  ON public.strategy_performance FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_role_manage_strategy_performance"
  ON public.strategy_performance FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. strategy_metrics — per-execution timing and health metrics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strategy_metrics (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id     TEXT         NOT NULL,
  pipeline_run_id UUID,
  latency_ms      INTEGER      NOT NULL,
  success         BOOLEAN      NOT NULL,
  error_message   TEXT,
  strategies_run  INTEGER      NOT NULL DEFAULT 1,
  signals_produced INTEGER     NOT NULL DEFAULT 0,
  aggregation_method TEXT,
  consensus_reached BOOLEAN,
  recorded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.strategy_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_strategy_metrics"
  ON public.strategy_metrics FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_role_manage_strategy_metrics"
  ON public.strategy_metrics FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_strategy_metrics_user_time
  ON public.strategy_metrics (user_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Seed built-in strategies for existing users
-- ---------------------------------------------------------------------------
-- Strategies are registered at runtime via StrategyRegistry. This seed data
-- provides dashboard visibility before the first pipeline run. The trading-bot
-- will upsert on startup.

COMMENT ON TABLE public.strategies IS
  'Registered trading strategy definitions. Each user can enable/disable '
  'strategies and adjust weights. Mirrors broker_accounts pattern.';

COMMENT ON TABLE public.strategy_results IS
  'Individual strategy signal outputs per run. Used for performance tracking '
  'and audit. Retention: 90 days recommended.';

COMMENT ON TABLE public.strategy_performance IS
  'Aggregated performance metrics per strategy per user. Updated after each '
  'trade is closed. Enables strategy comparison dashboard.';

COMMENT ON TABLE public.strategy_metrics IS
  'Per-execution timing and health metrics for the strategy pipeline. '
  'Used for monitoring strategy latency and error rates.';
