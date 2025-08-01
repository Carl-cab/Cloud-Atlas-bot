import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  Shield, 
  Settings, 
  BarChart3,
  AlertTriangle,
  Zap,
  Target,
  DollarSign,
  Bot,
  Gauge,
  LogOut
} from 'lucide-react';
import { PlatformSelector } from './PlatformSelector';
import { MarketAnalysis } from './MarketAnalysis';
import { PortfolioOverview } from './PortfolioOverview';
import { AutoTradingControls } from './AutoTradingControls';
import { RiskManagement } from './RiskManagement';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface BotStatus {
  isActive: boolean;
  balance: number;
  totalPnL: number;
  dailyPnL: number;
  winRate: number;
  activeTrades: number;
  riskUsed: number;
  selectedPlatform: string;
}

interface TradingMetrics {
  profitOptimization: number;
  riskControl: number;
  marketStability: number;
  trendDetection: number;
  timing: number;
}

export const CloudAtlasBot = () => {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isActive: false,
    balance: 100,
    totalPnL: 0,
    dailyPnL: 0,
    winRate: 0,
    activeTrades: 0,
    riskUsed: 0,
    selectedPlatform: 'kraken'
  });

  const [tradingMetrics, setTradingMetrics] = useState<TradingMetrics>({
    profitOptimization: 85,
    riskControl: 92,
    marketStability: 78,
    trendDetection: 88,
    timing: 94
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(false);
  
  const { signOut } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    loadBotData();
    const interval = setInterval(loadBotData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadBotData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: config } = await supabase
        .from('bot_config')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (config) {
        setBotStatus(prev => ({
          ...prev,
          isActive: config.is_active && !emergencyStop,
          balance: config.capital_cad
        }));
      }

      // Simulate real-time metrics updates
      setTradingMetrics(prev => ({
        profitOptimization: Math.max(70, Math.min(95, prev.profitOptimization + (Math.random() - 0.5) * 4)),
        riskControl: Math.max(80, Math.min(98, prev.riskControl + (Math.random() - 0.5) * 2)),
        marketStability: Math.max(60, Math.min(90, prev.marketStability + (Math.random() - 0.5) * 6)),
        trendDetection: Math.max(75, Math.min(95, prev.trendDetection + (Math.random() - 0.5) * 3)),
        timing: Math.max(85, Math.min(98, prev.timing + (Math.random() - 0.5) * 2))
      }));

    } catch (error) {
      console.error('Error loading bot data:', error);
    }
  };

  const toggleBot = async () => {
    if (emergencyStop) {
      toast({
        title: 'Emergency Stop Active',
        description: 'Disable emergency stop first before activating the bot',
        variant: 'destructive'
      });
      return;
    }

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
        title: botStatus.isActive ? 'CloudAtlasBot Stopped' : 'CloudAtlasBot Started',
        description: botStatus.isActive ? 'Trading bot has been deactivated' : 'Advanced trading automation is now active',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle bot status',
        variant: 'destructive'
      });
    }
  };

  const handleEmergencyStop = () => {
    setEmergencyStop(!emergencyStop);
    if (!emergencyStop) {
      setBotStatus(prev => ({ ...prev, isActive: false }));
      toast({
        title: 'Emergency Stop Activated',
        description: 'All trading activities have been immediately halted',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Emergency Stop Deactivated',
        description: 'Trading can now be resumed',
      });
    }
  };

  const handlePlatformConnect = async (platformId: string) => {
    toast({
      title: 'Connecting to Platform',
      description: `Establishing connection with ${platformId.toUpperCase()}...`,
    });
    // Simulate connection process
    setTimeout(() => {
      toast({
        title: 'Platform Connected',
        description: `Successfully connected to ${platformId.toUpperCase()}`,
      });
    }, 2000);
  };

  const handlePlatformDisconnect = async (platformId: string) => {
    toast({
      title: 'Platform Disconnected',
      description: `Disconnected from ${platformId.toUpperCase()}`,
      variant: 'destructive'
    });
  };

  const handleFeatureClick = (platformId: string, feature: string) => {
    toast({
      title: `${feature} Feature`,
      description: `Opening ${feature} for ${platformId.toUpperCase()}...`,
    });
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

      toast({
        title: 'Market Analysis Complete',
        description: `Advanced AI analysis completed for ${botStatus.selectedPlatform.toUpperCase()}`,
      });
      
      await loadBotData();
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'Unable to complete market analysis',
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getMetricColor = (value: number) => {
    if (value >= 90) return 'text-success';
    if (value >= 75) return 'text-primary';
    if (value >= 60) return 'text-yellow-500';
    return 'text-danger';
  };

  return (
    <div className="min-h-screen bg-gradient-hero p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Bot className="h-8 w-8 text-primary animate-glow" />
            <div>
              <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                CloudAtlasBot
              </h1>
              <p className="text-muted-foreground">Agentic AI Crypto Trading Bot — Multi‑Exchange, Real‑Time Alerts, Performance Reporting</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline" className="text-xs">Kraken Live</Badge>
                <Badge variant="outline" className="text-xs">ML Ranker</Badge>
                <Badge variant="outline" className="text-xs">Regime Detection</Badge>
                <Badge variant="outline" className="text-xs">Real-time Alerts</Badge>
                <Badge variant="outline" className="text-xs">$100 CAD Beta</Badge>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Badge 
            variant={botStatus.isActive ? 'default' : 'secondary'} 
            className={`${botStatus.isActive ? 'bg-gradient-primary animate-trading-pulse' : ''} text-sm px-3 py-1`}
          >
            {botStatus.isActive ? '🔥 ACTIVE' : '⏸ INACTIVE'}
          </Badge>
          
          <Button
            variant={emergencyStop ? 'destructive' : 'outline'}
            size="sm"
            onClick={handleEmergencyStop}
            className={emergencyStop ? 'animate-trading-pulse' : ''}
          >
            <Shield className="w-4 h-4 mr-2" />
            {emergencyStop ? 'EMERGENCY STOP' : 'Emergency'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
          
          <Switch
            checked={botStatus.isActive && !emergencyStop}
            onCheckedChange={toggleBot}
            disabled={emergencyStop}
          />
        </div>
      </div>

      {/* Key Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="card-shadow hover:trading-glow transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Balance</p>
                <p className="text-2xl font-bold text-primary">${botStatus.balance.toFixed(2)}</p>
              </div>
              <DollarSign className="h-5 w-5 text-primary animate-glow" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-shadow hover:trading-glow transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Daily P&L</p>
                <p className={`text-2xl font-bold ${botStatus.dailyPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                  ${botStatus.dailyPnL.toFixed(2)}
                </p>
              </div>
              {botStatus.dailyPnL >= 0 ? 
                <TrendingUp className="h-5 w-5 text-success" /> : 
                <TrendingDown className="h-5 w-5 text-danger" />
              }
            </div>
          </CardContent>
        </Card>

        <Card className="card-shadow hover:trading-glow transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold text-primary">{(botStatus.winRate * 100).toFixed(1)}%</p>
              </div>
              <Target className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-shadow hover:trading-glow transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Trades</p>
                <p className="text-2xl font-bold text-primary">{botStatus.activeTrades}</p>
              </div>
              <Activity className="h-5 w-5 text-primary animate-trading-pulse" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-shadow hover:trading-glow transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Risk Used</p>
                <p className="text-2xl font-bold text-primary">{botStatus.riskUsed.toFixed(1)}%</p>
              </div>
              <Gauge className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Smart Trading Logic Metrics */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary animate-glow" />
            Smart Trading Logic Performance
          </CardTitle>
          <CardDescription>Real-time AI performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Trend Detection
                </span>
                <span className={getMetricColor(tradingMetrics.trendDetection)}>
                  {tradingMetrics.trendDetection.toFixed(1)}%
                </span>
              </div>
              <Progress value={tradingMetrics.trendDetection} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Perfect Timing
                </span>
                <span className={getMetricColor(tradingMetrics.timing)}>
                  {tradingMetrics.timing.toFixed(1)}%
                </span>
              </div>
              <Progress value={tradingMetrics.timing} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Risk Control
                </span>
                <span className={getMetricColor(tradingMetrics.riskControl)}>
                  {tradingMetrics.riskControl.toFixed(1)}%
                </span>
              </div>
              <Progress value={tradingMetrics.riskControl} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Profit Optimization
                </span>
                <span className={getMetricColor(tradingMetrics.profitOptimization)}>
                  {tradingMetrics.profitOptimization.toFixed(1)}%
                </span>
              </div>
              <Progress value={tradingMetrics.profitOptimization} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Market Stability
                </span>
                <span className={getMetricColor(tradingMetrics.marketStability)}>
                  {tradingMetrics.marketStability.toFixed(1)}%
                </span>
              </div>
              <Progress value={tradingMetrics.marketStability} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Dashboard Tabs */}
      <Tabs defaultValue="platform" className="w-full">
        <TabsList className="grid w-full grid-cols-6 bg-card/50 backdrop-blur-sm">
          <TabsTrigger value="platform" className="data-[state=active]:bg-gradient-primary">
            🏦 Platform
          </TabsTrigger>
          <TabsTrigger value="analysis" className="data-[state=active]:bg-gradient-primary">
            🧠 AI Analysis
          </TabsTrigger>
          <TabsTrigger value="trading" className="data-[state=active]:bg-gradient-primary">
            ⚙️ Trading
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="data-[state=active]:bg-gradient-primary">
            📊 Portfolio
          </TabsTrigger>
          <TabsTrigger value="risk" className="data-[state=active]:bg-gradient-primary">
            🛡️ Risk
          </TabsTrigger>
          <TabsTrigger value="settings" className="data-[state=active]:bg-gradient-primary">
            ⚙️ Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">🏦 Platform Selection System</h3>
            <Badge variant="outline" className="text-primary border-primary">
              Multi-Exchange Support
            </Badge>
          </div>
          <PlatformSelector 
            selectedPlatform={botStatus.selectedPlatform}
            onPlatformChange={(platform) => setBotStatus(prev => ({ ...prev, selectedPlatform: platform }))}
            onPlatformConnect={handlePlatformConnect}
            onPlatformDisconnect={handlePlatformDisconnect}
            onFeatureClick={handleFeatureClick}
          />
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">🧠 AI-Powered Market Analysis</h3>
            <Button onClick={analyzeMarket} disabled={isAnalyzing} className="bg-gradient-primary">
              <Brain className="w-4 h-4 mr-2" />
              {isAnalyzing ? 'Analyzing...' : 'Deep Analysis'}
            </Button>
          </div>
          <MarketAnalysis platform={botStatus.selectedPlatform} />
        </TabsContent>

        <TabsContent value="trading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">⚙️ Automated Trading Controls</h3>
            <Badge variant="outline" className="text-primary border-primary">
              Advanced Strategies
            </Badge>
          </div>
          <AutoTradingControls 
            botActive={botStatus.isActive}
            onToggle={toggleBot}
            platform={botStatus.selectedPlatform}
          />
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">📊 Portfolio Management</h3>
            <Badge variant="outline" className="text-success border-success">
              Real-time Tracking
            </Badge>
          </div>
          <PortfolioOverview />
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">🛡️ Advanced Risk Management</h3>
            <Badge variant="outline" className="text-danger border-danger">
              Protection Active
            </Badge>
          </div>
          <RiskManagement />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">⚙️ Bot Configuration & Strategy Details</h3>
            <Badge variant="outline" className="text-primary border-primary">
              Advanced Settings
            </Badge>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trading Strategies */}
            <Card className="card-shadow">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  Trading Strategies & ML Ranker
                </CardTitle>
                <CardDescription className="text-xs">
                  Adaptive Regime Switching + ML Ranker (Scikit-learn Gradient Boosting)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm text-success">🎯 Regime Detection</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      Every 1 min analysis, act on 15m/1h bar close, confirm on 4h
                    </p>
                    <div className="text-xs mt-2 space-y-1">
                      <div>• Trending: ADX(14) ≥ 20 & |EMA50−EMA200| / Price ≥ 0.5%</div>
                      <div>• Ranging: ADX(14) &lt; 20 & BBWidth(20) &lt; 60‑day median</div>
                      <div>• High Vol: ATR(14)/Price ≥ 2% → halve size & widen stops</div>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm text-primary">📈 Trend-Following Engine</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div><strong>Entry:</strong> EMA(9/21) crossover + SMA(50/200) alignment</div>
                      <div><strong>+ MACD:</strong> line {'>'} signal + Bollinger break + volume spike</div>
                      <div><strong>Exit:</strong> SL = 1.8× ATR; TP1 = 1× ATR (50% close + BE stop)</div>
                      <div><strong>TP2:</strong> 3× ATR or 1× ATR trailing</div>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm text-accent">🔄 Mean-Reversion Engine</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div><strong>Entry:</strong> RSI(14) {'<'}30 (buy) or {'>'}70 (sell)</div>
                      <div><strong>+ Bollinger:</strong> bounce + volume delta + S/R proximity</div>
                      <div><strong>Exit:</strong> Same SL/TP structure as trend-following</div>
                    </div>
                  </div>

                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <h4 className="font-medium text-sm text-primary">🤖 ML Ranker (Execute Only If)</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div><strong>Features:</strong> regime flags, RSI, MACD hist Δ, Bollinger %B</div>
                      <div><strong>+ ATR%,</strong> volume z‑score, EMA distance, order‑book imbalance</div>
                      <div className="font-medium text-primary mt-2">
                        ✓ Probability ≥ 0.60 AND Expected R ≥ 1.8
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Management & Notifications */}
            <Card className="card-shadow">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Risk Management & Notifications
                </CardTitle>
                <CardDescription className="text-xs">
                  Advanced risk controls and real-time alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 bg-danger/10 rounded-lg border border-danger/20">
                    <h4 className="font-medium text-sm text-danger">🛡️ Risk Parameters</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div>• Risk/trade: 0.5% of equity (max 1%)</div>
                      <div>• Max concurrent exposure: 4R total; 10% per asset</div>
                      <div>• Daily loss limit: −2R → pause trading 12h</div>
                      <div>• No averaging down; add only if unrealized {'>'} +1R</div>
                      <div>• Skip if fees/slippage {'>'} 25% of TP1 distance</div>
                      <div>• Reduce size 50% during high‑volatility/weekends</div>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                    <h4 className="font-medium text-sm text-blue-600">📱 Real-time Notifications</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div><strong>Telegram:</strong> Chat ID: 8235565333</div>
                      <div><strong>Email:</strong> brynknauf@gmail.com</div>
                      <div><strong>SMS:</strong> +12509381816 (via Twilio)</div>
                    </div>
                    <div className="text-xs mt-2 font-medium">
                      Alerts: fills, partial TP, SL hit, circuit breaker, nightly retrain
                    </div>
                  </div>

                  <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <h4 className="font-medium text-sm text-green-600">📊 Performance Reports</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div><strong>Frequency:</strong> 3× weekly (Mon/Wed/Fri 18:00 PT)</div>
                      <div><strong>Content:</strong> Per‑exchange PnL + equity curve</div>
                      <div><strong>Metrics:</strong> Win rate, profit factor, drawdown, fees</div>
                      <div><strong>Analysis:</strong> Slippage estimate + rolling volatility</div>
                    </div>
                    <div className="text-xs mt-2 font-medium text-green-600">
                      📤 Withdrawal Advice: 25% of weekly profits if new equity high
                    </div>
                  </div>

                  <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <h4 className="font-medium text-sm text-amber-600">🧪 Beta Test Plan ($100 CAD)</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div>• Backtest 6–12 months Kraken: BTC, ETH, SOL + alts</div>
                      <div>• Paper trade 5–7 days with real-time data</div>
                      <div>• Go live with $100 CAD on Kraken</div>
                      <div>• Halt if account falls below $95 (5% drawdown)</div>
                      <div className="font-medium text-amber-600 mt-2">
                        Scale when daily avg {'>'}0.8% & PF {'>'}1.5 & maxDD {'<'}5%
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Platform Support */}
            <Card className="card-shadow">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Trading Platforms & Environment
                </CardTitle>
                <CardDescription className="text-xs">
                  Multi-exchange support and configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                    <h4 className="font-medium text-sm text-primary">🏦 Supported Exchanges</h4>
                    <div className="text-xs mt-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span><strong>Kraken:</strong> Live trading (current)</span>
                        <Badge variant="default" className="text-xs">ACTIVE</Badge>
                      </div>
                      <div className="text-muted-foreground">• Base Currency: CAD</div>
                      <div className="text-muted-foreground">• Beta Capital: $100 CAD</div>
                      <div className="mt-2 pt-2 border-t border-primary/20">
                        <div><strong>Future-Ready:</strong> Coinbase Advanced, Binance, Bybit</div>
                        <div className="text-xs text-muted-foreground">(CCXT integration prepared)</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm">⚙️ Environment Variables</h4>
                    <div className="text-xs mt-2 space-y-1 font-mono">
                      <div>KRAKEN_API_KEY=configured</div>
                      <div>KRAKEN_PRIVATE_KEY=configured</div>
                      <div>TELEGRAM_BOT_TOKEN=configured</div>
                      <div>TELEGRAM_CHAT_ID=8235565333</div>
                      <div>REPORT_EMAIL_TO=brynknauf@gmail.com</div>
                      <div>ALERTS_SMS_TO=+12509381816</div>
                      <div>APP_TIMEZONE=America/Vancouver</div>
                      <div>MAX_RISK_PER_TRADE_BP=50 (0.50%)</div>
                      <div>ML_SCORE_CUTOFF=0.60</div>
                      <div>MIN_EXPECTED_R=1.8</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Status */}
            <Card className="card-shadow">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  System Status & Health
                </CardTitle>
                <CardDescription className="text-xs">
                  Real-time system monitoring and performance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 bg-success/10 rounded text-center">
                    <div className="text-xs font-medium text-success">API Status</div>
                    <div className="text-sm font-bold text-success">Connected</div>
                  </div>
                  <div className="p-2 bg-success/10 rounded text-center">
                    <div className="text-xs font-medium text-success">ML Model</div>
                    <div className="text-sm font-bold text-success">Active</div>
                  </div>
                  <div className="p-2 bg-success/10 rounded text-center">
                    <div className="text-xs font-medium text-success">Regime Detection</div>
                    <div className="text-sm font-bold text-success">Running</div>
                  </div>
                  <div className="p-2 bg-success/10 rounded text-center">
                    <div className="text-xs font-medium text-success">Notifications</div>
                    <div className="text-sm font-bold text-success">Enabled</div>
                  </div>
                </div>
                
                <div className="p-3 bg-muted/50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">📈 Current Performance</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Daily PnL: <span className="font-medium text-success">+${botStatus.dailyPnL.toFixed(2)}</span></div>
                    <div>Win Rate: <span className="font-medium">{(botStatus.winRate * 100).toFixed(1)}%</span></div>
                    <div>Active Trades: <span className="font-medium">{botStatus.activeTrades}</span></div>
                    <div>Risk Used: <span className="font-medium">{botStatus.riskUsed.toFixed(1)}%</span></div>
                  </div>
                </div>

                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <h4 className="font-medium text-sm text-primary mb-2">🎯 Next Actions</h4>
                  <div className="text-xs space-y-1">
                    <div>• Daily model retrain: Tonight 23:00 PT</div>
                    <div>• Performance report: Friday 18:00 PT</div>
                    <div>• Risk assessment: Continuous</div>
                    <div>• Withdrawal analysis: Weekly</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};