-- Enhanced API Key Security: Database-level encryption validation and audit triggers

-- Phase 1: Add encryption validation constraints
ALTER TABLE public.api_keys 
ADD CONSTRAINT api_key_encrypted_check 
CHECK (
  (api_key IS NULL OR api_key = '') OR 
  (LENGTH(api_key) >= 40 AND api_key ~ '^[A-Za-z0-9+/]+=*$')
);

ALTER TABLE public.api_keys 
ADD CONSTRAINT api_secret_encrypted_check 
CHECK (
  (api_secret IS NULL OR api_secret = '') OR 
  (LENGTH(api_secret) >= 40 AND api_secret ~ '^[A-Za-z0-9+/]+=*$')
);

-- Add encryption metadata tracking
ALTER TABLE public.api_keys 
ADD COLUMN IF NOT EXISTS encryption_version TEXT DEFAULT 'v2';

ALTER TABLE public.api_keys 
ADD COLUMN IF NOT EXISTS key_fingerprint TEXT;

-- Phase 2: Create secure API key audit table
CREATE TABLE IF NOT EXISTS public.api_key_security_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_key_id UUID,
  action TEXT NOT NULL,
  encryption_status TEXT NOT NULL,
  security_level TEXT NOT NULL,
  audit_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on audit table
ALTER TABLE public.api_key_security_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own security audit logs
CREATE POLICY "Users can view own API key security audit" 
ON public.api_key_security_audit 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: System can insert audit records
CREATE POLICY "System can insert API key security audit" 
ON public.api_key_security_audit 
FOR INSERT 
WITH CHECK (true);

-- Phase 3: Create enhanced security functions

