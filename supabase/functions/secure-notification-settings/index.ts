import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY')!;

class SecureNotificationManager {
  private supabase;
  private readonly rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  // Enhanced rate limiting per user for PII operations
  private checkRateLimit(userId: string, maxRequests = 20, windowMs = 3600000): boolean {
    const key = `notification_settings_${userId}`;
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

  // Derive cryptographic key using HKDF for PII encryption
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
        info: new TextEncoder().encode('notification-pii-encryption')
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Enhanced encryption for PII with user-specific context
  private async encryptPII(data: string, userId: string, field: string): Promise<string> {
    if (!data || data === '') return '';
    
    const key = await this.deriveKey(`${userId}:${field}`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(`${userId}:${field}:notification_pii`);
    
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

  // Enhanced decryption for PII with user-specific context
  private async decryptPII(encryptedData: string, userId: string, field: string): Promise<string> {
    if (!encryptedData || encryptedData === '') return '';
    
    try {
      const key = await this.deriveKey(`${userId}:${field}`);
      const aad = new TextEncoder().encode(`${userId}:${field}:notification_pii`);
      
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
      console.error(`PII decryption failed for field ${field}:`, error);
      // Log security event for failed decryption attempts
      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'PII_DECRYPTION_FAILURE',
          resource: 'notification_settings',
          success: false,
          metadata: { field, error: 'Decryption failed' }
        });
      return '';
    }
  }

  // Validate email format
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  // Validate telegram chat ID format
  private validateTelegramChatId(chatId: string): boolean {
    return /^-?\d{1,20}$/.test(chatId);
  }

  // Store or update notification settings with PII encryption
  async storeNotificationSettings(
    userId: string, 
    settings: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Rate limiting check
      if (!this.checkRateLimit(userId)) {
        return { success: false, error: 'Rate limit exceeded. Please try again later.' };
      }

      // Validate PII fields if provided
      if (settings.email_address && !this.validateEmail(settings.email_address)) {
        return { success: false, error: 'Invalid email address format' };
      }

      if (settings.telegram_chat_id && !this.validateTelegramChatId(settings.telegram_chat_id)) {
        return { success: false, error: 'Invalid Telegram chat ID format' };
      }

      // Encrypt sensitive PII fields
      const encryptedSettings = { ...settings };
      if (settings.email_address) {
        encryptedSettings.email_address = await this.encryptPII(settings.email_address, userId, 'email');
      }
      if (settings.telegram_chat_id) {
        encryptedSettings.telegram_chat_id = await this.encryptPII(settings.telegram_chat_id, userId, 'telegram');
      }

      // Log the operation
      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'NOTIFICATION_SETTINGS_UPDATE',
          resource: 'notification_settings',
          success: true,
          metadata: { 
            has_email: !!settings.email_address,
            has_telegram: !!settings.telegram_chat_id,
            settings_count: Object.keys(settings).length
          }
        });

      // Upsert the settings
      const { error } = await this.supabase
        .from('notification_settings')
        .upsert({
          user_id: userId,
          ...encryptedSettings,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error storing notification settings:', error);
      return { success: false, error: error.message };
    }
  }

  // Get notification settings with PII decryption
  async getNotificationSettings(userId: string): Promise<{ success: boolean; settings?: any; error?: string }> {
    try {
      // Rate limiting check
      if (!this.checkRateLimit(userId)) {
        return { success: false, error: 'Rate limit exceeded. Please try again later.' };
      }

      const { data, error } = await this.supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Return default settings if none exist
        return {
          success: true,
          settings: {
            telegram_enabled: false,
            email_enabled: false,
            daily_reports: true,
            trade_alerts: true,
            risk_alerts: true,
            performance_summary: true,
            email_address: '',
            telegram_chat_id: ''
          }
        };
      }

      // Decrypt sensitive PII fields
      const decryptedSettings = { ...data };
      if (data.email_address) {
        decryptedSettings.email_address = await this.decryptPII(data.email_address, userId, 'email');
      }
      if (data.telegram_chat_id) {
        decryptedSettings.telegram_chat_id = await this.decryptPII(data.telegram_chat_id, userId, 'telegram');
      }

      // Log the access (for audit purposes)
      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'NOTIFICATION_SETTINGS_ACCESS',
          resource: 'notification_settings',
          success: true,
          metadata: { 
            has_email: !!decryptedSettings.email_address,
            has_telegram: !!decryptedSettings.telegram_chat_id
          }
        });

      return { success: true, settings: decryptedSettings };
    } catch (error) {
      console.error('Error getting notification settings:', error);
      return { success: false, error: error.message };
    }
  }

  // Get decrypted PII for notification engine (server-side only)
  async getDecryptedPIIForNotifications(userId: string): Promise<{ 
    success: boolean; 
    email?: string; 
    telegram_chat_id?: string; 
    settings?: any;
    error?: string 
  }> {
    try {
      const { data, error } = await this.supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { success: false, error: 'No notification settings found' };

      // Decrypt PII fields for notification sending
      let decryptedEmail = '';
      let decryptedTelegramId = '';

      if (data.email_address && data.email_enabled) {
        decryptedEmail = await this.decryptPII(data.email_address, userId, 'email');
      }
      if (data.telegram_chat_id && data.telegram_enabled) {
        decryptedTelegramId = await this.decryptPII(data.telegram_chat_id, userId, 'telegram');
      }

      // Log the PII access for notifications
      await this.supabase
        .from('security_audit_log')
        .insert({
          user_id: userId,
          action: 'PII_ACCESS_FOR_NOTIFICATION',
          resource: 'notification_settings',
          success: true,
          metadata: { 
            email_accessed: !!decryptedEmail,
            telegram_accessed: !!decryptedTelegramId
          }
        });

      return {
        success: true,
        email: decryptedEmail,
        telegram_chat_id: decryptedTelegramId,
        settings: {
          telegram_enabled: data.telegram_enabled,
          email_enabled: data.email_enabled,
          daily_reports: data.daily_reports,
          trade_alerts: data.trade_alerts,
          risk_alerts: data.risk_alerts,
          performance_summary: data.performance_summary
        }
      };
    } catch (error) {
      console.error('Error getting decrypted PII for notifications:', error);
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
    const notificationManager = new SecureNotificationManager();

    switch (action) {
      case 'get': {
        const result = await notificationManager.getNotificationSettings(user.id);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'store': {
        const result = await notificationManager.storeNotificationSettings(user.id, params.settings);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_for_notifications': {
        // This action is only for internal server use (notification engine)
        const result = await notificationManager.getDecryptedPIIForNotifications(user.id);
        
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Secure Notification Settings Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: error.message.includes('authorization') || error.message.includes('token') ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});