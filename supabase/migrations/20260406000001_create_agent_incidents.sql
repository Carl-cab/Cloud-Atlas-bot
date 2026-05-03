-- Migration: agent_incidents — tracks automated monitoring incidents

CREATE TABLE IF NOT EXISTS public.agent_incidents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source         TEXT        NOT NULL,
  severity       TEXT        NOT NULL,
  incident_type  TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  description    TEXT,
  context        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT        NOT NULL DEFAULT 'open',
  action_taken   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_incidents_user_id     ON public.agent_incidents (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_incidents_status      ON public.agent_incidents (status);
CREATE INDEX IF NOT EXISTS idx_agent_incidents_severity    ON public.agent_incidents (severity);
CREATE INDEX IF NOT EXISTS idx_agent_incidents_detected_at ON public.agent_incidents (detected_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_agent_incidents ON public.agent_incidents;
CREATE TRIGGER set_updated_at_agent_incidents
  BEFORE UPDATE ON public.agent_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_incidents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_incidents'
      AND policyname = 'Users can view their own incidents'
  ) THEN
    CREATE POLICY "Users can view their own incidents"
      ON public.agent_incidents FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_incidents'
      AND policyname = 'System can insert incidents'
  ) THEN
    CREATE POLICY "System can insert incidents"
      ON public.agent_incidents FOR INSERT
      WITH CHECK (auth.role() = 'service_role' OR auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_incidents'
      AND policyname = 'Users can update their own incidents'
  ) THEN
    CREATE POLICY "Users can update their own incidents"
      ON public.agent_incidents FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_incidents'
      AND policyname = 'Service role can delete incidents'
  ) THEN
    CREATE POLICY "Service role can delete incidents"
      ON public.agent_incidents FOR DELETE
      USING (auth.role() = 'service_role');
  END IF;
END$$;

COMMENT ON TABLE public.agent_incidents IS 'Incidents detected by the automated monitoring agent';