-- Function to validate encryption quality
CREATE OR REPLACE FUNCTION public.validate_api_key_encryption(
  encrypted_data TEXT,
  encryption_version TEXT DEFAULT 'v2'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Check if data appears to be properly encrypted
  IF encrypted_data IS NULL OR encrypted_data = '' THEN
    RETURN true; -- Allow empty values
  END IF;
  
  -- Validate encryption format and minimum security requirements
  IF LENGTH(encrypted_data) < 40 THEN
    RETURN false; -- Too short to be properly encrypted
  END IF;
  
  IF NOT (encrypted_data ~ '^[A-Za-z0-9+/]+=*$') THEN
    RETURN false; -- Not base64 encoded
  END IF;
  
  -- Additional version-specific validation
  CASE encryption_version
    WHEN 'v2' THEN
      -- v2 should be at least 60 characters for proper AES-GCM + IV
      RETURN LENGTH(encrypted_data) >= 60;
    WHEN 'edge_v1' THEN
      -- Legacy validation
      RETURN LENGTH(encrypted_data) >= 40;
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- Function to create key fingerprint (for key rotation tracking)
CREATE OR REPLACE FUNCTION public.create_key_fingerprint(
  user_id_input UUID,
  exchange_input TEXT,
  encryption_version_input TEXT DEFAULT 'v2'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Create a non-reversible fingerprint for tracking key versions
  RETURN encode(
    digest(
      user_id_input::text || ':' || 
      exchange_input || ':' || 
      encryption_version_input || ':' || 
      extract(epoch from now())::text,
      'sha256'
    ),
    'base64'
  );
END;
$$;

-- Enhanced audit logging function
CREATE OR REPLACE FUNCTION public.log_api_key_security_event(
  p_user_id UUID,
  p_api_key_id UUID,
  p_action TEXT,
  p_encryption_status TEXT,
  p_security_level TEXT DEFAULT 'STANDARD',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO public.api_key_security_audit (
    user_id,
    api_key_id,
    action,
    encryption_status,
    security_level,
    metadata,
    audit_timestamp
  ) VALUES (
    p_user_id,
    p_api_key_id,
    p_action,
    p_encryption_status,
    p_security_level,
    p_metadata,
    now()
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$;

-- Phase 4: Create trigger for enhanced API key security validation
CREATE OR REPLACE FUNCTION public.api_key_security_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  fingerprint TEXT;
BEGIN
  -- Validate encryption on INSERT/UPDATE
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    -- Validate API key encryption
    IF NOT public.validate_api_key_encryption(NEW.api_key, NEW.encryption_version) THEN
      RAISE EXCEPTION 'API key does not meet encryption security standards';
    END IF;
    
    -- Validate API secret encryption  
    IF NOT public.validate_api_key_encryption(NEW.api_secret, NEW.encryption_version) THEN
      RAISE EXCEPTION 'API secret does not meet encryption security standards';
    END IF;
    
    -- Validate passphrase encryption if present
    IF NEW.passphrase IS NOT NULL AND NEW.passphrase != '' THEN
      IF NOT public.validate_api_key_encryption(NEW.passphrase, NEW.encryption_version) THEN
        RAISE EXCEPTION 'API passphrase does not meet encryption security standards';
      END IF;
    END IF;
    
    -- Generate key fingerprint for tracking
    NEW.key_fingerprint := public.create_key_fingerprint(
      NEW.user_id, 
      NEW.exchange, 
      NEW.encryption_version
    );
    
    -- Log security event
    PERFORM public.log_api_key_security_event(
      NEW.user_id,
      NEW.id,
      CASE TG_OP WHEN 'INSERT' THEN 'KEY_ENCRYPTED_STORED' ELSE 'KEY_ENCRYPTED_UPDATED' END,
      'VALIDATED_ENCRYPTED',
      'HIGH',
      jsonb_build_object(
        'exchange', NEW.exchange,
        'encryption_version', NEW.encryption_version,
        'has_passphrase', (NEW.passphrase IS NOT NULL AND NEW.passphrase != ''),
        'fingerprint', NEW.key_fingerprint
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS api_key_security_validation_trigger ON public.api_keys;
CREATE TRIGGER api_key_security_validation_trigger
  BEFORE INSERT OR UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.api_key_security_trigger();

-- Phase 5: Create view for secure API key metadata (no sensitive data)
CREATE OR REPLACE VIEW public.api_keys_security_status 
WITH (security_invoker=true) AS
SELECT 
  id,
  user_id,
  exchange,
  is_active,
  encryption_version,
  key_fingerprint,
  created_at,
  updated_at,
  last_accessed,
  access_count,
  failed_attempts,
  locked_until,
  CASE 
    WHEN encryption_version = 'v2' THEN 'ENHANCED_ENCRYPTION'
    WHEN encryption_version = 'edge_v1' THEN 'LEGACY_ENCRYPTION'
    ELSE 'UNKNOWN_ENCRYPTION'
  END as encryption_status,
  CASE 
    WHEN is_active = true AND (locked_until IS NULL OR locked_until < now()) 
         AND encryption_version = 'v2' THEN '🔒 Highly Secure'
    WHEN is_active = true AND (locked_until IS NULL OR locked_until < now()) THEN '🔐 Secure'
    WHEN locked_until IS NOT NULL AND locked_until > now() THEN '⛔ Locked'
    ELSE '💤 Inactive'
  END as security_display,
  -- Security score (0-100)
  CASE 
    WHEN NOT is_active THEN 0
    WHEN locked_until IS NOT NULL AND locked_until > now() THEN 0
    WHEN encryption_version = 'v2' AND failed_attempts = 0 THEN 100
    WHEN encryption_version = 'v2' THEN 90 - (failed_attempts * 10)
    WHEN encryption_version = 'edge_v1' AND failed_attempts = 0 THEN 80
    ELSE 70 - (failed_attempts * 10)
  END as security_score
FROM public.api_keys;

-- Grant permissions
REVOKE ALL ON public.api_keys_security_status FROM PUBLIC;
GRANT SELECT ON public.api_keys_security_status TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.api_key_security_audit IS 'Audit trail for API key security events and encryption validation';
COMMENT ON VIEW public.api_keys_security_status IS 'Secure view of API key metadata without exposing encrypted credentials';