-- Fix critical security vulnerability: Implement field-level encryption for API credentials
-- Enable pgcrypto extension for secure encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a secure encryption key management system
-- In production, this should use proper key management service
CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    master_key TEXT;
BEGIN
    -- In production, this should retrieve from a secure key management service
    -- For now, we'll use a combination of database secrets
    master_key := encode(digest('cloudatlas_master_key_' || current_setting('app.jwt_secret', true), 'sha256'), 'hex');
    RETURN master_key;
END;
$$;

-- Create secure encryption function using AES
CREATE OR REPLACE FUNCTION public.encrypt_credential(credential TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    encryption_key TEXT;
    encrypted_data TEXT;
BEGIN
    IF credential IS NULL OR credential = '' THEN
        RETURN NULL;
    END IF;
    
    encryption_key := public.get_encryption_key();
    -- Use AES encryption with the master key
    encrypted_data := encode(pgp_sym_encrypt(credential, encryption_key), 'base64');
    
    RETURN encrypted_data;
END;
$$;

-- Create secure decryption function
CREATE OR REPLACE FUNCTION public.decrypt_credential(encrypted_credential TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    encryption_key TEXT;
    decrypted_data TEXT;
BEGIN
    IF encrypted_credential IS NULL OR encrypted_credential = '' THEN
        RETURN NULL;
    END IF;
    
    encryption_key := public.get_encryption_key();
    -- Decrypt using AES
    decrypted_data := pgp_sym_decrypt(decode(encrypted_credential, 'base64'), encryption_key);
    
    RETURN decrypted_data;
EXCEPTION
    WHEN OTHERS THEN
        -- Log decryption failure for security monitoring
        PERFORM public.log_security_event(
            auth.uid(),
            'DECRYPTION_FAILURE',
            'api_keys',
            NULL,
            NULL,
            false,
            jsonb_build_object('error', SQLERRM)
        );
        RETURN NULL;
END;
$$;

-- Update the get_api_credentials function to handle encrypted data
CREATE OR REPLACE FUNCTION public.get_api_credentials(p_exchange text)
RETURNS TABLE(api_key text, api_secret text, passphrase text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get current user ID
  user_uuid := auth.uid();
  
  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Validate access with rate limiting
  IF NOT public.validate_api_key_access(user_uuid, p_exchange) THEN
    RAISE EXCEPTION 'Rate limit exceeded for API key access';
  END IF;
  
  -- Return decrypted credentials for active, non-locked keys only
  RETURN QUERY
  SELECT 
    public.decrypt_credential(ak.api_key) as api_key,
    public.decrypt_credential(ak.api_secret) as api_secret,
    public.decrypt_credential(ak.passphrase) as passphrase,
    ak.is_active
  FROM public.api_keys ak
  WHERE ak.user_id = user_uuid
    AND ak.exchange = p_exchange
    AND ak.is_active = true
    AND (ak.locked_until IS NULL OR ak.locked_until < now())
  LIMIT 1;
END;
$function$;

-- Create a function to safely store encrypted API credentials
CREATE OR REPLACE FUNCTION public.store_api_credentials(
    p_exchange TEXT,
    p_api_key TEXT,
    p_api_secret TEXT,
    p_passphrase TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_uuid UUID;
    credential_id UUID;
BEGIN
    user_uuid := auth.uid();
    
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    -- Log the credential storage attempt
    PERFORM public.log_security_event(
        user_uuid,
        'API_CREDENTIAL_STORE',
        'api_keys',
        NULL,
        NULL,
        true,
        jsonb_build_object('exchange', p_exchange)
    );
    
    -- Insert encrypted credentials
    INSERT INTO public.api_keys (
        user_id,
        exchange,
        api_key,
        api_secret,
        passphrase,
        is_active,
        encryption_key_id
    ) VALUES (
        user_uuid,
        p_exchange,
        public.encrypt_credential(p_api_key),
        public.encrypt_credential(p_api_secret),
        public.encrypt_credential(p_passphrase),
        true,
        'aes_pgcrypto_v1'
    )
    ON CONFLICT (user_id, exchange) 
    DO UPDATE SET
        api_key = public.encrypt_credential(p_api_key),
        api_secret = public.encrypt_credential(p_api_secret),
        passphrase = public.encrypt_credential(p_passphrase),
        updated_at = now(),
        encryption_key_id = 'aes_pgcrypto_v1'
    RETURNING id INTO credential_id;
    
    RETURN credential_id;
END;
$$;

-- Add a unique constraint to prevent duplicate credentials per user/exchange
ALTER TABLE public.api_keys 
ADD CONSTRAINT unique_user_exchange 
UNIQUE (user_id, exchange);

-- Update existing unencrypted data (if any exists)
-- This will encrypt any existing plain text credentials
UPDATE public.api_keys 
SET 
    api_key = public.encrypt_credential(api_key),
    api_secret = public.encrypt_credential(api_secret),
    passphrase = public.encrypt_credential(passphrase),
    encryption_key_id = 'aes_pgcrypto_v1',
    updated_at = now()
WHERE encryption_key_id IS NULL OR encryption_key_id = '';

-- Create an audit trigger for API key access
CREATE OR REPLACE FUNCTION public.audit_api_key_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Log any access to encrypted credentials
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
            WHEN TG_OP = 'INSERT' THEN 'ENCRYPTED_STORE'
            WHEN TG_OP = 'UPDATE' THEN 'ENCRYPTED_UPDATE'
            ELSE 'ENCRYPTED_ACCESS'
        END,
        NEW.exchange,
        jsonb_build_object(
            'operation', TG_OP,
            'encryption_key_id', NEW.encryption_key_id,
            'timestamp', now()
        )
    );
    
    RETURN NEW;
END;
$$;

-- Create the audit trigger
DROP TRIGGER IF EXISTS audit_encrypted_api_keys ON public.api_keys;
CREATE TRIGGER audit_encrypted_api_keys
    AFTER INSERT OR UPDATE ON public.api_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_api_key_access();