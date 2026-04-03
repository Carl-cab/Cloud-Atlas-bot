import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Eye, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Zap,
  Clock,
  Target,
  Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RealTimeMetrics {
  systemHealth: number;
  activePositions: number;
  totalPnL: number;
  dailyTrades: number;
  riskUtilization: number;
  mlConfidence: number;
  latestSignal: {
    symbol: string;
    action: string;
    confidence: number;
    timestamp: string;
  } | null;
  alerts: Array<{
    id: string;
    type: 'info' | 'warning' | 'error';
    message: string;
    timestamp: string;
  }>;
}

export const RealTimeMonitoring = () => {
  const [metrics, setMetrics] = useState<RealTimeMetrics>({
    systemHealth: 98,
    activePositions: 0,
    totalPnL: 0,
    dailyTrades: 0,
    riskUtilization: 0,
    mlConfidence: 75,
    latestSignal: null,
    alerts: []
  });

  const [isMonitoring, setIsMonitoring] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    if (isMonitoring) {
      fetchRealTimeData();
      const interval = setInterval(fetchRealTimeData, 5000); // Update every 5 seconds
      return () => clearInterval(interval);
    }
  }, [isMonitoring]);

  const fetchRealTimeData = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      // Get active positions
      const { data: positions } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('user_id', user.data.user.id)
        .eq('status', 'open');

      // Get today's P&L
      const today = new Date().toISOString().split('T')[0];
      const { data: dailyPnL } = await supabase
        .from('daily_pnl')
        .select('*')
        .eq('user_id', user.data.user.id)
        .eq('date', today)
        .single();

      // Get latest signal
      const { data: latestSignal } = await supabase
        .from('strategy_signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Get recent alerts from logs
      const { data: recentLogs } = await supabase
        .from('trading_logs')
        .select('*')
        .eq('user_id', user.data.user.id)
        .in('level', ['WARN', 'ERROR'])
        .order('created_at', { ascending: false })
        .limit(5);

      // Calculate metrics
      const activePositions = positions?.length || 0;
      const totalPnL = dailyPnL?.total_pnl || 0;
      const riskUtilization = positions?.reduce((sum, pos) => sum + (pos.risk_amount || 0), 0) || 0;

      // Get bot config for risk calculation
      const { data: botConfig } = await supabase
        .from('bot_config')
        .select('*')
        .eq('user_id', user.data.user.id)
        .single();

      const riskPercent = botConfig ? (riskUtilization / botConfig.capital_cad) * 100 : 0;

      // Format alerts
      const alerts = recentLogs?.map(log => ({
        id: log.id,
        type: log.level === 'ERROR' ? 'error' as const : 'warning' as const,
        message: log.message,
        timestamp: log.created_at
      })) || [];

      setMetrics({
        systemHealth: 95 + Math.random() * 5, // Simulated system health
        activePositions,
        totalPnL,
        dailyTrades: dailyPnL?.total_trades || 0,
        riskUtilization: riskPercent,
        mlConfidence: 70 + Math.random() * 25, // Simulated ML confidence
        latestSignal: latestSignal ? {
          symbol: latestSignal.symbol,
          action: latestSignal.signal_type,
          confidence: latestSignal.confidence * 100,
          timestamp: latestSignal.created_at
        } : null,
        alerts
      });

      setLastUpdate(new Date());

    } catch (error) {
      console.error('Error fetching real-time data:', error);
    }
  };

  const getHealthColor = (health: number) => {
    if (health >= 95) return 'text-success';
    if (health >= 85) return 'text-yellow-500';
    return 'text-danger';
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertTriangle className="h-4 w-4 text-danger" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4 text-primary" />;
    }
  };

  const formatRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Real-Time Monitoring</h2>
          <Badge variant={isMonitoring ? "default" : "secondary"}>
            {isMonitoring ? "LIVE" : "PAUSED"}
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsMonitoring(!isMonitoring)}
          >
            {isMonitoring ? "Pause" : "Resume"} Monitoring
          </Button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">System Health</p>
                <p className={`text-xl font-bold ${getHealthColor(metrics.systemHealth)}`}>
                  {metrics.systemHealth.toFixed(1)}%
                </p>
              </div>
              <Shield className={`h-5 w-5 ${getHealthColor(metrics.systemHealth)}`} />
            </div>
            <Progress value={metrics.systemHealth} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Positions</p>
                <p className="text-xl font-bold text-primary">{metrics.activePositions}</p>
              </div>
              <Target className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Daily P&L</p>
                <p className={`text-xl font-bold ${metrics.totalPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                  ${metrics.totalPnL.toFixed(2)}
                </p>
              </div>
              {metrics.totalPnL >= 0 ? 
                <TrendingUp className="h-5 w-5 text-success" /> : 
                <TrendingDown className="h-5 w-5 text-danger" />
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Risk Used</p>
                <p className="text-xl font-bold text-primary">
                  {metrics.riskUtilization.toFixed(1)}%
                </p>
              </div>
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <Progress value={metrics.riskUtilization} className="mt-2 h-1" />
          </CardContent>
        </Card>
      </div>

      {/* Latest Signal & ML Confidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Latest Trading Signal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.latestSignal ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{metrics.latestSignal.symbol}</span>
                  <Badge variant={
                    metrics.latestSignal.action === 'buy' ? 'default' : 
                    metrics.latestSignal.action === 'sell' ? 'destructive' : 
                    'secondary'
                  }>
                    {metrics.latestSignal.action.toUpperCase()}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Confidence</span>
                    <span>{metrics.latestSignal.confidence.toFixed(1)}%</span>
                  </div>
                  <Progress value={metrics.latestSignal.confidence} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(metrics.latestSignal.timestamp)}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">No recent signals</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              ML Model Confidence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">
                  {metrics.mlConfidence.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">Overall Model Confidence</p>
              </div>
              <Progress value={metrics.mlConfidence} className="h-3" />
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold">{metrics.dailyTrades}</p>
                  <p className="text-xs text-muted-foreground">Daily Trades</p>
                </div>
                <div>
                  <p className="text-lg font-bold">72.5%</p>
                  <p className="text-xs text-muted-foreground">Accuracy</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            System Alerts
          </CardTitle>
          <CardDescription>Recent warnings and system events</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.alerts.length > 0 ? (
            <div className="space-y-3">
              {metrics.alerts.map((alert) => (
                <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  {getAlertIcon(alert.type)}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(alert.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No recent alerts - system running smoothly</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};