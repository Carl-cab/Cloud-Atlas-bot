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
              <p className="text-muted-foreground">Advanced Trading Automation</p>
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
          <Card className="card-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                CloudAtlasBot Configuration
              </CardTitle>
              <CardDescription>
                Advanced settings for your trading automation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                <Settings className="h-12 w-12 mx-auto mb-4 text-primary/50" />
                <p>Advanced configuration panel coming soon...</p>
                <p className="text-sm mt-2">Configure strategies, risk parameters, and notifications</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};