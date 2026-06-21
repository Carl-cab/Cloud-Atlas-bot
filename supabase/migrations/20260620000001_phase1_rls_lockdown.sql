-- =============================================================================
-- PHASE 1 SECURITY: RLS Policy Lockdown
-- Drops all remaining permissive USING(true) / WITH CHECK(true) policies and
-- replaces them with properly scoped alternatives.
--
-- Remediation categories:
--   A. Public write access on ML tables  → service_role only
--   B. Public read on market/ML data     → require auth.uid() IS NOT NULL
--   C. System tables (cache, health)     → service_role only
--   D. Audit log INSERT WITH CHECK(true) → service_role only
--   E. rate_limit_entries (belt+suspenders) → already fixed, re-assert
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. ML TABLES: Remove public INSERT / ALL access
-- ---------------------------------------------------------------------------

-- ml_trading_signals: already partially fixed in 20250812154301-.sql
-- Belt-and-suspenders: drop any remaining public insert policy
DROP POLICY IF EXISTS "Allow public insert to ML trading signals" ON public.ml_trading_signals;
DROP POLICY IF EXISTS "Authenticated users can insert ML trading signals" ON public.ml_trading_signals;

-- New policy: only the service role (edge functions) may write ML signals
CREATE POLICY "Service role can insert ML trading signals"
ON public.ml_trading_signals
FOR INSERT
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);

-- ml_model_performance: remove ALL WITH CHECK(true)
DROP POLICY IF EXISTS "Allow public insert/update to ML model performance" ON public.ml_model_performance;
DROP POLICY IF EXISTS "Authenticated users can manage ML model performance" ON public.ml_model_performance;

CREATE POLICY "Service role can manage ML model performance"
ON public.ml_model_performance
FOR ALL
USING (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
)
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);

-- ml_feature_importance: remove public insert
DROP POLICY IF EXISTS "Allow public insert to ML feature importance" ON public.ml_feature_importance;
DROP POLICY IF EXISTS "Authenticated users can insert ML feature importance" ON public.ml_feature_importance;

CREATE POLICY "Service role can insert ML feature importance"
ON public.ml_feature_importance
FOR INSERT
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);

-- ---------------------------------------------------------------------------
-- B. PUBLIC READ ON MARKET / ML DATA: Require authentication
-- ---------------------------------------------------------------------------

-- market_data: drop all public SELECT policies; require auth
DROP POLICY IF EXISTS "Market data is publicly readable" ON public.market_data;
DROP POLICY IF EXISTS "Market data is viewable by everyone" ON public.market_data;

CREATE POLICY "Authenticated users can read market data"
ON public.market_data
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- market_regimes / market_regime: drop public SELECT
DROP POLICY IF EXISTS "Market regimes are publicly readable" ON public.market_regimes;
DROP POLICY IF EXISTS "Market regime is viewable by everyone" ON public.market_regime;

CREATE POLICY "Authenticated users can read market regimes"
ON public.market_regimes
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read market regime"
ON public.market_regime
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- strategy_signals: drop public SELECT
DROP POLICY IF EXISTS "Strategy signals are publicly readable" ON public.strategy_signals;

CREATE POLICY "Authenticated users can read strategy signals"
ON public.strategy_signals
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ml_models: drop public SELECT
DROP POLICY IF EXISTS "ML models are publicly readable" ON public.ml_models;

CREATE POLICY "Authenticated users can read ML models"
ON public.ml_models
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ml_trading_signals: drop public SELECT
DROP POLICY IF EXISTS "Allow public read access to ML trading signals" ON public.ml_trading_signals;

CREATE POLICY "Authenticated users can read ML trading signals"
ON public.ml_trading_signals
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ml_model_performance: drop public SELECT and the WITH CHECK(true) SELECT
DROP POLICY IF EXISTS "Allow public read access to ML model performance" ON public.ml_model_performance;
DROP POLICY IF EXISTS "Authenticated users can read ML model performance" ON public.ml_model_performance;

