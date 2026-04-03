
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, TrendingUp, TrendingDown, Brain, Shield } from 'lucide-react';
import { useBotState, safeToFixed } from '@/context/BotStateProvider';

export const RealTimeTradingDashboard = () => {
  const {
    botStatus,
    currentRegime,
    latestSignal,
    isAnalyzing,
    isTraining,
    toggleBot,
    setIsAnalyzing,
    setIsTraining,
    reloadData
  } = useBotState();

  const handleBotToggle = async () => {
    await toggleBot();
  };

  const analyzeMarket = async () => {
    setIsAnalyzing(true);
    try {
      await reloadData();
    } catch (error) {
      console.error('Error reloading data:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const trainModel = async () => {
    setIsTraining(true);
    setTimeout(() => setIsTraining(false), 3000); // Simulate training
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
            onCheckedChange={handleBotToggle}
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
            <Button onClick={reloadData} disabled={isAnalyzing}>
              {isAnalyzing ? 'Analyzing...' : 'Refresh Data'}
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
            <Button onClick={reloadData} disabled={!botStatus.isActive || !latestSignal}>
              Refresh Signals
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
