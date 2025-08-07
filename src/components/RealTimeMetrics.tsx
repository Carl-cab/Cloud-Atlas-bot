import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  TrendingUp, 
  Users, 
  Database, 
  Clock, 
  Zap,
  Wifi,
  BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DashboardMetrics {
  total_users: number;
  active_connections: number;
  data_points_today: number;
  avg_latency_ms: number;
  uptime_percentage: number;
  last_updated: string;
}

interface MarketData {
  symbol: string;
  price: number;
  change_24h: number;
  volume: number;
  timestamp: string;
}

export const RealTimeMetrics = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    total_users: 0,
    active_connections: 0,
    data_points_today: 0,
    avg_latency_ms: 0,
    uptime_percentage: 0,
    last_updated: new Date().toISOString()
  });
  
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadMetrics();
    loadMarketData();
    
    // Set up real-time updates
    const metricsInterval = setInterval(loadMetrics, 30000); // Every 30 seconds
    const marketInterval = setInterval(loadMarketData, 5000); // Every 5 seconds
    
    // Set up Supabase real-time subscription for market data
    const marketDataChannel = supabase
      .channel('market-data-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'market_data'
        },
        (payload) => {
          console.log('New market data:', payload);
          setMarketData(prev => [payload.new as MarketData, ...prev.slice(0, 4)]);
        }
      )
      .subscribe();

    return () => {
      clearInterval(metricsInterval);
      clearInterval(marketInterval);
      supabase.removeChannel(marketDataChannel);
    };
  }, []);

  const loadMetrics = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('market-data-engine', {
        body: { action: 'get_dashboard_metrics' }
      });

      if (error) throw error;

      setMetrics(data.data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading metrics:', error);
      toast({
        title: 'Metrics Error',
        description: 'Failed to load dashboard metrics',
        variant: 'destructive'
      });
    }
  };

  const loadMarketData = async () => {
    try {
      // Fetch latest market data for popular symbols
      const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD'];
      const marketUpdates = [];

      for (const symbol of symbols) {
        try {
          const { data, error } = await supabase.functions.invoke('market-data-engine', {
            body: { 
              action: 'fetch_real_time', 
              symbol,
              exchange: 'kraken'
            }
          });

          if (!error && data.success) {
            marketUpdates.push(data.data);
          }
        } catch (symbolError) {
          console.error(`Error fetching ${symbol}:`, symbolError);
        }
      }

      if (marketUpdates.length > 0) {
        setMarketData(marketUpdates);
      }
    } catch (error) {
      console.error('Error loading market data:', error);
    }
  };

  const getUptimeColor = (uptime: number) => {
    if (uptime >= 99.5) return 'text-green-500';
    if (uptime >= 98) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getLatencyColor = (latency: number) => {
    if (latency <= 50) return 'text-green-500';
    if (latency <= 100) return 'text-yellow-500';
    return 'text-red-500';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{metrics.total_users}</p>
              </div>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Live Connections</p>
                <p className="text-2xl font-bold">{metrics.active_connections}</p>
              </div>
              <Wifi className="h-4 w-4 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Data Points Today</p>
                <p className="text-2xl font-bold">{metrics.data_points_today.toLocaleString()}</p>
              </div>
              <Database className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Latency</p>
                <p className={`text-2xl font-bold ${getLatencyColor(metrics.avg_latency_ms)}`}>
                  {metrics.avg_latency_ms}ms
                </p>
              </div>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Status
          </CardTitle>
          <CardDescription>
            Real-time system health and performance metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>System Uptime</span>
                <span className={getUptimeColor(metrics.uptime_percentage)}>
                  {metrics.uptime_percentage.toFixed(2)}%
                </span>
              </div>
              <Progress value={metrics.uptime_percentage} className="h-2" />
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last Updated</span>
              <Badge variant="outline">
                <Clock className="w-3 h-3 mr-1" />
                {new Date(metrics.last_updated).toLocaleTimeString()}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Market Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Live Market Data
          </CardTitle>
          <CardDescription>
            Real-time cryptocurrency prices and volume
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {marketData.length > 0 ? (
              marketData.map((data, index) => (
                <div
                  key={`${data.symbol}-${index}`}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div>
                      <h4 className="font-semibold">{data.symbol}</h4>
                      <p className="text-sm text-muted-foreground">
                        Vol: {data.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-bold">
                      ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className={`text-sm ${data.change_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {data.change_24h >= 0 ? '+' : ''}${data.change_24h.toFixed(2)} (24h)
                    </p>
                  </div>
                  
                  <Badge variant="outline" className="text-green-500">
                    <BarChart3 className="w-3 h-3 mr-1" />
                    LIVE
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Loading real-time market data...
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};