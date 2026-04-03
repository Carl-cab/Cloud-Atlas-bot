import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Activity, Server, Database, Wifi, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useBotState } from '@/context/BotStateProvider';

interface SystemMetrics {
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_latency: number;
  active_connections: number;
  error_rate: number;
  uptime: string;
}

interface HealthCheck {
  service_name: string;
  status: 'healthy' | 'warning' | 'critical';
  response_time_ms: number;
  last_check: string;
  error_message?: string;
}

interface AlertRule {
  metric: string;
  threshold: number;
  severity: 'warning' | 'critical';
  enabled: boolean;
}

export const SystemHealthMonitor: React.FC = () => {
  const { botStatus } = useBotState();
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpu_usage: 45,
    memory_usage: 62,
    disk_usage: 78,
    network_latency: 120,
    active_connections: 42,
    error_rate: 0.2,
    uptime: '5d 14h 32m'
  });
  
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alerts, setAlerts] = useState<AlertRule[]>([
    { metric: 'cpu_usage', threshold: 80, severity: 'warning', enabled: true },
    { metric: 'memory_usage', threshold: 85, severity: 'critical', enabled: true },
    { metric: 'error_rate', threshold: 5, severity: 'warning', enabled: true },
    { metric: 'network_latency', threshold: 1000, severity: 'warning', enabled: true }
  ]);
  
  const { toast } = useToast();

  useEffect(() => {
    loadHealthData();
    
    // Set up real-time subscriptions for system health
    const channel = supabase
      .channel('system-health-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'system_health'
      }, () => loadHealthData())
      .subscribe();
    
    const interval = setInterval(loadHealthData, 30000); // Update every 30 seconds
    
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const loadHealthData = async () => {
    try {
      const { data, error } = await supabase
        .from('system_health')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const formattedHealthChecks: HealthCheck[] = data?.map(item => ({
        service_name: item.service_name,
        status: item.status as 'healthy' | 'warning' | 'critical',
        response_time_ms: item.response_time_ms || 0,
        last_check: item.checked_at || '',
        error_message: item.error_message || undefined
      })) || [];

      setHealthChecks(formattedHealthChecks);
    } catch (error) {
      console.error('Error loading health data:', error);
    }
  };

  const runHealthCheck = async () => {
    setIsLoading(true);
    try {
      await loadHealthData();
      toast({
        title: "Health Check Complete",
        description: "System health check completed successfully"
      });
    } catch (error) {
      console.error('Error running health check:', error);
      toast({
        title: "Error",
        description: "Failed to run health check",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'healthy':
        return 'default';
      case 'warning':
        return 'secondary';
      case 'critical':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getMetricColor = (metric: string, value: number) => {
    const alert = alerts.find(a => a.metric === metric);
    if (!alert) return '';
    
    if (value > alert.threshold) {
      return alert.severity === 'critical' ? 'text-red-500' : 'text-yellow-500';
    }
    return 'text-green-500';
  };

  const overallHealth = () => {
    if (healthChecks.length === 0) return 'unknown';
    
    const criticalCount = healthChecks.filter(check => check.status === 'critical').length;
    const warningCount = healthChecks.filter(check => check.status === 'warning').length;
    
    if (criticalCount > 0) return 'critical';
    if (warningCount > 0) return 'warning';
    return 'healthy';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System Health Monitor</h2>
          <p className="text-muted-foreground">Real-time system performance and health status</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button onClick={runHealthCheck} disabled={isLoading}>
            <Activity className="h-4 w-4 mr-2" />
            Run Health Check
          </Button>
        </div>
      </div>

      {/* Overall System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            {getStatusIcon(overallHealth())}
            <span className="ml-2">Overall System Status</span>
            <Badge 
              variant={getStatusBadgeVariant(overallHealth())} 
              className="ml-2"
            >
              {overallHealth().toUpperCase()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Uptime</p>
              <p className="font-semibold">{metrics.uptime}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Services Healthy</p>
              <p className="font-semibold">
                {healthChecks.filter(c => c.status === 'healthy').length}/{healthChecks.length}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Active Connections</p>
              <p className="font-semibold">{metrics.active_connections}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Error Rate</p>
              <p className={`font-semibold ${getMetricColor('error_rate', metrics.error_rate)}`}>
                {metrics.error_rate}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMetricColor('cpu_usage', metrics.cpu_usage)}`}>
              {metrics.cpu_usage}%
            </div>
            <Progress value={metrics.cpu_usage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.cpu_usage > 80 ? 'High usage detected' : 'Normal operation'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMetricColor('memory_usage', metrics.memory_usage)}`}>
              {metrics.memory_usage}%
            </div>
            <Progress value={metrics.memory_usage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.memory_usage > 85 ? 'Memory pressure detected' : 'Normal operation'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Network Latency</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.network_latency}ms</div>
            <p className="text-xs text-muted-foreground">Average response time</p>
            <div className="mt-2">
              <div className={`text-xs ${metrics.network_latency > 200 ? 'text-yellow-500' : 'text-green-500'}`}>
                {metrics.network_latency > 200 ? 'High latency' : 'Good connection'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disk Usage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.disk_usage}%</div>
            <Progress value={metrics.disk_usage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Storage utilization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.active_connections}</div>
            <p className="text-xs text-muted-foreground">WebSocket & API connections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMetricColor('error_rate', metrics.error_rate)}`}>
              {metrics.error_rate}%
            </div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      {/* Service Health Status */}
      <Card>
        <CardHeader>
          <CardTitle>Service Health Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {healthChecks.map((check, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(check.status)}
                  <div>
                    <h4 className="font-medium">{check.service_name}</h4>
                    {check.error_message && (
                      <p className="text-sm text-red-500">{check.error_message}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-sm font-medium">{check.response_time_ms}ms</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(check.last_check).toLocaleTimeString()}
                    </p>
                  </div>
                  <Badge variant={getStatusBadgeVariant(check.status)}>
                    {check.status}
                  </Badge>
                </div>
              </div>
            ))}
            
            {healthChecks.length === 0 && !isLoading && (
              <div className="text-center py-8 text-muted-foreground">
                No health check data available. Run a health check to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alert Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {alerts.map((alert, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium capitalize">{alert.metric.replace('_', ' ')}</h4>
                  <p className="text-sm text-muted-foreground">
                    Threshold: {alert.threshold}
                    {alert.metric.includes('usage') ? '%' : alert.metric === 'response_time' ? 'ms' : ''}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.severity}
                  </Badge>
                  <Badge variant={alert.enabled ? 'default' : 'outline'}>
                    {alert.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};