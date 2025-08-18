-- Phase 2: Database security hardening

-- Drop and recreate api_keys_secure_view with proper security
DROP VIEW IF EXISTS public.api_keys_secure_view CASCADE;

CREATE VIEW public.api_keys_secure_view 
WITH (security_invoker=true) AS
SELECT 
  id,
  user_id,
  exchange,
  is_active,
  created_at,
  updated_at,
  last_accessed,
  access_count,
  failed_attempts,
  locked_until,
  CASE 
    WHEN is_active = true AND (locked_until IS NULL OR locked_until < now()) THEN 'active'
    WHEN locked_until IS NOT NULL AND locked_until > now() THEN 'locked'
    ELSE 'inactive'
  END as security_status,
  CASE 
    WHEN is_active = true AND (locked_until IS NULL OR locked_until < now()) THEN '✅ Active'
    WHEN locked_until IS NOT NULL AND locked_until > now() THEN '🔒 Locked'
    ELSE '⏸️ Inactive'
  END as status_display
FROM public.api_keys;

-- Grant proper permissions
REVOKE ALL ON public.api_keys_secure_view FROM PUBLIC;
GRANT SELECT ON public.api_keys_secure_view TO authenticated;

-- Remove overly permissive RLS policy on ml_model_performance
DROP POLICY IF EXISTS "Authenticated users can manage ML model performance" ON public.ml_model_performance;

-- Create more restrictive policy (read-only for authenticated users)
CREATE POLICY "Authenticated users can read ML model performance" 
ON public.ml_model_performance 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- System can insert ML model performance data
CREATE POLICY "System can insert ML model performance" 
ON public.ml_model_performance 
FOR INSERT 
WITH CHECK (true);

-- Update SECURITY DEFINER functions to add ownership checks
CREATE OR REPLACE FUNCTION public.lock_api_key_on_failure(p_api_key_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  key_user_id UUID;
BEGIN
  -- Verify ownership
  SELECT user_id INTO key_user_id 
  FROM public.api_keys 
  WHERE id = p_api_key_id;
  
  IF key_user_id IS NULL THEN
    RAISE EXCEPTION 'API key not found';
  END IF;
  
  -- Only allow if called by system or the owner
  IF auth.uid() IS NOT NULL AND auth.uid() != key_user_id THEN
    RAISE EXCEPTION 'Access denied: can only lock own API keys';
  END IF;
  
  UPDATE public.api_keys
  SET 
    failed_attempts = failed_attempts + 1,
    locked_until = CASE 
      WHEN failed_attempts >= 5 THEN now() + INTERVAL '1 hour'
      ELSE locked_until
    END
  WHERE id = p_api_key_id;
  
  -- Log the security event
  PERFORM public.log_security_event(
    key_user_id,
    'API_KEY_FAILURE',
    'api_keys',
    NULL,
    NULL,
    false,
    jsonb_build_object('api_key_id', p_api_key_id, 'failed_attempts', 
      (SELECT failed_attempts FROM public.api_keys WHERE id = p_api_key_id))
  );
END;
$function$;

-- Update validate_api_key_access function to enforce ownership
CREATE OR REPLACE FUNCTION public.validate_api_key_access(p_user_id uuid, p_exchange text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  access_count INTEGER;
  window_start TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Verify the calling user matches the requested user
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Access denied: can only validate own API key access';
  END IF;
  
  -- Check rate limit (max 10 API key retrievals per hour per user)
  window_start := now() - INTERVAL '1 hour';
  
  SELECT COUNT(*) INTO access_count
  FROM public.security_audit_log
  WHERE user_id = p_user_id
    AND action = 'API_KEY_ACCESS'
    AND created_at > window_start;
  
  IF access_count >= 10 THEN
    -- Log the rate limit violation
    PERFORM public.log_security_event(
      p_user_id,
      'RATE_LIMIT_EXCEEDED',
      'api_keys',
      NULL,
      NULL,
      false,
      jsonb_build_object('exchange', p_exchange, 'attempts', access_count)
    );
    RETURN false;
  END IF;
  
  -- Log the API key access attempt
  PERFORM public.log_security_event(
    p_user_id,
    'API_KEY_ACCESS',
    'api_keys',
    NULL,
    NULL,
    true,
    jsonb_build_object('exchange', p_exchange)
  );
  
  RETURN true;
END;
$function$;