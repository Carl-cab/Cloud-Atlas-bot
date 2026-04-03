
-- 1) Deduplicate bot_config: keep the most recent per user
WITH ranked AS (
  SELECT
    id,
    user_id,
    updated_at,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM public.bot_config
)
DELETE FROM public.bot_config bc
USING ranked r
WHERE bc.id = r.id
  AND r.rn > 1;

-- 2) Enforce one bot_config row per user
ALTER TABLE public.bot_config
  ADD CONSTRAINT bot_config_user_unique UNIQUE (user_id);

-- 3) Keep updated_at fresh on update for bot_config
DROP TRIGGER IF EXISTS set_updated_at_bot_config ON public.bot_config;
CREATE TRIGGER set_updated_at_bot_config
BEFORE UPDATE ON public.bot_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Deduplicate risk_settings: keep the most recent per user
WITH ranked_rs AS (
  SELECT
    id,
    user_id,
    updated_at,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM public.risk_settings
)
DELETE FROM public.risk_settings rs
USING ranked_rs r
WHERE rs.id = r.id
  AND r.rn > 1;

-- 5) Enforce one risk_settings row per user
ALTER TABLE public.risk_settings
  ADD CONSTRAINT risk_settings_user_unique UNIQUE (user_id);

-- 6) Keep updated_at fresh on update for risk_settings
DROP TRIGGER IF EXISTS set_updated_at_risk_settings ON public.risk_settings;
CREATE TRIGGER set_updated_at_risk_settings
BEFORE UPDATE ON public.risk_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