CREATE POLICY "Authenticated users can read ML model performance"
ON public.ml_model_performance
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ml_feature_importance: drop public SELECT
DROP POLICY IF EXISTS "Allow public read access to ML feature importance" ON public.ml_feature_importance;

CREATE POLICY "Authenticated users can read ML feature importance"
ON public.ml_feature_importance
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- technical_indicators: drop public SELECT
DROP POLICY IF EXISTS "Technical indicators are viewable by everyone" ON public.technical_indicators;
DROP POLICY IF EXISTS "Technical indicators are publicly readable" ON public.technical_indicators;

CREATE POLICY "Authenticated users can read technical indicators"
ON public.technical_indicators
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- C. SYSTEM / CACHE TABLES: Restrict to service_role only
-- ---------------------------------------------------------------------------

-- market_data_cache: drop ALL USING(true) — system-only table
DROP POLICY IF EXISTS "Market data cache is publicly readable" ON public.market_data_cache;
DROP POLICY IF EXISTS "System can manage market data cache" ON public.market_data_cache;

CREATE POLICY "Service role can manage market data cache"
ON public.market_data_cache
FOR ALL
USING (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
)
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);

-- system_health: already fixed in 20250812154301-.sql; belt-and-suspenders
DROP POLICY IF EXISTS "System can insert health checks" ON public.system_health;

CREATE POLICY "Service role can insert health checks"
ON public.system_health
FOR INSERT
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);

-- ---------------------------------------------------------------------------
-- D. AUDIT LOG INSERT: Restrict to service_role only
-- ---------------------------------------------------------------------------

-- security_audit_log: INSERT WITH CHECK(true) allows anyone to write audit entries
DROP POLICY IF EXISTS "System can insert audit logs" ON public.security_audit_log;

CREATE POLICY "Service role can insert audit logs"
ON public.security_audit_log
FOR INSERT
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);

-- api_key_audit: SELECT WITH CHECK(true) is a misconfigured policy (CHECK on SELECT)
DROP POLICY IF EXISTS "Users can view their own API key audit logs" ON public.api_key_audit;

CREATE POLICY "Users can view their own API key audit logs"
ON public.api_key_audit
FOR SELECT
USING (auth.uid() = user_id);

-- api_key_security_audit: SELECT WITH CHECK(true) — same issue
DROP POLICY IF EXISTS "Users can view own API key security audit" ON public.api_key_security_audit;

CREATE POLICY "Users can view own API key security audit"
ON public.api_key_security_audit
FOR SELECT
USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- E. RATE LIMIT ENTRIES: Belt-and-suspenders re-assertion
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "System only can manage rate limit entries" ON public.rate_limit_entries;
DROP POLICY IF EXISTS "Service role can manage rate limit entries" ON public.rate_limit_entries;

-- rate_limit_entries is a pure system table; no user should ever read or write it
CREATE POLICY "Service role only can manage rate limit entries"
ON public.rate_limit_entries
FOR ALL
USING (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
)
WITH CHECK (
  (SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
);

-- ---------------------------------------------------------------------------
-- F. NOTIFICATION_SETTINGS: Fix SELECT WITH CHECK(true) — wrong clause type
-- ---------------------------------------------------------------------------

-- The original policy used WITH CHECK on a SELECT, which has no effect in
-- PostgreSQL but signals a misunderstanding. Recreate as USING.
DROP POLICY IF EXISTS "Users can view their own notification settings" ON public.notification_settings;

CREATE POLICY "Users can view their own notification settings"
ON public.notification_settings
FOR SELECT
USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- G. API_RATE_LIMITS: SELECT USING(true) — restrict to owner
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view their own rate limits" ON public.api_rate_limits;

CREATE POLICY "Users can view their own rate limits"
ON public.api_rate_limits
FOR SELECT
USING (auth.uid() = user_id);
