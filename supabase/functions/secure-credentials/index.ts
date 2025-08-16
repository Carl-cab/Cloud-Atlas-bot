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
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  // Encrypt credentials using Web Crypto API
  private async encrypt(data: string): Promise<string> {
    if (!data || data === '') return '';
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(data)
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }

  // Decrypt credentials using Web Crypto API
  private async decrypt(encryptedData: string): Promise<string> {
    if (!encryptedData || encryptedData === '') return '';
    
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(ENCRYPTION_KEY.substring(0, 32).padEnd(32, '0')),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      const combined = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      return '';
    }
  }

  // Store encrypted API credentials
  async storeCredentials(userId: string, exchange: string, apiKey: string, apiSecret: string, passphrase?: string): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
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

      const encryptedApiKey = await this.encrypt(apiKey);
      const encryptedApiSecret = await this.encrypt(apiSecret);
      const encryptedPassphrase = passphrase ? await this.encrypt(passphrase) : null;

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

      const decryptedApiKey = await this.decrypt(data.api_key);
      const decryptedApiSecret = await this.decrypt(data.api_secret);
      const decryptedPassphrase = data.passphrase ? await this.decrypt(data.passphrase) : null;

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