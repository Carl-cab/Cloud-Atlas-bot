import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle, Clock, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SecurityEvent {
  id: string;
  action: string;
  resource?: string;
  success: boolean;
  created_at: string;
  metadata?: any;
}

interface APIKeyAudit {
  id: string;
  action: string;
  exchange?: string;
  success: boolean;
  created_at: string;
  details?: any;
}

export const SecurityMonitor = () => {
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [apiKeyAudits, setApiKeyAudits] = useState<APIKeyAudit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSecurityData();
    
    // Set up real-time monitoring for security events
    const eventChannel = supabase
      .channel('security_events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'security_audit_log',
        filter: `user_id=eq.${supabase.auth.getUser().then(r => r.data.user?.id)}`
      }, (payload) => {
        setSecurityEvents(prev => [payload.new as SecurityEvent, ...prev.slice(0, 9)]);
        
        // Show toast for critical security events
        if (!payload.new.success) {
          toast({
            title: "Security Alert",
            description: `Failed ${payload.new.action} attempt detected`,
            variant: "destructive"
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(eventChannel);
    };
  }, [toast]);

  const loadSecurityData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load recent security events
      const { data: events, error: eventsError } = await supabase
        .from('security_audit_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (eventsError) throw eventsError;

      // Load API key audit logs
      const { data: audits, error: auditsError } = await supabase
        .from('api_key_audit')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (auditsError) throw auditsError;

      setSecurityEvents(events || []);
      setApiKeyAudits(audits || []);
    } catch (error) {
      console.error('Error loading security data:', error);
      toast({
        title: "Error",
        description: "Failed to load security monitoring data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getEventIcon = (action: string, success: boolean) => {
    if (!success) return <AlertTriangle className="h-4 w-4 text-destructive" />;
    
    switch (action) {
      case 'API_KEY_ACCESS':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'LOGIN':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Shield className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventBadgeVariant = (success: boolean) => {
    return success ? 'default' : 'destructive';
  };

  const formatEventTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading security data...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Status Alert */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Security Monitoring Active:</strong> All API key access and critical actions are being logged for your security.
        </AlertDescription>
      </Alert>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Recent Security Events
          </CardTitle>
          <CardDescription>
            Monitor authentication and security-related activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          {securityEvents.length > 0 ? (
            <div className="space-y-3">
              {securityEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    {getEventIcon(event.action, event.success)}
                    <div>
                      <p className="font-medium">{event.action.replace('_', ' ')}</p>
                      <p className="text-sm text-muted-foreground">
                        {event.resource && `Resource: ${event.resource}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getEventBadgeVariant(event.success)}>
                      {event.success ? 'Success' : 'Failed'}
                    </Badge>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatEventTime(event.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Shield className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">No security events recorded yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Key Access Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            API Key Activity
          </CardTitle>
          <CardDescription>
            Track API key access and usage patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiKeyAudits.length > 0 ? (
            <div className="space-y-3">
              {apiKeyAudits.map((audit) => (
                <div
                  key={audit.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="font-medium">{audit.action}</p>
                      {audit.exchange && (
                        <p className="text-sm text-muted-foreground">
                          Exchange: {audit.exchange.toUpperCase()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getEventBadgeVariant(audit.success)}>
                      {audit.success ? 'Success' : 'Failed'}
                    </Badge>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatEventTime(audit.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">No API key activity recorded yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};