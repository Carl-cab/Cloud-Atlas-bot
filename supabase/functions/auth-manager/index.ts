import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyRateLimit, rateLimitConfigs } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuthRequest {
  email: string;
  password: string;
  action: 'login' | 'register' | 'logout' | 'reset_password';
  user_id?: string;
}

interface AuthResponse {
  success: boolean;
  user?: any;
  session?: any;
  error?: string;
  message?: string;
}

class AuthManager {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  async handleLogin(email: string, password: string, request: Request): Promise<AuthResponse> {
    try {
      // Log security event
      await this.logSecurityEvent({
        action: 'login_attempt',
        user_email: email,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || '',
        success: false // Will update if successful
      });

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Log failed attempt
        await this.logSecurityEvent({
          action: 'login_failed',
          user_email: email,
          ip_address: this.getClientIP(request),
          user_agent: request.headers.get('user-agent') || '',
          success: false,
          error_message: error.message
        });

        return {
          success: false,
          error: error.message
        };
      }

      // Log successful login
      await this.logSecurityEvent({
        action: 'login_success',
        user_id: data.user?.id,
        user_email: email,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || '',
        success: true
      });

      return {
        success: true,
        user: data.user,
        session: data.session
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleRegister(email: string, password: string, request: Request): Promise<AuthResponse> {
    try {
      // Log registration attempt
      await this.logSecurityEvent({
        action: 'register_attempt',
        user_email: email,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || '',
        success: false
      });

      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        await this.logSecurityEvent({
          action: 'register_failed',
          user_email: email,
          ip_address: this.getClientIP(request),
          user_agent: request.headers.get('user-agent') || '',
          success: false,
          error_message: error.message
        });

        return {
          success: false,
          error: error.message
        };
      }

      // Log successful registration
      await this.logSecurityEvent({
        action: 'register_success',
        user_id: data.user?.id,
        user_email: email,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || '',
        success: true
      });

      return {
        success: true,
        user: data.user,
        session: data.session,
        message: 'Registration successful. Please check your email to verify your account.'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handlePasswordReset(email: string, request: Request): Promise<AuthResponse> {
    try {
      await this.logSecurityEvent({
        action: 'password_reset_request',
        user_email: email,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || '',
        success: false
      });

      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${Deno.env.get('SITE_URL')}/reset-password`,
      });

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      await this.logSecurityEvent({
        action: 'password_reset_sent',
        user_email: email,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || '',
        success: true
      });

      return {
        success: true,
        message: 'Password reset email sent'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleLogout(user_id: string, request: Request): Promise<AuthResponse> {
    try {
      await this.logSecurityEvent({
        action: 'logout',
        user_id,
        ip_address: this.getClientIP(request),
        user_agent: request.headers.get('user-agent') || '',
        success: true
      });

      const { error } = await this.supabase.auth.signOut();

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async logSecurityEvent(event: any): Promise<void> {
    try {
      await this.supabase.from('security_audit_log').insert({
        user_id: event.user_id || null,
        action: event.action,
        ip_address: event.ip_address,
        user_agent: event.user_agent,
        success: event.success,
        metadata: {
          user_email: event.user_email,
          error_message: event.error_message,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  private getClientIP(request: Request): string {
    return request.headers.get('x-forwarded-for') ||
           request.headers.get('x-real-ip') ||
           request.headers.get('cf-connecting-ip') ||
           'unknown';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Apply authentication rate limiting
  const rateLimitResponse = await applyRateLimit(req, rateLimitConfigs.auth);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const authRequest: AuthRequest = await req.json();
    const authManager = new AuthManager();
    
    let response: AuthResponse;

    switch (authRequest.action) {
      case 'login':
        response = await authManager.handleLogin(
          authRequest.email, 
          authRequest.password, 
          req
        );
        break;

      case 'register':
        response = await authManager.handleRegister(
          authRequest.email, 
          authRequest.password, 
          req
        );
        break;

      case 'reset_password':
        response = await authManager.handlePasswordReset(
          authRequest.email, 
          req
        );
        break;

      case 'logout':
        response = await authManager.handleLogout(
          authRequest.user_id!, 
          req
        );
        break;

      default:
        response = {
          success: false,
          error: 'Invalid action'
        };
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.success ? 200 : 400
    });

  } catch (error) {
    console.error('Auth Manager Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});