
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, TrendingUp, TrendingDown, Brain, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BotStatus {
  isActive: boolean;
  mode: 'paper' | 'live';
  balance: number;
  totalPnL: number;
  dailyPnL: number;
  winRate: number;
  activeTrades: number;
  riskUsed: number;
}

interface MarketRegime {
  regime: 'trend' | 'range' | 'high_volatility';
  confidence: number;
  trend_strength: number;
  volatility: number;
}

interface TradingSignal {
  symbol: string;
  signal_type: 'buy' | 'sell' | 'hold';
  confidence: number;
  price: number;
  strategy_type: 'trend_following' | 'mean_reversion';
  ml_score: number;
  timestamp: string;
}

export const RealTimeTradingDashboard = () => {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isActive: false,
    mode: 'paper',
    balance: 10000,
    totalPnL: 0,
    dailyPnL: 0,
    winRate: 0,
    activeTrades: 0,
    riskUsed: 0
  });
  
  const [currentRegime, setCurrentRegime] = useState<MarketRegime | null>(null);
  const [latestSignal, setLatestSignal] = useState<TradingSignal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadBotData();
    
    // Set up real-time subscriptions
    const channel = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bot_config'
      }, () => loadBotData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trading_positions'
      }, () => loadBotData())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_pnl'
      }, () => loadBotData())
      .subscribe();

    const interval = setInterval(loadBotData, 30000); // Update every 30 seconds
    
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const loadBotData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load bot config with safe pattern
      const { data: config } = await supabase
        .from('bot_config')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const mode = (config?.mode || 'paper') as 'paper' | 'live';
      const balance = mode === 'paper' 
        ? (config?.paper_trading_balance || 10000)
        : (config?.capital_cad || 100);

      setBotStatus(prev => ({
        ...prev,
        isActive: config?.is_active || false,
        mode: mode,
        balance: balance
      }));

      // Load latest P&L with safe pattern
      const today = new Date().toISOString().split('T')[0];
      const { data: pnl } = await supabase
        .from('daily_pnl')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const winRate = pnl?.win_rate ? pnl.win_rate / 100 : 0; // Convert percentage to decimal

      setBotStatus(prev => ({
        ...prev,
        totalPnL: pnl?.total_pnl || 0,
        dailyPnL: pnl?.total_pnl || 0,
        winRate: winRate
      }));

      // Load active positions
      const { data: positions } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open');

      setBotStatus(prev => ({
        ...prev,
        activeTrades: positions?.length || 0,
        riskUsed: positions?.reduce((sum, pos) => sum + (pos.risk_amount || 0), 0) || 0
      }));

      // Load latest regime with safe pattern
      const { data: regime } = await supabase
        .from('market_regimes')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (regime) {
        setCurrentRegime({
          regime: regime.regime as 'trend' | 'range' | 'high_volatility',
          confidence: regime.confidence || 0,
          trend_strength: regime.trend_strength || 0,
          volatility: regime.volatility || 0
        });
      }

      // Load latest signal with safe pattern
      const { data: signal } = await supabase
        .from('strategy_signals')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (signal) {
        setLatestSignal({
          symbol: signal.symbol || '',
          signal_type: signal.signal_type as 'buy' | 'sell' | 'hold',
          confidence: signal.confidence || 0,
          price: signal.price || 0,
          strategy_type: signal.strategy_type as 'trend_following' | 'mean_reversion',
          ml_score: signal.ml_score || 0,
          timestamp: signal.timestamp || new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('Error loading bot data:', error);
    }
  };

  const toggleBot = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          is_active: !botStatus.isActive
        });

      setBotStatus(prev => ({ ...prev, isActive: !prev.isActive }));
      
      toast({
        title: botStatus.isActive ? 'Bot Stopped' : 'Bot Started',
        description: botStatus.isActive ? 'Trading bot has been deactivated' : 'Trading bot is now active',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle bot status',
        variant: 'destructive'
      });
    }
  };

  const analyzeMarket = async () => {
    setIsAnalyzing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('trading-bot', {
        body: {
          action: 'analyze_market',
          symbol: 'XBTUSD',
          userId: user.id
        }
      });

      if (error) throw error;

      setCurrentRegime(data.regime);
      setLatestSignal(data.signal);
      
      toast({
        title: 'Market Analysis Complete',
        description: `Market regime: ${data.regime.regime} (${((data.regime.confidence || 0) * 100).toFixed(1)}% confidence)`,
      });
      
      await loadBotData(); // Refresh data
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'Unable to analyze market conditions',
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const executeTrade = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('trading-bot', {
        body: {
          action: 'execute_trade',
          symbol: 'XBTUSD',
          userId: user.id
        }
      });

      if (error) throw error;

      toast({
        title: 'Trade Execution',
        description: data.message,
      });
      
      await loadBotData(); // Refresh data
    } catch (error) {
      toast({
        title: 'Trade Failed',
        description: 'Unable to execute trade',
        variant: 'destructive'
      });
    }
  };

  const trainModel = async () => {
    setIsTraining(true);
    try {
      const { data, error } = await supabase.functions.invoke('trading-bot', {
        body: {
          action: 'train_model',
          symbol: 'XBTUSD'
        }
      });

      if (error) throw error;

      toast({
        title: 'Model Training Complete',
        description: `New model trained with ${((data.model.accuracy || 0) * 100).toFixed(1)}% accuracy`,
      });
    } catch (error) {
      toast({
        title: 'Training Failed',
        description: 'Unable to train ML model',
        variant: 'destructive'
      });
    } finally {
      setIsTraining(false);
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'trend': return 'bg-emerald-500';
      case 'range': return 'bg-amber-500';
      case 'high_volatility': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'buy': return 'text-emerald-600';
      case 'sell': return 'text-red-600';
      default: return 'text-amber-600';
    }
  };

  // Helper function to safely format numbers
  const safeToFixed = (value: number | null | undefined, decimals: number = 2): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0.00';
    }
    return value.toFixed(decimals);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Trading Bot Dashboard</h1>
          <p className="text-muted-foreground">Real-time crypto trading with machine learning</p>
        </div>
        <div className="flex items-center space-x-4">
          <Badge variant={botStatus.mode === 'paper' ? 'outline' : 'default'}>
            {botStatus.mode === 'paper' ? 'PAPER TRADING' : 'LIVE TRADING'}
          </Badge>
          <Badge variant={botStatus.isActive ? 'default' : 'secondary'}>
            {botStatus.isActive ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
          <Switch
            checked={botStatus.isActive}
            onCheckedChange={toggleBot}
          />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {botStatus.mode === 'paper' ? 'Paper Balance' : 'Live Balance'}
                </p>
                <p className="text-2xl font-bold">${safeToFixed(botStatus.balance)}</p>
              </div>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Daily P&L</p>
                <p className={`text-2xl font-bold ${(botStatus.dailyPnL || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${safeToFixed(botStatus.dailyPnL)}
                </p>
              </div>
              {(botStatus.dailyPnL || 0) >= 0 ? 
                <TrendingUp className="h-4 w-4 text-emerald-600" /> : 
                <TrendingDown className="h-4 w-4 text-red-600" />
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold">{safeToFixed((botStatus.winRate || 0) * 100, 1)}%</p>
              </div>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Trades</p>
                <p className="text-2xl font-bold">{botStatus.activeTrades || 0}</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="analysis">Market Analysis</TabsTrigger>
          <TabsTrigger value="signals">Trading Signals</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="ml">ML Models</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Market Regime Detection</h3>
            <Button onClick={analyzeMarket} disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'Analyze Market'}
            </Button>
          </div>

          {currentRegime && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getRegimeColor(currentRegime.regime)}`} />
                  Market Regime: {currentRegime.regime.toUpperCase()}
                </CardTitle>
                <CardDescription>
                  Confidence: {safeToFixed((currentRegime.confidence || 0) * 100, 1)}%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Trend Strength</span>
                      <span>{safeToFixed(Math.abs(currentRegime.trend_strength || 0) * 100, 1)}%</span>
                    </div>
                    <Progress value={Math.abs(currentRegime.trend_strength || 0) * 100} className="mt-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm">
                      <span>Volatility</span>
                      <span>{safeToFixed((currentRegime.volatility || 0) * 100)}%</span>
                    </div>
                    <Progress value={(currentRegime.volatility || 0) * 100} className="mt-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="signals" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Latest Trading Signal</h3>
            <Button onClick={executeTrade} disabled={!botStatus.isActive || !latestSignal}>
              Execute Trade
            </Button>
          </div>

          {latestSignal && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className={getSignalColor(latestSignal.signal_type)}>
                    {latestSignal.signal_type.toUpperCase()}
                  </span>
                  {latestSignal.symbol}
                </CardTitle>
                <CardDescription>
                  Strategy: {latestSignal.strategy_type.replace('_', ' ').toUpperCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Price</p>
                    <p className="text-lg font-semibold">${safeToFixed(latestSignal.price)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Confidence</p>
                    <p className="text-lg font-semibold">{safeToFixed((latestSignal.confidence || 0) * 100, 1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ML Score</p>
                    <p className="text-lg font-semibold">{safeToFixed((latestSignal.ml_score || 0) * 100, 1)}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Timestamp</p>
                    <p className="text-lg font-semibold">
                      {new Date(latestSignal.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <h3 className="text-lg font-semibold">Active Positions</h3>
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                {botStatus.activeTrades === 0 ? 'No active positions' : `${botStatus.activeTrades} active position(s)`}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ml" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Machine Learning Models</h3>
            <Button onClick={trainModel} disabled={isTraining}>
              <Brain className="w-4 h-4 mr-2" />
              {isTraining ? 'Training...' : 'Train Model'}
            </Button>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                ML models are retrained daily with latest market data
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
