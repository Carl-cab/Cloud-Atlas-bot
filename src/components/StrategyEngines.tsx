import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Target,
  Zap,
  BarChart3,
  PlayCircle,
  PauseCircle,
  Settings,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StrategySignal {
  id: string;
  symbol: string;
  signal_type: 'buy' | 'sell' | 'hold';
  strategy_type: 'trend_following' | 'mean_reversion';
  confidence: number;
  price: number;
  timestamp: string;
  indicators: any;
  ml_score?: number;
}

interface StrategyConfig {
  trendFollowing: {
    enabled: boolean;
    emaShort: number;
    emaLong: number;
    adxThreshold: number;
    macdEnabled: boolean;
    bollingerEnabled: boolean;
  };
  meanReversion: {
    enabled: boolean;
    rsiOverbought: number;
    rsiOversold: number;
    bollingerEnabled: boolean;
    supportResistanceEnabled: boolean;
  };
}

export const StrategyEngines: React.FC = () => {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD');
  const [signals, setSignals] = useState<StrategySignal[]>([]);
  const [activeStrategies, setActiveStrategies] = useState<string[]>(['trend_following', 'mean_reversion']);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>({
    trendFollowing: {
      enabled: true,
      emaShort: 9,
      emaLong: 21,
      adxThreshold: 20,
      macdEnabled: true,
      bollingerEnabled: true,
    },
    meanReversion: {
      enabled: true,
      rsiOverbought: 70,
      rsiOversold: 30,
      bollingerEnabled: true,
      supportResistanceEnabled: true,
    }
  });

  // Fetch recent signals
  useEffect(() => {
    fetchRecentSignals();
  }, [selectedSymbol]);

  // Set up real-time signal subscriptions
  useEffect(() => {
    if (!isRunning) return;

    const signalsChannel = supabase
      .channel('strategy-signals-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'strategy_signals',
          filter: `symbol=eq.${selectedSymbol}`,
        },
        (payload) => {
          const newSignal = payload.new as StrategySignal;
          setSignals(prev => [newSignal, ...prev.slice(0, 49)]);
          
          if (newSignal.signal_type !== 'hold') {
            toast({
              title: `New ${newSignal.signal_type.toUpperCase()} Signal`,
              description: `${newSignal.strategy_type.replace('_', ' ')} strategy detected ${newSignal.signal_type} opportunity for ${selectedSymbol}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(signalsChannel);
    };
  }, [isRunning, selectedSymbol]);

  const fetchRecentSignals = async () => {
    try {
      const { data, error } = await supabase
        .from('strategy_signals')
        .select('*')
        .eq('symbol', selectedSymbol)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSignals((data || []) as StrategySignal[]);
    } catch (error) {
      console.error('Error fetching signals:', error);
      toast({
        title: "Error",
        description: "Failed to fetch strategy signals",
        variant: "destructive",
      });
    }
  };

  const startStrategyEngines = async () => {
    try {
      setIsRunning(true);
      
      // Call trading bot to start strategy engines
      const { data, error } = await supabase.functions.invoke('trading-bot', {
        body: { 
          action: 'start_strategies',
          symbol: selectedSymbol,
          strategies: activeStrategies,
          config: strategyConfig
        }
      });

      if (error) throw error;

      toast({
        title: "Strategy Engines Started",
        description: `Running ${activeStrategies.length} strategies for ${selectedSymbol}`,
      });
    } catch (error) {
      console.error('Error starting strategy engines:', error);
      setIsRunning(false);
      toast({
        title: "Error",
        description: "Failed to start strategy engines",
        variant: "destructive",
      });
    }
  };

  const stopStrategyEngines = () => {
    setIsRunning(false);
    toast({
      title: "Strategy Engines Stopped",
      description: "All strategy signal generation stopped",
    });
  };

  const generateSignal = async (strategyType: 'trend_following' | 'mean_reversion') => {
    try {
      const { data, error } = await supabase.functions.invoke('trading-bot', {
        body: { 
          action: 'generate_signal',
          symbol: selectedSymbol,
          strategy: strategyType,
          config: strategyConfig[strategyType === 'trend_following' ? 'trendFollowing' : 'meanReversion']
        }
      });

      if (error) throw error;

      toast({
        title: "Signal Generated",
        description: `Manual ${strategyType.replace('_', ' ')} signal generated for ${selectedSymbol}`,
      });

      // Refresh signals
      setTimeout(() => fetchRecentSignals(), 1000);
    } catch (error) {
      console.error('Error generating signal:', error);
      toast({
        title: "Error",
        description: "Failed to generate signal",
        variant: "destructive",
      });
    }
  };

  const getSignalColor = (signalType: string) => {
    switch (signalType) {
      case 'buy': return 'text-success';
      case 'sell': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  const getSignalIcon = (signalType: string) => {
    switch (signalType) {
      case 'buy': return <TrendingUp className="w-4 h-4" />;
      case 'sell': return <TrendingDown className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getStrategyColor = (strategyType: string) => {
    switch (strategyType) {
      case 'trend_following': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'mean_reversion': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const signalChartData = signals.slice(0, 20).reverse().map((signal, index) => ({
    time: new Date(signal.timestamp).toLocaleTimeString(),
    confidence: signal.confidence,
    price: Number(signal.price),
    signalType: signal.signal_type,
  }));

  const trendFollowingSignals = signals.filter(s => s.strategy_type === 'trend_following');
  const meanReversionSignals = signals.filter(s => s.strategy_type === 'mean_reversion');

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Strategy Engines
              </CardTitle>
              <CardDescription>
                Trend-following and mean-reversion signal generation
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
                {signals.length} Signals
              </Badge>

              <Button
                variant={isRunning ? "destructive" : "default"}
                onClick={isRunning ? stopStrategyEngines : startStrategyEngines}
              >
                {isRunning ? (
                  <>
                    <PauseCircle className="w-4 h-4 mr-2" />
                    Stop Engines
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Start Engines
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Strategy Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trend Following</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {trendFollowingSignals.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Signals generated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mean Reversion</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">
              {meanReversionSignals.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Signals generated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Buy Signals</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {signals.filter(s => s.signal_type === 'buy').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Bullish opportunities
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sell Signals</CardTitle>
            <TrendingDown className="h-4 w-4 text-danger" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-danger">
              {signals.filter(s => s.signal_type === 'sell').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Bearish opportunities
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Strategy Configuration & Signals */}
      <Tabs defaultValue="signals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="signals">Active Signals</TabsTrigger>
          <TabsTrigger value="trend">Trend Following</TabsTrigger>
          <TabsTrigger value="reversion">Mean Reversion</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="signals">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Signals Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Signal Confidence Over Time</CardTitle>
                <CardDescription>Recent signal strength and timing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={signalChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="confidence" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Recent Signals List */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Signals</CardTitle>
                <CardDescription>Latest strategy-generated signals</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[300px] overflow-y-auto">
                  {signals.slice(0, 10).map((signal) => (
                    <div key={signal.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getSignalIcon(signal.signal_type)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${getSignalColor(signal.signal_type)}`}>
                              {signal.signal_type.toUpperCase()}
                            </span>
                            <Badge variant="outline" className={getStrategyColor(signal.strategy_type)}>
                              {signal.strategy_type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            ${Number(signal.price).toFixed(2)} • {new Date(signal.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{signal.confidence}%</div>
                        <Progress value={signal.confidence} className="w-16 h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-500" />
                    Trend Following Engine
                  </CardTitle>
                  <CardDescription>
                    EMA crossovers, MACD signals, and Bollinger breakouts
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => generateSignal('trend_following')}
                  disabled={isRunning}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Generate Signal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Strategy Rules */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-3">Entry Conditions</h4>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li>• EMA(9/21) crossover aligned with SMA(50/200)</li>
                      <li>• MACD line &gt; signal line</li>
                      <li>• Bollinger breakout confirmed by volume spike</li>
                      <li>• ADX(14) ≥ {strategyConfig.trendFollowing.adxThreshold} for strong trend</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-3">Exit Strategy</h4>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li>• Stop Loss: 1.8 × ATR(14)</li>
                      <li>• Take Profit 1: 1 × ATR → close 50%, move stop to breakeven</li>
                      <li>• Take Profit 2: 3 × ATR or trailing stop at 1 × ATR</li>
                    </ul>
                  </div>
                </div>

                {/* Recent Trend Following Signals */}
                <div>
                  <h4 className="font-medium mb-3">Recent Trend Following Signals</h4>
                  <div className="space-y-2">
                    {trendFollowingSignals.slice(0, 5).map((signal) => (
                      <div key={signal.id} className="flex items-center justify-between p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          {getSignalIcon(signal.signal_type)}
                          <div>
                            <span className={`font-medium ${getSignalColor(signal.signal_type)}`}>
                              {signal.signal_type.toUpperCase()}
                            </span>
                            <p className="text-sm text-muted-foreground">
                              ${Number(signal.price).toFixed(2)} • {new Date(signal.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm font-medium">{signal.confidence}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reversion">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-purple-500" />
                    Mean Reversion Engine
                  </CardTitle>
                  <CardDescription>
                    RSI oversold/overbought and Bollinger band bounces
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => generateSignal('mean_reversion')}
                  disabled={isRunning}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Generate Signal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Strategy Rules */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-3">Entry Conditions</h4>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li>• RSI(14) &lt;{strategyConfig.meanReversion.rsiOversold} (Buy) or &gt;{strategyConfig.meanReversion.rsiOverbought} (Sell)</li>
                      <li>• Bounce from Bollinger Bands near support/resistance</li>
                      <li>• Confirmed by decreasing volume on overshoot</li>
                      <li>• Price touching key support/resistance levels</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-3">Exit Strategy</h4>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li>• Stop Loss: 1.8 × ATR(14)</li>
                      <li>• Take Profit: Return to mean (middle Bollinger Band)</li>
                      <li>• RSI returning to neutral territory (30-70)</li>
                    </ul>
                  </div>
                </div>

                {/* Recent Mean Reversion Signals */}
                <div>
                  <h4 className="font-medium mb-3">Recent Mean Reversion Signals</h4>
                  <div className="space-y-2">
                    {meanReversionSignals.slice(0, 5).map((signal) => (
                      <div key={signal.id} className="flex items-center justify-between p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          {getSignalIcon(signal.signal_type)}
                          <div>
                            <span className={`font-medium ${getSignalColor(signal.signal_type)}`}>
                              {signal.signal_type.toUpperCase()}
                            </span>
                            <p className="text-sm text-muted-foreground">
                              ${Number(signal.price).toFixed(2)} • {new Date(signal.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm font-medium">{signal.confidence}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trend Following Config */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Trend Following Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="trend-enabled">Enable Trend Following</Label>
                  <Switch
                    id="trend-enabled"
                    checked={strategyConfig.trendFollowing.enabled}
                    onCheckedChange={(checked) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        trendFollowing: { ...prev.trendFollowing, enabled: checked }
                      }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="macd-enabled">MACD Signals</Label>
                  <Switch
                    id="macd-enabled"
                    checked={strategyConfig.trendFollowing.macdEnabled}
                    onCheckedChange={(checked) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        trendFollowing: { ...prev.trendFollowing, macdEnabled: checked }
                      }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="bollinger-trend-enabled">Bollinger Breakouts</Label>
                  <Switch
                    id="bollinger-trend-enabled"
                    checked={strategyConfig.trendFollowing.bollingerEnabled}
                    onCheckedChange={(checked) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        trendFollowing: { ...prev.trendFollowing, bollingerEnabled: checked }
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>ADX Threshold: {strategyConfig.trendFollowing.adxThreshold}</Label>
                  <input
                    type="range"
                    min="15"
                    max="30"
                    value={strategyConfig.trendFollowing.adxThreshold}
                    onChange={(e) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        trendFollowing: { ...prev.trendFollowing, adxThreshold: Number(e.target.value) }
                      }))
                    }
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Mean Reversion Config */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Mean Reversion Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="reversion-enabled">Enable Mean Reversion</Label>
                  <Switch
                    id="reversion-enabled"
                    checked={strategyConfig.meanReversion.enabled}
                    onCheckedChange={(checked) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        meanReversion: { ...prev.meanReversion, enabled: checked }
                      }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="bollinger-reversion-enabled">Bollinger Band Bounces</Label>
                  <Switch
                    id="bollinger-reversion-enabled"
                    checked={strategyConfig.meanReversion.bollingerEnabled}
                    onCheckedChange={(checked) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        meanReversion: { ...prev.meanReversion, bollingerEnabled: checked }
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>RSI Overbought: {strategyConfig.meanReversion.rsiOverbought}</Label>
                  <input
                    type="range"
                    min="65"
                    max="80"
                    value={strategyConfig.meanReversion.rsiOverbought}
                    onChange={(e) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        meanReversion: { ...prev.meanReversion, rsiOverbought: Number(e.target.value) }
                      }))
                    }
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>RSI Oversold: {strategyConfig.meanReversion.rsiOversold}</Label>
                  <input
                    type="range"
                    min="20"
                    max="35"
                    value={strategyConfig.meanReversion.rsiOversold}
                    onChange={(e) => 
                      setStrategyConfig(prev => ({
                        ...prev,
                        meanReversion: { ...prev.meanReversion, rsiOversold: Number(e.target.value) }
                      }))
                    }
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};