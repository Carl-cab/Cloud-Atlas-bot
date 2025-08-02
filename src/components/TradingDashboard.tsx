import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3, 
  Activity, 
  Shield,
  Bot,
  Settings,
  Play,
  Pause,
  AlertTriangle
} from 'lucide-react';
import { PlatformSelector } from './PlatformSelector';
import { MarketAnalysis } from './MarketAnalysis';
import { AutoTradingControls } from './AutoTradingControls';
import { PortfolioOverview } from './PortfolioOverview';
import { RiskManagement } from './RiskManagement';
import { MLTradingInterface } from './MLTradingInterface';
import { SchedulingControls } from './SchedulingControls';
import { StrategyEngines } from './StrategyEngines';
import { MLTradeFilter } from './MLTradeFilter';

interface TradingStats {
  totalBalance: number;
  todayPnL: number;
  totalPnL: number;
  winRate: number;
  activeTrades: number;
  botStatus: 'active' | 'paused' | 'stopped';
}

interface PlatformStatus {
  [key: string]: 'connected' | 'disconnected' | 'pending';
}

export const TradingDashboard = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('binance');
  const [botActive, setBotActive] = useState(false);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatus>({
    binance: 'connected',
    coinbase: 'disconnected', 
    kraken: 'connected',
    bybit: 'pending'
  });
  const [stats, setStats] = useState<TradingStats>({
    totalBalance: 12458.32,
    todayPnL: 234.56,
    totalPnL: 1245.88,
    winRate: 68.5,
    activeTrades: 3,
    botStatus: 'paused'
  });

  useEffect(() => {
    // Simulate real-time updates
    const interval = setInterval(() => {
      setStats(prev => ({
        ...prev,
        totalBalance: prev.totalBalance + (Math.random() - 0.5) * 10,
        todayPnL: prev.todayPnL + (Math.random() - 0.5) * 5,
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleBotToggle = () => {
    setBotActive(!botActive);
    setStats(prev => ({ 
      ...prev, 
      botStatus: !botActive ? 'active' : 'paused' 
    }));
  };

  const handlePlatformConnect = (platformId: string) => {
    setPlatformStatuses(prev => ({ ...prev, [platformId]: 'pending' }));
    
    // Simulate connection process
    setTimeout(() => {
      setPlatformStatuses(prev => ({ ...prev, [platformId]: 'connected' }));
      toast({
        title: "Platform Connected",
        description: `Successfully connected to ${platformId.charAt(0).toUpperCase() + platformId.slice(1)}`,
      });
    }, 2000);
    
    toast({
      title: "Connecting...",
      description: `Establishing connection to ${platformId.charAt(0).toUpperCase() + platformId.slice(1)}`,
    });
  };

  const handlePlatformDisconnect = (platformId: string) => {
    setPlatformStatuses(prev => ({ ...prev, [platformId]: 'disconnected' }));
    toast({
      title: "Platform Disconnected",
      description: `Disconnected from ${platformId.charAt(0).toUpperCase() + platformId.slice(1)}`,
      variant: "destructive",
    });
  };

  const handleFeatureClick = (platformId: string, feature: string) => {
    const platformName = platformId.charAt(0).toUpperCase() + platformId.slice(1);
    
    switch (feature.toLowerCase()) {
      case 'spot trading':
        window.open(`https://${platformId}.com/en/trade`, '_blank');
        break;
      case 'futures':
        window.open(`https://${platformId}.com/en/futures`, '_blank');
        break;
      case 'options':
        window.open(`https://${platformId}.com/en/options`, '_blank');
        break;
      case 'staking':
        window.open(`https://${platformId}.com/en/staking`, '_blank');
        break;
      case 'margin trading':
        window.open(`https://${platformId}.com/en/margin`, '_blank');
        break;
      case 'derivatives':
        window.open(`https://${platformId}.com/en/derivatives`, '_blank');
        break;
      case 'copy trading':
        window.open(`https://${platformId}.com/en/copy-trading`, '_blank');
        break;
      case 'advanced orders':
        window.open(`https://${platformId}.com/en/orders`, '_blank');
        break;
      case 'api access':
        window.open(`https://${platformId}.com/en/api`, '_blank');
        break;
      case 'configure':
        toast({
          title: `${platformName} Configuration`,
          description: `Opening ${platformName} configuration panel...`,
        });
        // Here you would typically open a configuration modal
        break;
      default:
        toast({
          title: feature,
          description: `Opening ${feature} for ${platformName}...`,
        });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              CloudAtlasBot
            </h1>
            <p className="text-muted-foreground mt-2">
              Advanced Cryptocurrency Trading Automation
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge 
                variant={stats.botStatus === 'active' ? 'default' : 'secondary'}
                className="px-4 py-2"
              >
                <Bot className="w-4 h-4 mr-2" />
                Bot {stats.botStatus}
              </Badge>
              
              <Badge 
                variant={platformStatuses[selectedPlatform] === 'connected' ? 'default' : 'secondary'}
                className="px-3 py-2"
              >
                {selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)}: {platformStatuses[selectedPlatform]}
              </Badge>
            </div>
            
            <Button
              variant={botActive ? "danger" : "trading"}
              onClick={handleBotToggle}
              className="px-6"
            >
              {botActive ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause Bot
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Bot
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                ${stats.totalBalance.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                Portfolio value
              </p>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's P&L</CardTitle>
              {stats.todayPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-danger" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.todayPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                ${Math.abs(stats.todayPnL).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.todayPnL >= 0 ? '+' : '-'} {((stats.todayPnL / stats.totalBalance) * 100).toFixed(2)}%
              </p>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                +${stats.totalPnL.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                All time performance
              </p>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.winRate}%
              </div>
              <Progress value={stats.winRate} className="mt-2" />
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Trades</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.activeTrades}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently running
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="trading" className="space-y-6">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="trading">Trading</TabsTrigger>
            <TabsTrigger value="strategies">Strategies</TabsTrigger>
            <TabsTrigger value="ml">ML Engine</TabsTrigger>
            <TabsTrigger value="ml-filter">ML Filter</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="risk">Risk Management</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="trading" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <PlatformSelector 
                  selectedPlatform={selectedPlatform}
                  onPlatformChange={setSelectedPlatform}
                  onPlatformConnect={handlePlatformConnect}
                  onPlatformDisconnect={handlePlatformDisconnect}
                  onFeatureClick={handleFeatureClick}
                  platformStatuses={platformStatuses}
                />
              </div>
              <div className="lg:col-span-2">
                <AutoTradingControls 
                  botActive={botActive}
                  onToggle={handleBotToggle}
                  platform={selectedPlatform}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="strategies">
            <StrategyEngines />
          </TabsContent>

          <TabsContent value="ml">
            <MLTradingInterface />
          </TabsContent>

          <TabsContent value="ml-filter">
            <MLTradeFilter />
          </TabsContent>

          <TabsContent value="analysis">
            <MarketAnalysis platform={selectedPlatform} />
          </TabsContent>

          <TabsContent value="portfolio">
            <PortfolioOverview />
          </TabsContent>

          <TabsContent value="risk">
            <RiskManagement />
          </TabsContent>

          <TabsContent value="settings">
            <SchedulingControls 
              onScheduleChange={(isActive, stopTime) => {
                toast({
                  title: isActive ? "Schedule Updated" : "Schedule Disabled",
                  description: isActive ? `Auto-stop set for ${stopTime} PT` : "Manual control enabled",
                });
              }}
              onEmergencyStop={() => {
                setBotActive(false);
                setStats(prev => ({ ...prev, botStatus: 'stopped' }));
                toast({
                  title: "Emergency Stop Activated",
                  description: "All trading activities have been halted",
                  variant: "destructive",
                });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};