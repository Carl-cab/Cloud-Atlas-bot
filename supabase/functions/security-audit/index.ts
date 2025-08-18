import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SecurityEvent {
  user_id: string;
  action: string;
  resource?: string;
  ip_address?: string;
  user_agent?: string;
  success?: boolean;
  metadata?: any;
}

interface RateLimitCheck {
  user_id: string;
  endpoint: string;
  max_requests?: number;
  window_minutes?: number;
}

class SecurityAuditService {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
  }

  // Log security events with rate limiting and threat detection
  async logSecurityEvent(event: SecurityEvent, request: Request): Promise<any> {
    try {
      // Extract request metadata
      const ip_address = this.getClientIP(request);
      const user_agent = request.headers.get('user-agent') || '';
      
      // Check for suspicious activity patterns
      const threatLevel = await this.assessThreatLevel(event, ip_address);
      
      // Rate limit security logging to prevent abuse
      const rateLimitPassed = await this.checkRateLimit({
        user_id: event.user_id,
        endpoint: 'security_logging',
        max_requests: 100,
        window_minutes: 60
      });

      if (!rateLimitPassed) {
        throw new Error('Rate limit exceeded for security logging');
      }

      // Log the event
      const { error } = await this.supabase.rpc('log_security_event', {
        p_user_id: event.user_id,
        p_action: event.action,
        p_resource: event.resource || null,
        p_ip_address: ip_address,
        p_user_agent: user_agent,
        p_success: event.success ?? true,
        p_metadata: {
          ...event.metadata,
          threat_level: threatLevel,
          timestamp: new Date().toISOString()
        }
      });

      if (error) throw error;

      // Trigger alerts for high-risk events
      if (threatLevel === 'high' || this.isHighRiskAction(event.action)) {
        await this.triggerSecurityAlert(event, threatLevel, ip_address);
      }

      return {
        success: true,
        logged: true,
        threat_level: threatLevel
      };

    } catch (error) {
      console.error('Security logging error:', error);
      throw error;
    }
  }

  // Check rate limits for API endpoints
  async checkRateLimit(check: RateLimitCheck): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('check_rate_limit', {
        p_user_id: check.user_id,
        p_endpoint: check.endpoint,
        p_max_requests: check.max_requests || 100,
        p_window_minutes: check.window_minutes || 60
      });

      if (error) throw error;
      return data as boolean;

    } catch (error) {
      console.error('Rate limit check error:', error);
      // Fail open for rate limiting to prevent service disruption
      return true;
    }
  }

  // Assess threat level based on patterns
  private async assessThreatLevel(event: SecurityEvent, ip_address: string): Promise<string> {
    try {
      // Check recent failed attempts
      const { data: recentFailures } = await this.supabase
        .from('security_audit_log')
        .select('*')
        .eq('user_id', event.user_id)
        .eq('success', false)
        .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour
        .limit(10);

      // Check for IP-based patterns
      const { data: ipActivity } = await this.supabase
        .from('security_audit_log')
        .select('*')
        .eq('ip_address', ip_address)
        .gte('created_at', new Date(Date.now() - 3600000).toISOString())
        .limit(20);

      let threatLevel = 'low';

      // Escalate based on failure patterns
      if (recentFailures && recentFailures.length > 5) {
        threatLevel = 'medium';
      }
      if (recentFailures && recentFailures.length > 10) {
        threatLevel = 'high';
      }

      // Escalate based on IP activity
      if (ipActivity && ipActivity.length > 50) {
        threatLevel = 'high';
      }

      // High-risk actions automatically get medium threat level
      if (this.isHighRiskAction(event.action)) {
        threatLevel = threatLevel === 'low' ? 'medium' : threatLevel;
      }

      return threatLevel;

    } catch (error) {
      console.error('Threat assessment error:', error);
      return 'low';
    }
  }

  // Determine if an action is high-risk
  private isHighRiskAction(action: string): boolean {
    const highRiskActions = [
      'toggle_auto_trading',
      'switch_to_live_mode',
      'emergency_stop',
      'api_key_added',
      'api_key_deleted',
      'large_order_placed',
      'risk_limit_disabled',
      'multiple_login_failures'
    ];

    return highRiskActions.includes(action);
  }

  // Trigger security alerts for high-risk events
  private async triggerSecurityAlert(event: SecurityEvent, threatLevel: string, ip_address: string): Promise<void> {
    try {
      // Create notification for high-risk events
      const alertMessage = this.generateAlertMessage(event, threatLevel);
      
      await this.supabase
        .from('notification_queue')
        .insert({
          user_id: event.user_id,
          type: 'security_alert',
          title: 'Security Alert',
          message: alertMessage,
          priority: threatLevel === 'high' ? 'high' : 'normal',
          data: {
            action: event.action,
            resource: event.resource,
            ip_address,
            threat_level: threatLevel,
            timestamp: new Date().toISOString()
          }
        });

      // Log the alert generation
      console.log(`Security alert triggered for user ${event.user_id}: ${alertMessage}`);

    } catch (error) {
      console.error('Security alert error:', error);
    }
  }

  // Generate appropriate alert messages
  private generateAlertMessage(event: SecurityEvent, threatLevel: string): string {
    const actionMessages: Record<string, string> = {
      'toggle_auto_trading': `Auto-trading was ${event.metadata?.enabled ? 'enabled' : 'disabled'}`,
      'switch_to_live_mode': 'Trading mode switched to LIVE - real funds at risk',
      'emergency_stop': 'Emergency stop was activated',
      'api_key_added': 'New API key was added to your account',
      'api_key_deleted': 'API key was removed from your account',
      'large_order_placed': `Large order placed: ${event.metadata?.symbol} ${event.metadata?.quantity}`,
      'multiple_login_failures': 'Multiple failed login attempts detected'
    };

    const baseMessage = actionMessages[event.action] || `Security event: ${event.action}`;
    const threatPrefix = threatLevel === 'high' ? '🚨 HIGH RISK: ' : threatLevel === 'medium' ? '⚠️ ' : '';
    
    return threatPrefix + baseMessage;
  }

  // Extract client IP from request
  private getClientIP(request: Request): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const cfConnectingIP = request.headers.get('cf-connecting-ip');
    
    return cfConnectingIP || realIP || forwardedFor?.split(',')[0] || '0.0.0.0';
  }

  // Get security audit logs for a user
  async getAuditLogs(user_id: string, limit: number = 50): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('security_audit_log')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;

    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  // API endpoint metrics for monitoring
  async getAPIMetrics(user_id: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('api_rate_limits')
        .select('*')
        .eq('user_id', user_id)
        .order('last_request', { ascending: false });

      if (error) throw error;
      
      return {
        endpoints: data,
        total_requests: data?.reduce((sum, endpoint) => sum + endpoint.request_count, 0) || 0,
        active_endpoints: data?.filter(endpoint => 
          new Date(endpoint.last_request) > new Date(Date.now() - 3600000)
        ).length || 0
      };

    } catch (error) {
      console.error('Error fetching API metrics:', error);
      throw error;
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request first - CRITICAL SECURITY FIX
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
    
    // SECURITY: Always use authenticated user ID, ignore any user_id in body
    const authenticatedUserId = user.id;
    
    const securityService = new SecurityAuditService();

    switch (action) {
      case 'log_event': {
        // Use authenticated user ID for all security events
        const securityEvent: SecurityEvent = {
          ...params,
          user_id: authenticatedUserId
        };
        const result = await securityService.logSecurityEvent(securityEvent, req);
        
        return new Response(JSON.stringify({
          success: true,
          ...result
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'check_rate_limit': {
        // Use authenticated user ID for rate limiting
        const rateLimitCheck: RateLimitCheck = {
          ...params,
          user_id: authenticatedUserId
        };
        const allowed = await securityService.checkRateLimit(rateLimitCheck);
        
        return new Response(JSON.stringify({
          success: true,
          allowed
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_audit_logs': {
        // Only allow access to authenticated user's logs
        const logs = await securityService.getAuditLogs(authenticatedUserId, params.limit);
        
        return new Response(JSON.stringify({
          success: true,
          logs
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_metrics': {
        // Only allow access to authenticated user's metrics
        const metrics = await securityService.getAPIMetrics(authenticatedUserId);
        
        return new Response(JSON.stringify({
          success: true,
          metrics
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Security Audit Service Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});