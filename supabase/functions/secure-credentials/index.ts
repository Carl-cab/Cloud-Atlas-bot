import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY')!;

class SecureCredentialManager {
  private supabase;
  private readonly rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  // Enhanced rate limiting per user
  private checkRateLimit(userId: string, maxRequests = 10, windowMs = 3600000): boolean {
    const key = `credentials_${userId}`;
    const now = Date.now();
    const limit = this.rateLimitMap.get(key);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }
    
    if (limit.count >= maxRequests) {
      return false;
    }
    
    limit.count++;
    return true;
  }

  // Derive cryptographic key using HKDF
  private async deriveKey(salt: string): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(ENCRYPTION_KEY),
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(salt),
        info: new TextEncoder().encode('api-credential-encryption')
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Enhanced encryption with AAD (Additional Authenticated Data)
  private async encrypt(data: string, userId: string, exchange: string): Promise<string> {
    if (!data || data === '') return '';
    
    const key = await this.deriveKey(`${userId}:${exchange}`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(`${userId}:${exchange}:v2`);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      key,
      new TextEncoder().encode(data)
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }

  // Enhanced decryption with AAD verification
  private async decrypt(encryptedData: string, userId: string, exchange: string): Promise<string> {
    if (!encryptedData || encryptedData === '') return '';
    
    try {
      const key = await this.deriveKey(`${userId}:${exchange}`);
      const aad = new TextEncoder().encode(`${userId}:${exchange}:v2`);
      
      const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: aad },
        key,
        encrypted
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      // Log security event for failed decryption attempts
      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'DECRYPTION_FAILURE',
          resource: 'api_keys',
          success: false,
          metadata: { exchange, error: 'Decryption failed' }
        });
      return '';
    }
  }

  // Validate API key format
  private validateAPIKey(apiKey: string, exchange: string): boolean {
    const patterns: Record<string, RegExp> = {
      'kraken': /^[A-Za-z0-9+/]{56}$/,
      'binance': /^[A-Za-z0-9]{64}$/,
      'coinbase': /^[a-f0-9]{32}$/,
      'bybit': /^[A-Za-z0-9]{20}$/,
      'okx': /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
    };
    
    const pattern = patterns[exchange];
    return !pattern || pattern.test(apiKey);
  }

  // Store encrypted API credentials
  async storeCredentials(userId: string, exchange: string, apiKey: string, apiSecret: string, passphrase?: string): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      // Rate limiting check
      if (!this.checkRateLimit(userId, 5, 3600000)) { // 5 operations per hour
        return { success: false, error: 'Rate limit exceeded. Please try again later.' };
      }

      // Input validation
      if (!apiKey || !apiSecret || apiKey.length < 10 || apiSecret.length < 10) {
        return { success: false, error: 'Invalid API key or secret format' };
      }

      if (!this.validateAPIKey(apiKey, exchange)) {
        return { success: false, error: 'API key format invalid for selected exchange' };
      }

      // Log the credential storage attempt
      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'API_CREDENTIAL_STORE',
          resource: 'api_keys',
          success: true,
          metadata: { exchange }
        });

      const encryptedApiKey = await this.encrypt(apiKey, userId, exchange);
      const encryptedApiSecret = await this.encrypt(apiSecret, userId, exchange);
      const encryptedPassphrase = passphrase ? await this.encrypt(passphrase, userId, exchange) : null;

      const { data, error } = await this.supabase
        .from('api_keys')
        .upsert({
          user_id: userId,
          exchange,
          api_key: encryptedApiKey,
          api_secret: encryptedApiSecret,
          passphrase: encryptedPassphrase,
          is_active: true,
          encryption_key_id: 'edge_v1',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,exchange'
        })
        .select('id')
        .single();

      if (error) throw error;

      return { success: true, id: data?.id };
    } catch (error) {
      console.error('Error storing credentials:', error);
      return { success: false, error: error.message };
    }
  }

  // Get decrypted credentials for server-side use only
  async getCredentials(userId: string, exchange: string): Promise<{ success: boolean; credentials?: any; error?: string }> {
    try {
      // Log the credential access attempt
      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'API_KEY_ACCESS',
          resource: 'api_keys',
          success: true,
          metadata: { exchange }
        });

      const { data, error } = await this.supabase
        .from('api_keys')
        .select('api_key, api_secret, passphrase, is_active, locked_until')
        .eq('user_id', userId)
        .eq('exchange', exchange)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      if (!data) return { success: false, error: 'Credentials not found' };

      // Check if locked
      if (data.locked_until && new Date(data.locked_until) > new Date()) {
        return { success: false, error: 'API key is temporarily locked' };
      }

      const decryptedApiKey = await this.decrypt(data.api_key, userId, exchange);
      const decryptedApiSecret = await this.decrypt(data.api_secret, userId, exchange);
      const decryptedPassphrase = data.passphrase ? await this.decrypt(data.passphrase, userId, exchange) : null;

      if (!decryptedApiKey || !decryptedApiSecret) {
        return { success: false, error: 'Failed to decrypt credentials' };
      }

      return {
        success: true,
        credentials: {
          api_key: decryptedApiKey,
          api_secret: decryptedApiSecret,
          passphrase: decryptedPassphrase,
          is_active: data.is_active
        }
      };
    } catch (error) {
      console.error('Error getting credentials:', error);
      return { success: false, error: error.message };
    }
  }

  // Get API key overview (no sensitive data)
  async getCredentialOverview(userId: string): Promise<{ success: boolean; keys?: any[]; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .select('id, exchange, is_active, created_at, updated_at, last_accessed, access_count, failed_attempts, locked_until')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Mask any sensitive data and add exchange names
      const maskedKeys = data?.map(key => ({
        ...key,
        exchange_name: this.getExchangeName(key.exchange)
      })) || [];

      return { success: true, keys: maskedKeys };
    } catch (error) {
      console.error('Error getting credential overview:', error);
      return { success: false, error: error.message };
    }
  }

  private getExchangeName(exchange: string): string {
    const names: Record<string, string> = {
      'kraken': 'Kraken',
      'binance': 'Binance', 
      'coinbase': 'Coinbase Pro',
      'bybit': 'Bybit',
      'okx': 'OKX'
    };
    return names[exchange] || exchange.toUpperCase();
  }

  // Toggle API key active status
  async toggleAPIKey(userId: string, keyId: string, active: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.checkRateLimit(userId)) {
        return { success: false, error: 'Rate limit exceeded' };
      }

      const { error } = await this.supabase
        .from('api_keys')
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', keyId)
        .eq('user_id', userId); // Ensure user can only modify their own keys

      if (error) throw error;

      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: active ? 'API_KEY_ENABLED' : 'API_KEY_DISABLED',
          resource: 'api_keys',
          success: true,
          metadata: { key_id: keyId }
        });

      return { success: true };
    } catch (error) {
      console.error('Error toggling API key:', error);
      return { success: false, error: error.message };
    }
  }

  // Delete API key
  async deleteAPIKey(userId: string, keyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.checkRateLimit(userId)) {
        return { success: false, error: 'Rate limit exceeded' };
      }

      const { error } = await this.supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)
        .eq('user_id', userId); // Ensure user can only delete their own keys

      if (error) throw error;

      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'API_KEY_DELETED',
          resource: 'api_keys',
          success: true,
          metadata: { key_id: keyId }
        });

      return { success: true };
    } catch (error) {
      console.error('Error deleting API key:', error);
      return { success: false, error: error.message };
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from JWT token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid or expired token');
    }

    const { action, ...params } = await req.json();
    const credentialManager = new SecureCredentialManager();

    switch (action) {
      case 'store': {
        const result = await credentialManager.storeCredentials(
          user.id,
          params.exchange,
          params.api_key,
          params.api_secret,
          params.passphrase
        );
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get': {
        const result = await credentialManager.getCredentials(user.id, params.exchange);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'overview': {
        const result = await credentialManager.getCredentialOverview(user.id);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'toggle': {
        const result = await credentialManager.toggleAPIKey(user.id, params.key_id, params.active);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete': {
        const result = await credentialManager.deleteAPIKey(user.id, params.key_id);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Secure Credentials Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: error.message.includes('authorization') || error.message.includes('token') ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});