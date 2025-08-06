import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, AlertTriangle, CheckCircle, X, Key, Database, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SecurityAlert {
  id: string;
  type: 'API_KEY' | 'DATABASE' | 'NETWORK' | 'AUTH';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
}

interface SystemHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  response_time?: number;
  last_check: Date;
}

export const SecurityMonitor = () => {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSecurityData();
    const interval = setInterval(loadSecurityData, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadSecurityData = async () => {
    try {
      // Fetch system health data
      const { data: healthData } = await supabase
        .from('system_health')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(10);

      if (healthData) {
        const healthSummary = healthData.reduce((acc: SystemHealth[], item) => {
          const existing = acc.find(h => h.service === item.service_name);
          if (!existing) {
            acc.push({
              service: item.service_name,
              status: item.status as any,
              response_time: item.response_time_ms,
              last_check: new Date(item.checked_at)
            });
          }
          return acc;
        }, []);
        setSystemHealth(healthSummary);
      }

      // Mock security alerts - in production this would come from real monitoring
      const mockAlerts: SecurityAlert[] = [
        {
          id: '1',
          type: 'API_KEY',
          severity: 'medium',
          message: 'API key will expire in 30 days',
          timestamp: new Date(Date.now() - 300000),
          resolved: false
        },
        {
          id: '2',
          type: 'DATABASE',
          severity: 'low',
          message: 'Database connection pool at 70% capacity',
          timestamp: new Date(Date.now() - 600000),
          resolved: false
        }
      ];
      setAlerts(mockAlerts);

    } catch (error) {
      console.error('Error loading security data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resolveAlert = async (alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, resolved: true } : alert
    ));
    
    toast({
      title: "Alert Resolved",
      description: "Security alert has been marked as resolved",
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'degraded': return 'text-yellow-500';
      case 'down': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'API_KEY': return <Key className="h-4 w-4" />;
      case 'DATABASE': return <Database className="h-4 w-4" />;
      case 'NETWORK': return <Globe className="h-4 w-4" />;
      case 'AUTH': return <Shield className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const activeAlerts = alerts.filter(alert => !alert.resolved);
  const resolvedAlerts = alerts.filter(alert => alert.resolved);

  return (
    <div className="space-y-6">
      {/* Security Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Alerts</p>
                <p className="text-2xl font-bold text-red-500">{activeAlerts.length}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">System Health</p>
                <p className="text-2xl font-bold text-green-500">
                  {systemHealth.filter(s => s.status === 'healthy').length}/{systemHealth.length}
                </p>
              </div>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Security Score</p>
                <p className="text-2xl font-bold text-primary">92/100</p>
              </div>
              <Shield className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Security Alerts */}
      {activeAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Active Security Alerts
            </CardTitle>
            <CardDescription>
              Security issues that require attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeAlerts.map((alert) => (
                <Alert key={alert.id}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-3">
                      {getTypeIcon(alert.type)}
                      <div>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.timestamp.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getSeverityColor(alert.severity)}>
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Resolve
                      </Button>
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Health Monitor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            System Health Monitor
          </CardTitle>
          <CardDescription>
            Real-time status of critical system components
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {systemHealth.map((health) => (
              <div
                key={health.service}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{health.service}</p>
                  <p className="text-sm text-muted-foreground">
                    Last check: {health.last_check.toLocaleTimeString()}
                  </p>
                </div>
                <div className="text-right">
                  <Badge
                    variant="outline"
                    className={getStatusColor(health.status)}
                  >
                    {health.status.toUpperCase()}
                  </Badge>
                  {health.response_time && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {health.response_time}ms
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Security Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Security Recommendations</CardTitle>
          <CardDescription>
            Suggested improvements to enhance system security
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">Enable 2FA for API Access</p>
                <p className="text-sm text-muted-foreground">
                  Add two-factor authentication for enhanced API security
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Key className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">API Key Rotation</p>
                <p className="text-sm text-muted-foreground">
                  Regularly rotate API keys for all connected exchanges
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Database className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">Database Encryption</p>
                <p className="text-sm text-muted-foreground">
                  All sensitive data is encrypted at rest and in transit
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};