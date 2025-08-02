import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  BarChart3, 
  Zap,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MarketData {
  id: string;
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timeframe: string;
}

interface MarketRegime {
  id: string;
  symbol: string;
  regime: string;
  confidence: number;
  volatility: number;
  trend_strength: number;
  timestamp: string;
}

interface TechnicalIndicators {
  adx: number;
  atr: number;
  rsi: number;
  ema9: number;
  ema21: number;
  sma50: number;
  sma200: number;
}

export const MarketDataRegimeDetection: React.FC = () => {
  const { toast } = useToast();
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD');
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [currentRegime, setCurrentRegime] = useState<MarketRegime | null>(null);
  const [indicators, setIndicators] = useState<TechnicalIndicators>({
    adx: 0,
    atr: 0,
    rsi: 50,
    ema9: 0,
    ema21: 0,
    sma50: 0,
    sma200: 0,
  });
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch initial data
  useEffect(() => {
    fetchMarketData();
    fetchCurrentRegime();
  }, [selectedSymbol]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!isStreaming) return;

    const marketDataChannel = supabase
      .channel('market-data-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'market_data',
          filter: `symbol=eq.${selectedSymbol}`,
        },
        (payload) => {
          const newData = payload.new as MarketData;
          setMarketData(prev => [...prev.slice(-99), newData]);
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    const regimeChannel = supabase
      .channel('regime-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'market_regimes',
          filter: `symbol=eq.${selectedSymbol}`,
        },
        (payload) => {
          const newRegime = payload.new as MarketRegime;
          setCurrentRegime(newRegime);
          
          toast({
            title: "Regime Change Detected",
            description: `${selectedSymbol} regime changed to ${newRegime.regime} (${newRegime.confidence}% confidence)`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(marketDataChannel);
      supabase.removeChannel(regimeChannel);
    };
  }, [isStreaming, selectedSymbol]);

  const fetchMarketData = async () => {
    try {
      const { data, error } = await supabase
        .from('market_data')
        .select('*')
        .eq('symbol', selectedSymbol)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      setMarketData(data || []);
    } catch (error) {
      console.error('Error fetching market data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch market data",
        variant: "destructive",
      });
    }
  };

  const fetchCurrentRegime = async () => {
    try {
      const { data, error } = await supabase
        .from('market_regimes')
        .select('*')
        .eq('symbol', selectedSymbol)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setCurrentRegime(data);
    } catch (error) {
      console.error('Error fetching regime data:', error);
    }
  };

  const startDataStream = async () => {
    try {
      setIsStreaming(true);
      
      // Call trading bot to start market analysis
      const { data, error } = await supabase.functions.invoke('trading-bot', {
        body: { 
          action: 'analyze_market',
          symbol: selectedSymbol,
          continuous: true
        }
      });

      if (error) throw error;

      toast({
        title: "Data Stream Started",
        description: `Real-time market data streaming for ${selectedSymbol}`,
      });
    } catch (error) {
      console.error('Error starting data stream:', error);
      setIsStreaming(false);
      toast({
        title: "Error",
        description: "Failed to start data stream",
        variant: "destructive",
      });
    }
  };

  const stopDataStream = () => {
    setIsStreaming(false);
    toast({
      title: "Data Stream Stopped",
      description: "Real-time market data streaming stopped",
    });
  };

  const triggerAnalysis = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('trading-bot', {
        body: { 
          action: 'analyze_market',
          symbol: selectedSymbol
        }
      });

      if (error) throw error;

      toast({
        title: "Analysis Triggered",
        description: `Market analysis initiated for ${selectedSymbol}`,
      });

      // Refresh data after analysis
      setTimeout(() => {
        fetchMarketData();
        fetchCurrentRegime();
      }, 2000);
    } catch (error) {
      console.error('Error triggering analysis:', error);
      toast({
        title: "Error",
        description: "Failed to trigger market analysis",
        variant: "destructive",
      });
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'trending': return 'text-success';
      case 'ranging': return 'text-warning';
      case 'high_volatility': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'trending': return <TrendingUp className="w-4 h-4" />;
      case 'ranging': return <Activity className="w-4 h-4" />;
      case 'high_volatility': return <AlertTriangle className="w-4 h-4" />;
      default: return <BarChart3 className="w-4 h-4" />;
    }
  };

  const chartData = marketData.slice(-50).map(data => ({
    time: new Date(data.timestamp).toLocaleTimeString(),
    price: Number(data.close),
    volume: Number(data.volume),
  }));

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Market Data & Regime Detection
              </CardTitle>
              <CardDescription>
                Real-time Kraken data with ADX/ATR calculations and regime classification
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <select 
                value={selectedSymbol} 
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="px-3 py-2 border rounded-md bg-background"
              >
                <option value="BTCUSD">BTC/USD</option>
                <option value="ETHUSD">ETH/USD</option>
                <option value="BTCCAD">BTC/CAD</option>
                <option value="ETHCAD">ETH/CAD</option>
              </select>
              
              <Badge variant="outline" className="px-3 py-2">
                Last Update: {lastUpdate.toLocaleTimeString()}
              </Badge>

              <Button
                variant="outline"
                size="sm"
                onClick={triggerAnalysis}
                disabled={isStreaming}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Analyze
              </Button>

              <Button
                variant={isStreaming ? "destructive" : "default"}
                onClick={isStreaming ? stopDataStream : startDataStream}
              >
                {isStreaming ? (
                  <>
                    <PauseCircle className="w-4 h-4 mr-2" />
                    Stop Stream
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Start Stream
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Current Regime Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Regime</CardTitle>
            {currentRegime && getRegimeIcon(currentRegime.regime)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${currentRegime ? getRegimeColor(currentRegime.regime) : 'text-muted-foreground'}`}>
              {currentRegime?.regime || 'Unknown'}
            </div>
            <p className="text-xs text-muted-foreground">
              Confidence: {currentRegime?.confidence || 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ADX (14)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {indicators.adx.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Trend strength indicator
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ATR (14)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {indicators.atr.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">
              Average True Range
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volatility</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentRegime?.volatility || 0}%
            </div>
            <Progress value={currentRegime?.volatility || 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trend Strength</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currentRegime?.trend_strength || 0}%
            </div>
            <Progress value={currentRegime?.trend_strength || 0} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="price" className="space-y-4">
        <TabsList>
          <TabsTrigger value="price">Price Chart</TabsTrigger>
          <TabsTrigger value="volume">Volume</TabsTrigger>
          <TabsTrigger value="indicators">Technical Indicators</TabsTrigger>
        </TabsList>

        <TabsContent value="price">
          <Card>
            <CardHeader>
              <CardTitle>Price Movement - {selectedSymbol}</CardTitle>
              <CardDescription>Real-time price data from Kraken</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="volume">
          <Card>
            <CardHeader>
              <CardTitle>Trading Volume - {selectedSymbol}</CardTitle>
              <CardDescription>Volume analysis and patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="volume" 
                      stroke="hsl(var(--secondary))" 
                      fill="hsl(var(--secondary))"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indicators">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Moving Averages</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">EMA 9</span>
                  <span className="font-mono">{indicators.ema9.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">EMA 21</span>
                  <span className="font-mono">{indicators.ema21.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">SMA 50</span>
                  <span className="font-mono">{indicators.sma50.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">SMA 200</span>
                  <span className="font-mono">{indicators.sma200.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Momentum Indicators</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">RSI (14)</span>
                    <span className="font-mono">{indicators.rsi.toFixed(2)}</span>
                  </div>
                  <Progress value={indicators.rsi} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">ADX (14)</span>
                    <span className="font-mono">{indicators.adx.toFixed(2)}</span>
                  </div>
                  <Progress value={Math.min(indicators.adx, 100)} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Regime Classification Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Regime Classification Rules</CardTitle>
          <CardDescription>
            Current classification logic based on technical indicators
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-success" />
                <span className="font-medium text-success">Trending</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• ADX(14) ≥ 20</li>
                <li>• |EMA50 - EMA200| / Price &gt; 0.5%</li>
                <li>• Strong directional movement</li>
              </ul>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-warning" />
                <span className="font-medium text-warning">Ranging</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• ADX(14) &lt; 20</li>
                <li>• Bollinger Bandwidth &lt; 60-day median</li>
                <li>• Sideways price action</li>
              </ul>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-danger" />
                <span className="font-medium text-danger">High Volatility</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• ATR(14)/Price ≥ 2%</li>
                <li>• Increased market uncertainty</li>
                <li>• Reduced position sizing recommended</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};