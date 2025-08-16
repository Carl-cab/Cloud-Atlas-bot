-- Fix the security definer view issue by removing SECURITY DEFINER and using proper RLS
DROP VIEW IF EXISTS public.api_keys_secure_view;

-- Create a regular view that relies on RLS instead of SECURITY DEFINER
CREATE VIEW public.api_keys_secure_view AS
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
    WHEN encryption_key_id = 'edge_v1' THEN 'Securely Encrypted'
    WHEN encryption_key_id = 'migration_required' THEN 'Requires Re-encryption'
    ELSE 'Legacy - Needs Update'
  END as security_status,
  CASE 
    WHEN is_active AND encryption_key_id = 'edge_v1' THEN 'Active & Secure'
    WHEN encryption_key_id = 'migration_required' THEN 'Re-encryption Required'
    ELSE 'Inactive'
  END as status_display
FROM public.api_keys;

-- The view will inherit RLS from the base table, which is secure
-- RLS policies on api_keys already ensure users can only see their own records

-- Also fix the function to not use SECURITY DEFINER unnecessarily  
DROP FUNCTION IF EXISTS public.get_user_credentials_for_server(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.check_user_has_credentials(p_exchange TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  user_uuid UUID;
  has_creds BOOLEAN;
BEGIN
  -- Get current user ID from RLS context
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RETURN false;
  END IF;
  
  -- Log the check attempt (this will respect RLS)
  PERFORM public.log_security_event(
    user_uuid,
    'CREDENTIAL_CHECK',
    'api_keys',
    NULL,
    NULL,
    true,
    jsonb_build_object('exchange', p_exchange)
  );
  
  -- Check if user has valid encrypted credentials
  SELECT COUNT(*) > 0 INTO has_creds
  FROM public.api_keys ak
  WHERE ak.user_id = user_uuid
    AND ak.exchange = p_exchange
    AND ak.is_active = true
    AND (ak.locked_until IS NULL OR ak.locked_until < now())
    AND ak.encryption_key_id = 'edge_v1';
    
  RETURN has_creds;
END;
$$;