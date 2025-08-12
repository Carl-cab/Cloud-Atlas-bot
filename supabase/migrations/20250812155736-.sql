-- Create encryption system for API keys and secrets
-- This implements AES-256 encryption for sensitive data

-- Create encryption functions using built-in pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a secure function to generate encryption keys
CREATE OR REPLACE FUNCTION public.generate_encryption_key()
RETURNS TEXT AS $$
BEGIN
  -- Generate a random 256-bit encryption key
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create encryption function for API credentials
CREATE OR REPLACE FUNCTION public.encrypt_api_credential(credential TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  IF credential IS NULL OR credential = '' THEN
    RETURN NULL;
  END IF;
  
  -- Encrypt using AES-256 with the provided key
  RETURN encode(
    pgp_sym_encrypt(
      credential, 
      encryption_key,
      'compress-algo=1, cipher-algo=aes256'
    ), 
    'base64'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create decryption function for API credentials  
CREATE OR REPLACE FUNCTION public.decrypt_api_credential(encrypted_credential TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  IF encrypted_credential IS NULL OR encrypted_credential = '' THEN
    RETURN NULL;
  END IF;
  
  -- Decrypt using AES-256 with the provided key
  RETURN pgp_sym_decrypt(
    decode(encrypted_credential, 'base64'),
    encryption_key
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Return null if decryption fails to prevent errors
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create user encryption keys table
CREATE TABLE IF NOT EXISTS public.user_encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encryption_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on encryption keys table
ALTER TABLE public.user_encryption_keys ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for encryption keys (users can only access their own keys)
CREATE POLICY "Users can manage their own encryption keys"
ON public.user_encryption_keys
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create function to get or create user encryption key
CREATE OR REPLACE FUNCTION public.get_user_encryption_key(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  -- Try to get existing key
  SELECT user_encryption_keys.encryption_key INTO encryption_key
  FROM public.user_encryption_keys
  WHERE user_id = p_user_id;
  
  -- If no key exists, create one
  IF encryption_key IS NULL THEN
    encryption_key := public.generate_encryption_key();
    
    INSERT INTO public.user_encryption_keys (user_id, encryption_key)
    VALUES (p_user_id, encryption_key)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      encryption_key = EXCLUDED.encryption_key,
      updated_at = now();
  END IF;
  
  RETURN encryption_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to update encryption keys table timestamps
CREATE TRIGGER update_user_encryption_keys_updated_at
  BEFORE UPDATE ON public.user_encryption_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update api_keys table to use encrypted storage
-- First backup existing data temporarily
CREATE TEMP TABLE api_keys_backup AS 
SELECT * FROM public.api_keys;

-- Add new encrypted columns and update the table structure
ALTER TABLE public.api_keys 
ADD COLUMN IF NOT EXISTS encrypted_api_key TEXT,
ADD COLUMN IF NOT EXISTS encrypted_api_secret TEXT,  
ADD COLUMN IF NOT EXISTS encrypted_passphrase TEXT;

-- Update encryption_key_id to be NOT NULL for new records
-- (existing records will be migrated separately)

-- Create function to securely store API credentials
CREATE OR REPLACE FUNCTION public.store_api_credentials(
  p_user_id UUID,
  p_exchange TEXT,
  p_api_key TEXT,
  p_api_secret TEXT,
  p_passphrase TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  encryption_key TEXT;
  new_api_key_id UUID;
BEGIN
  -- Get or create encryption key for user
  encryption_key := public.get_user_encryption_key(p_user_id);
  
  -- Insert encrypted API credentials
  INSERT INTO public.api_keys (
    user_id,
    exchange,
    encrypted_api_key,
    encrypted_api_secret,
    encrypted_passphrase,
    encryption_key_id,
    is_active
  ) VALUES (
    p_user_id,
    p_exchange,
    public.encrypt_api_credential(p_api_key, encryption_key),
    public.encrypt_api_credential(p_api_secret, encryption_key),
    public.encrypt_api_credential(p_passphrase, encryption_key),
    'user_key',
    true
  ) RETURNING id INTO new_api_key_id;
  
  RETURN new_api_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to retrieve decrypted API credentials (for authorized access only)
CREATE OR REPLACE FUNCTION public.get_api_credentials(p_api_key_id UUID, p_user_id UUID)
RETURNS TABLE(
  exchange TEXT,
  api_key TEXT,
  api_secret TEXT,
  passphrase TEXT,
  is_active BOOLEAN
) AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  -- Verify user owns this API key
  IF NOT EXISTS (
    SELECT 1 FROM public.api_keys 
    WHERE id = p_api_key_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized access to API credentials';
  END IF;
  
  -- Get user's encryption key
  encryption_key := public.get_user_encryption_key(p_user_id);
  
  -- Return decrypted credentials
  RETURN QUERY
  SELECT 
    ak.exchange,
    public.decrypt_api_credential(ak.encrypted_api_key, encryption_key),
    public.decrypt_api_credential(ak.encrypted_api_secret, encryption_key),
    public.decrypt_api_credential(ak.encrypted_passphrase, encryption_key),
    ak.is_active
  FROM public.api_keys ak
  WHERE ak.id = p_api_key_id AND ak.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create view for safe API key listing (without exposing secrets)
CREATE OR REPLACE VIEW public.api_keys_safe AS
SELECT 
  id,
  user_id,
  exchange,
  CASE 
    WHEN encrypted_api_key IS NOT NULL THEN 
      CONCAT(LEFT(exchange, 2), '***', RIGHT(id::text, 4))
    ELSE 'Not encrypted'
  END as masked_api_key,
  is_active,
  created_at,
  updated_at,
  last_used,
  usage_count,
  encryption_key_id
FROM public.api_keys;

-- Enable RLS on the safe view
ALTER VIEW public.api_keys_safe SET (security_barrier = true);

-- Create RLS policy for safe view
DROP POLICY IF EXISTS "Users can view their own API keys" ON public.api_keys;
CREATE POLICY "Users can view their own API keys safe"
ON public.api_keys_safe
FOR SELECT
USING (auth.uid() = user_id);

-- Update existing RLS policy to prevent direct access to sensitive columns
DROP POLICY IF EXISTS "Users can manage their own API keys" ON public.api_keys;

-- Create restrictive policies for the main api_keys table
CREATE POLICY "Users can insert their own API keys"
ON public.api_keys
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys status"
ON public.api_keys  
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys"
ON public.api_keys
FOR DELETE
USING (auth.uid() = user_id);

-- Block direct SELECT access to force use of safe functions
CREATE POLICY "Block direct access to API keys"
ON public.api_keys
FOR SELECT
USING (false);