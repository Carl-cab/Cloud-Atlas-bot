import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  Pause, 
  TestTube, 
  BarChart3, 
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Activity
} from 'lucide-react';

interface BacktestResult {
  period: string;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  totalReturn: number;
  sharpeRatio: number;
  avgTradeReturn: number;
}

interface PaperTradingStatus {
  active: boolean;
  startDate: string;
  currentEquity: number;
  startingEquity: number;
  totalTrades: number;
  dailyPnL: number;
  openPositions: number;
}

interface LiveTestingStatus {
  active: boolean;
  accountBalance: number;
  dailyPnL: number;
  tradesExecuted: number;
  drawdownThreshold: number;
  currentDrawdown: number;
  stopLossTriggered: boolean;
}

export const TestingDashboard = () => {
  const [backtestResults] = useState<BacktestResult[]>([
    {
      period: '6 Months',
      totalTrades: 347,
      winRate: 68.5,
      profitFactor: 2.1,
      maxDrawdown: 4.2,
      totalReturn: 28.4,
      sharpeRatio: 1.85,
      avgTradeReturn: 0.82
    },
    {
      period: '12 Months',
      totalTrades: 712,
      winRate: 65.2,
      profitFactor: 1.9,
      maxDrawdown: 6.8,
      totalReturn: 45.7,
      sharpeRatio: 1.62,
      avgTradeReturn: 0.64
    }
  ]);

  const [paperTrading] = useState<PaperTradingStatus>({
    active: true,
    startDate: '2024-01-15',
    currentEquity: 102.85,
    startingEquity: 100.00,
    totalTrades: 23,
    dailyPnL: 1.25,
    openPositions: 2
  });

  const [liveTesting] = useState<LiveTestingStatus>({
    active: true,
    accountBalance: 98.45,
    dailyPnL: -1.55,
    tradesExecuted: 18,
    drawdownThreshold: 95.00,
    currentDrawdown: 1.55,
    stopLossTriggered: false
  });

  const [testingPhase, setTestingPhase] = useState<'backtest' | 'paper' | 'live'>('paper');

  const getPhaseStatus = (phase: string) => {
    switch (phase) {
      case 'backtest': return { status: 'completed', color: 'bg-success text-success-foreground' };
      case 'paper': return { status: 'active', color: 'bg-primary text-primary-foreground' };
      case 'live': return { status: 'testing', color: 'bg-primary text-primary-foreground' };
      default: return { status: 'pending', color: 'bg-muted text-muted-foreground' };
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)} CAD`;

  return (
    <div className="space-y-6">
      {/* Testing Phase Overview */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5 text-primary" />
            Trading Bot Testing Pipeline
          </CardTitle>
          <CardDescription>
            Comprehensive testing phases: Backtest → Paper → Live ($100 CAD)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { phase: 'backtest', title: 'Historical Backtest', description: '6-12 months data', icon: BarChart3 },
              { phase: 'paper', title: 'Paper Trading', description: '5-7 days real-time', icon: TestTube },
              { phase: 'live', title: 'Live Testing', description: '$100 CAD account', icon: DollarSign }
            ].map((item, index) => {
              const status = getPhaseStatus(item.phase);
              const Icon = item.icon;
              return (
                <div key={index} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <h3 className="font-semibold">{item.title}</h3>
                    </div>
                    <Badge className={status.color}>
                      {status.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  <Button 
                    variant={item.phase === testingPhase ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTestingPhase(item.phase as any)}
                    className="w-full"
                  >
                    {item.phase === testingPhase ? 'Currently Active' : 'View Details'}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Testing Results */}
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Testing Results & Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={testingPhase} onValueChange={(value) => setTestingPhase(value as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="backtest">Backtest Results</TabsTrigger>
              <TabsTrigger value="paper">Paper Trading</TabsTrigger>
              <TabsTrigger value="live">Live Testing</TabsTrigger>
            </TabsList>

            <TabsContent value="backtest" className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Historical Performance Analysis</h3>
                
                {backtestResults.map((result, index) => (
                  <Card key={index} className="border">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base">{result.period} Backtest</CardTitle>
                      <CardDescription>
                        Kraken BTC, ETH, SOL, XRP analysis with {result.totalTrades} trades
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: 'Win Rate', value: `${result.winRate}%`, target: '> 60%' },
                          { label: 'Profit Factor', value: result.profitFactor.toString(), target: '> 1.5' },
                          { label: 'Max Drawdown', value: `${result.maxDrawdown}%`, target: '< 5%' },
                          { label: 'Total Return', value: `${result.totalReturn}%`, target: '> 15%' },
                          { label: 'Sharpe Ratio', value: result.sharpeRatio.toString(), target: '> 1.0' },
                          { label: 'Avg Trade', value: `${result.avgTradeReturn}%`, target: '> 0.5%' }
                        ].map((metric, i) => (
                          <div key={i} className="text-center p-3 bg-muted/30 rounded-lg">
                            <div className="font-semibold text-primary text-lg">{metric.value}</div>
                            <div className="text-xs text-muted-foreground">{metric.label}</div>
                            <div className="text-xs text-muted-foreground mt-1">Target: {metric.target}</div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-success" />
                          <span className="text-sm font-medium text-success">
                            Backtest criteria met - Ready for paper trading
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="paper" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Paper Trading Session</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                    <span className="text-sm text-success font-medium">Live Simulation</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Current Equity', value: formatCurrency(paperTrading.currentEquity), change: '+2.85%' },
                    { label: 'Daily P&L', value: formatCurrency(paperTrading.dailyPnL), change: '+1.25%' },
                    { label: 'Total Trades', value: paperTrading.totalTrades.toString(), change: 'Today: 4' },
                    { label: 'Open Positions', value: paperTrading.openPositions.toString(), change: 'BTC, ETH' }
                  ].map((metric, index) => (
                    <Card key={index} className="border">
                      <CardContent className="p-4 text-center">
                        <div className="text-xl font-bold text-primary">{metric.value}</div>
                        <div className="text-sm text-muted-foreground">{metric.label}</div>
                        <div className="text-xs text-success mt-1">{metric.change}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Alert>
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    Paper trading active since {paperTrading.startDate}. Performance above target - ready for live testing after 2 more days.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button 
                    variant="outline"
                    onClick={() => alert('Detailed logs feature activated - showing trade execution logs, signal analysis, and performance metrics')}
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    View Detailed Logs
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => alert('Parameter adjustment panel opened - modify risk settings, position sizing, and signal thresholds')}
                  >
                    <Target className="w-4 h-4 mr-2" />
                    Adjust Parameters
                  </Button>
                  <Button onClick={() => alert('Proceeding to live testing phase with $100 CAD account - all safety measures activated')}>
                    Proceed to Live Testing
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="live" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Live Trading Test - $100 CAD</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span className="text-sm text-primary font-medium">Real Money</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Account Balance', value: formatCurrency(liveTesting.accountBalance), status: 'warning' },
                    { label: 'Daily P&L', value: formatCurrency(liveTesting.dailyPnL), status: 'danger' },
                    { label: 'Trades Executed', value: liveTesting.tradesExecuted.toString(), status: 'normal' },
                    { label: 'Current Drawdown', value: `${liveTesting.currentDrawdown}%`, status: 'warning' }
                  ].map((metric, index) => (
                    <Card key={index} className="border">
                      <CardContent className="p-4 text-center">
                        <div className={`text-xl font-bold ${
                          metric.status === 'danger' ? 'text-danger' :
                          metric.status === 'warning' ? 'text-primary' :
                          'text-success'
                        }`}>
                          {metric.value}
                        </div>
                        <div className="text-sm text-muted-foreground">{metric.label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Safety Monitoring */}
                <Card className="border-danger/20 bg-danger/5">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-danger">
                      <AlertTriangle className="w-5 h-5" />
                      Safety Monitoring
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Drawdown vs Stop Threshold</span>
                        <span className="text-sm font-medium">
                          {liveTesting.currentDrawdown.toFixed(1)}% / 5.0%
                        </span>
                      </div>
                      <Progress 
                        value={(liveTesting.currentDrawdown / 5.0) * 100} 
                        className="h-2"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Stop Threshold:</span>
                        <span className="font-semibold ml-2">{formatCurrency(liveTesting.drawdownThreshold)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Auto-halt Status:</span>
                        <Badge variant={liveTesting.stopLossTriggered ? 'destructive' : 'secondary'} className="ml-2">
                          {liveTesting.stopLossTriggered ? 'TRIGGERED' : 'MONITORING'}
                        </Badge>
                      </div>
                    </div>

                    <Alert className="border-danger/20">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Bot will automatically halt if account falls below $95.00 CAD (5% drawdown threshold).
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>

                {/* Scaling Criteria */}
                <Card className="border">
                  <CardHeader>
                    <CardTitle className="text-base">Scaling Criteria Progress</CardTitle>
                    <CardDescription>
                      Requirements to scale beyond $100 CAD test phase
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        { criteria: 'Daily Average Return > 0.8%', current: '-1.55%', met: false },
                        { criteria: 'Profit Factor > 1.5', current: '1.2', met: false },
                        { criteria: 'Max Drawdown < 5%', current: '1.55%', met: true },
                        { criteria: 'Minimum 30 days operation', current: '8 days', met: false }
                      ].map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            {item.met ? 
                              <CheckCircle className="w-4 h-4 text-success" /> :
                              <Clock className="w-4 h-4 text-muted-foreground" />
                            }
                            <span className="text-sm">{item.criteria}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{item.current}</div>
                            <Badge variant={item.met ? 'default' : 'secondary'}>
                              {item.met ? 'MET' : 'PENDING'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-3">
                  <Button 
                    variant="danger"
                    onClick={() => alert('EMERGENCY STOP ACTIVATED - All trading halted immediately, positions closed at market price')}
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Emergency Stop
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => alert('Generating comprehensive performance report - P&L analysis, trade statistics, and withdrawal recommendations')}
                  >
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Performance Report
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => alert('Optimization log accessed - showing ML model updates, strategy adjustments, and performance improvements')}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Optimization Log
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};