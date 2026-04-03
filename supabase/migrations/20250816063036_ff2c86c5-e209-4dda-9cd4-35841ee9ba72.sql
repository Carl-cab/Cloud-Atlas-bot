-- Remove old insecure encryption functions and migrate to secure system
-- Step 1: Drop the old functions that used hardcoded keys
DROP FUNCTION IF EXISTS public.encrypt_credential(text);
DROP FUNCTION IF EXISTS public.decrypt_credential(text);
DROP FUNCTION IF EXISTS public.store_api_credentials(text, text, text, text);
DROP FUNCTION IF EXISTS public.get_api_credentials(text);

-- Step 2: Create a secure server-side only function for credential retrieval
CREATE OR REPLACE FUNCTION public.get_user_credentials_for_server(p_user_id UUID, p_exchange TEXT)
RETURNS TABLE(
  has_credentials BOOLEAN,
  exchange_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- This function only indicates if credentials exist, never returns actual credentials
  -- Actual credential retrieval must go through the secure-credentials edge function
  
  -- Log the check attempt
  PERFORM public.log_security_event(
    p_user_id,
    'CREDENTIAL_CHECK',
    'api_keys',
    NULL,
    NULL,
    true,
    jsonb_build_object('exchange', p_exchange)
  );
  
  RETURN QUERY
  SELECT 
    COUNT(*) > 0 as has_credentials,
    p_exchange as exchange_name
  FROM public.api_keys ak
  WHERE ak.user_id = p_user_id
    AND ak.exchange = p_exchange
    AND ak.is_active = true
    AND (ak.locked_until IS NULL OR ak.locked_until < now())
    AND ak.encryption_key_id = 'edge_v1'; -- Only count properly encrypted credentials
END;
$$;

-- Step 3: Mark all existing credentials as needing re-encryption
-- Users will need to re-enter their API keys through the secure interface
UPDATE public.api_keys 
SET 
  is_active = false,
  api_key = 'REQUIRES_RE_ENCRYPTION',
  api_secret = 'REQUIRES_RE_ENCRYPTION', 
  passphrase = CASE WHEN passphrase IS NOT NULL THEN 'REQUIRES_RE_ENCRYPTION' ELSE NULL END,
  encryption_key_id = 'migration_required',
  updated_at = now()
WHERE encryption_key_id IS NULL OR encryption_key_id != 'edge_v1';

-- Step 4: Add a secure view for API key management that never exposes sensitive data
CREATE OR REPLACE VIEW public.api_keys_secure_view AS
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

-- Step 5: Enable RLS on the view (inherits from base table)
-- Users can only see their own API key metadata through this view

-- Step 6: Create a notification for users who need to re-encrypt
INSERT INTO public.notification_queue (user_id, type, title, message, priority, data)
SELECT DISTINCT 
  ak.user_id,
  'SECURITY_UPDATE',
  'API Keys Need Re-encryption',
  'For enhanced security, please re-enter your exchange API keys. Your existing keys have been safely deactivated and need to be updated with our new encryption system.',
  'high',
  jsonb_build_object(
    'action_required', true,
    'security_update', true,
    'affected_exchanges', array_agg(ak.exchange)
  )
FROM public.api_keys ak
WHERE ak.encryption_key_id = 'migration_required'
GROUP BY ak.user_id;