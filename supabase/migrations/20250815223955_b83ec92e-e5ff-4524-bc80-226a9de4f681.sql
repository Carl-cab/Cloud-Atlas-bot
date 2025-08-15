
-- Fix read-only error on SELECT by removing side-effecting function from RLS

-- Drop the existing SELECT policy that calls validate_api_key_access (which writes logs)
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;

-- Recreate a pure read-only SELECT policy
CREATE POLICY "Users can view their own API keys"
  ON public.api_keys
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND (locked_until IS NULL OR locked_until < now())
  );
