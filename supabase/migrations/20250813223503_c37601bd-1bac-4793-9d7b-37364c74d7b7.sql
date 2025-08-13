-- Fix search path security issues in the newly created functions

-- Update encrypt_api_credential function with secure search path
CREATE OR REPLACE FUNCTION public.encrypt_api_credential(credential TEXT, user_salt TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Simple encryption using pgcrypto - in production, use proper key management
  RETURN encode(digest(credential || user_salt || current_setting('app.encryption_secret', true), 'sha256'), 'base64');
END;
$$;

-- Update validate_api_key_access function with secure search path
CREATE OR REPLACE FUNCTION public.validate_api_key_access(p_user_id UUID, p_exchange TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  access_count INTEGER;
  window_start TIMESTAMP WITH TIME ZONE;
BEGIN
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
$$;

-- Update log_api_key_usage function with secure search path
CREATE OR REPLACE FUNCTION public.log_api_key_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Insert audit record when API key is accessed
  INSERT INTO public.api_key_audit (
    user_id,
    api_key_id,
    action,
    exchange,
    details
  ) VALUES (
    NEW.user_id,
    NEW.id,
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'CREATED'
      WHEN TG_OP = 'UPDATE' AND OLD.is_active != NEW.is_active THEN 
        CASE WHEN NEW.is_active THEN 'ENABLED' ELSE 'DISABLED' END
      ELSE 'ACCESSED'
    END,
    NEW.exchange,
    jsonb_build_object(
      'operation', TG_OP,
      'is_active', NEW.is_active,
      'timestamp', now()
    )
  );
  
  RETURN NEW;
END;
$$;

-- Update get_api_credentials function with secure search path
CREATE OR REPLACE FUNCTION public.get_api_credentials(p_exchange TEXT)
RETURNS TABLE(
  api_key TEXT,
  api_secret TEXT,
  passphrase TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get current user ID
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Validate access
  IF NOT public.validate_api_key_access(user_uuid, p_exchange) THEN
    RAISE EXCEPTION 'Rate limit exceeded for API key access';
  END IF;
  
  -- Return credentials for active, non-locked keys only
  RETURN QUERY
  SELECT 
    ak.api_key,
    ak.api_secret,
    ak.passphrase,
    ak.is_active
  FROM public.api_keys ak
  WHERE ak.user_id = user_uuid
    AND ak.exchange = p_exchange
    AND ak.is_active = true
    AND (ak.locked_until IS NULL OR ak.locked_until < now())
  LIMIT 1;
END;
$$;

-- Update lock_api_key_on_failure function with secure search path
CREATE OR REPLACE FUNCTION public.lock_api_key_on_failure(p_api_key_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
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
    (SELECT user_id FROM public.api_keys WHERE id = p_api_key_id),
    'API_KEY_FAILURE',
    'api_keys',
    NULL,
    NULL,
    false,
    jsonb_build_object('api_key_id', p_api_key_id, 'failed_attempts', 
      (SELECT failed_attempts FROM public.api_keys WHERE id = p_api_key_id))
  );
END;
$$;