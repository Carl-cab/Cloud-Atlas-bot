import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  Target, 
  Brain, 
  Activity,
  Play,
  Pause,
  Settings,
  BarChart3,
  TrendingDown,
  AlertCircle
} from 'lucide-react';

interface TradingEngine {
  name: string;
  type: 'trend_following' | 'mean_reversion';
  active: boolean;
  performance: {
    winRate: number;
    profitFactor: number;
    tradesExecuted: number;
    avgHoldTime: string;
  };
  indicators: {
    name: string;
    value: number;
    signal: 'buy' | 'sell' | 'hold';
    weight: number;
  }[];
  currentSignal: {
    type: 'buy' | 'sell' | 'hold';
    strength: number;
    confidence: number;
    reasons: string[];
  };
}

interface MLRankerData {
  enabled: boolean;
  modelVersion: string;
  accuracy: number;
  features: {
    name: string;
    importance: number;
    currentValue: number;
  }[];
  lastTrade: {
    signal: 'buy' | 'sell' | 'hold';
    mlScore: number;
    expectedR: number;
    executed: boolean;
    reason: string;
  };
}

export const TradingEngines = () => {
  const [tradingActive, setTradingActive] = useState(false);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [backtestOpen, setBacktestOpen] = useState(false);
  const [engines, setEngines] = useState<TradingEngine[]>([
    {
      name: 'Trend-Following Engine',
      type: 'trend_following',
      active: true,
      performance: {
        winRate: 68.5,
        profitFactor: 2.1,
        tradesExecuted: 45,
        avgHoldTime: '4.2h'
      },
      indicators: [
        { name: 'EMA(9/21) Cross', value: 1.25, signal: 'buy', weight: 30 },
        { name: 'MACD Signal', value: 0.85, signal: 'buy', weight: 25 },
        { name: 'Bollinger Breakout', value: 2.1, signal: 'buy', weight: 20 },
        { name: 'Volume Spike', value: 1.8, signal: 'buy', weight: 25 }
      ],
      currentSignal: {
        type: 'buy',
        strength: 78,
        confidence: 85,
        reasons: [
          'EMA crossover confirmed with strong momentum',
          'MACD line crossed above signal line',
          'Bollinger band breakout with volume confirmation'
        ]
      }
    },
    {
      name: 'Mean-Reversion Engine',
      type: 'mean_reversion',
      active: true,
      performance: {
        winRate: 72.3,
        profitFactor: 1.8,
        tradesExecuted: 38,
        avgHoldTime: '2.1h'
      },
      indicators: [
        { name: 'RSI(14)', value: 28.5, signal: 'buy', weight: 35 },
        { name: 'Bollinger %B', value: 0.15, signal: 'buy', weight: 30 },
        { name: 'Volume Delta', value: 1.4, signal: 'buy', weight: 20 },
        { name: 'S/R Proximity', value: 0.8, signal: 'buy', weight: 15 }
      ],
      currentSignal: {
        type: 'buy',
        strength: 82,
        confidence: 76,
        reasons: [
          'RSI below 30 indicates oversold conditions',
          'Price bouncing from Bollinger lower band',
          'Strong volume confirmation at support level'
        ]
      }
    }
  ]);

  const [mlRanker] = useState<MLRankerData>({
    enabled: true,
    modelVersion: 'v2.1.4',
    accuracy: 73.8,
    features: [
      { name: 'RSI Momentum', importance: 18.5, currentValue: 28.5 },
      { name: 'MACD Histogram Δ', importance: 16.2, currentValue: 0.15 },
      { name: 'Volume Z-Score', importance: 15.8, currentValue: 2.1 },
      { name: 'Bollinger %B', importance: 14.3, currentValue: 0.15 },
      { name: 'EMA Distance', importance: 12.7, currentValue: -1.2 },
      { name: 'Order Book Imbalance', importance: 11.9, currentValue: 0.65 },
      { name: 'ATR Percentage', importance: 10.6, currentValue: 1.4 }
    ],
    lastTrade: {
      signal: 'buy',
      mlScore: 0.74,
      expectedR: 2.1,
      executed: true,
      reason: 'ML score above 0.60 threshold with R > 1.8'
    }
  });

  const toggleEngine = (index: number) => {
    setEngines(prev => prev.map((engine, i) => 
      i === index ? { ...engine, active: !engine.active } : engine
    ));
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'buy': return 'text-success';
      case 'sell': return 'text-danger';
      default: return 'text-muted-foreground';
    }
  };

  const getSignalBadge = (signal: string) => {
    switch (signal) {
      case 'buy': return 'bg-success text-success-foreground';
      case 'sell': return 'bg-danger text-danger-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getEngineIcon = (type: string) => {
    return type === 'trend_following' ? 
      <TrendingUp className="w-5 h-5 text-primary" /> : 
      <Target className="w-5 h-5 text-primary" />;
  };

  const handleStartStopTrading = () => {
    setTradingActive(!tradingActive);
    const action = tradingActive ? 'stopped' : 'started';
    alert(`Trading engines ${action}! ${tradingActive ? 'All active positions will be closed safely.' : 'Both Trend-Following and Mean-Reversion engines are now active with ML filtering enabled.'}`);
  };

  const handleAdjustParameters = () => {
    setParametersOpen(true);
  };

  const handleBacktest = () => {
    setBacktestOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card className="card-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Trading Engines & ML Ranker
          </CardTitle>
          <CardDescription>
            Advanced trading strategies with machine learning signal filtering
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="engines" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="engines">Strategy Engines</TabsTrigger>
              <TabsTrigger value="ml-ranker">ML Ranker</TabsTrigger>
              <TabsTrigger value="execution">Trade Execution</TabsTrigger>
            </TabsList>

            <TabsContent value="engines" className="space-y-6">
              {engines.map((engine, index) => (
                <Card key={index} className="border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getEngineIcon(engine.type)}
                        <div>
                          <CardTitle className="text-lg">{engine.name}</CardTitle>
                          <CardDescription>
                            {engine.type === 'trend_following' 
                              ? 'Active during trending markets' 
                              : 'Active during ranging markets'}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={getSignalBadge(engine.currentSignal.type)}>
                          {engine.currentSignal.type.toUpperCase()}
                        </Badge>
                        <Switch 
                          checked={engine.active}
                          onCheckedChange={() => toggleEngine(index)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {/* Performance Metrics */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: 'Win Rate', value: `${engine.performance.winRate}%` },
                        { label: 'Profit Factor', value: engine.performance.profitFactor.toString() },
                        { label: 'Trades', value: engine.performance.tradesExecuted.toString() },
                        { label: 'Avg Hold', value: engine.performance.avgHoldTime }
                      ].map((metric, i) => (
                        <div key={i} className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="font-semibold text-primary">{metric.value}</div>
                          <div className="text-xs text-muted-foreground">{metric.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Current Signal */}
                    <div className="p-4 border rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold">Current Signal</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Strength:</span>
                          <span className="font-semibold">{engine.currentSignal.strength}%</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span>Confidence</span>
                          <span className="font-medium">{engine.currentSignal.confidence}%</span>
                        </div>
                        <Progress value={engine.currentSignal.confidence} className="h-2" />
                      </div>
                      
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium">Signal Reasons:</h5>
                        {engine.currentSignal.reasons.map((reason, i) => (
                          <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <div className="w-1 h-1 bg-primary rounded-full mt-2 flex-shrink-0" />
                            {reason}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Indicators */}
                    <div className="space-y-3">
                      <h4 className="font-semibold">Technical Indicators</h4>
                      {engine.indicators.map((indicator, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-primary rounded-full" />
                            <span className="font-medium text-sm">{indicator.name}</span>
                            <Badge className={getSignalBadge(indicator.signal)}>
                              {indicator.signal}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-sm">{indicator.value.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{indicator.weight}% weight</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="ml-ranker" className="space-y-6">
              <Card className="border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5" />
                        Machine Learning Signal Ranker
                      </CardTitle>
                      <CardDescription>
                        Gradient Boosting model filtering trading signals
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        Model: {mlRanker.modelVersion}
                      </Badge>
                      <Switch checked={mlRanker.enabled} />
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {/* Model Performance */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold text-primary">{mlRanker.accuracy}%</div>
                      <div className="text-sm text-muted-foreground">Model Accuracy</div>
                    </div>
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold text-primary">0.60</div>
                      <div className="text-sm text-muted-foreground">Score Threshold</div>
                    </div>
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold text-primary">1.8</div>
                      <div className="text-sm text-muted-foreground">Min Expected R</div>
                    </div>
                  </div>

                  {/* Feature Importance */}
                  <div className="space-y-4">
                    <h4 className="font-semibold">Feature Importance & Current Values</h4>
                    {mlRanker.features.map((feature, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">{feature.name}</span>
                          <div className="text-right">
                            <div className="font-semibold text-sm">{feature.currentValue.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">
                              {feature.importance.toFixed(1)}% importance
                            </div>
                          </div>
                        </div>
                        <Progress value={feature.importance} className="h-2" />
                      </div>
                    ))}
                  </div>

                  {/* Last Trade Decision */}
                  <div className="p-4 border rounded-lg bg-muted/20">
                    <h4 className="font-semibold mb-3">Last ML Decision</h4>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Signal</div>
                        <Badge className={getSignalBadge(mlRanker.lastTrade.signal)}>
                          {mlRanker.lastTrade.signal.toUpperCase()}
                        </Badge>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">ML Score</div>
                        <div className="font-semibold text-primary">{mlRanker.lastTrade.mlScore.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Expected R</div>
                        <div className="font-semibold text-primary">{mlRanker.lastTrade.expectedR.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Executed</div>
                        <Badge variant={mlRanker.lastTrade.executed ? 'default' : 'secondary'}>
                          {mlRanker.lastTrade.executed ? 'YES' : 'NO'}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <strong>Reason:</strong> {mlRanker.lastTrade.reason}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="execution" className="space-y-6">
              <Card className="border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Trade Execution Logic
                  </CardTitle>
                  <CardDescription>
                    Asset allocation, position sizing, and risk management rules
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {/* Trading Assets */}
                  <div className="space-y-4">
                    <h4 className="font-semibold">Active Trading Pairs</h4>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {['BTC/CAD', 'ETH/CAD', 'SOL/CAD', 'XRP/CAD'].map((pair) => (
                        <div key={pair} className="p-3 border rounded-lg text-center">
                          <div className="font-semibold">{pair}</div>
                          <div className="text-xs text-muted-foreground">Kraken</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Position Sizing */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-4">Position Sizing & Risk</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm">Account Size</span>
                          <span className="font-semibold">$100 CAD</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Risk per Trade</span>
                          <span className="font-semibold">0.5% ($0.50)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Max Positions</span>
                          <span className="font-semibold">4 simultaneous</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Max Exposure</span>
                          <span className="font-semibold">6% of account</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm">Stop Loss</span>
                          <span className="font-semibold">1.8 × ATR(14)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Take Profit 1</span>
                          <span className="font-semibold">1 × ATR (50% close)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Take Profit 2</span>
                          <span className="font-semibold">3 × ATR or trailing</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Expected Frequency</span>
                          <span className="font-semibold">8-15 trades/night</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* High Volatility Adjustments */}
                  <div className="p-4 border border-danger/20 bg-danger/5 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-danger" />
                      <h4 className="font-semibold text-danger">High Volatility Trigger</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      When ATR(14)/Price &gt; 2%, the following adjustments are automatically applied:
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Position Size:</span>
                        <span className="font-semibold ml-2">Halved (0.25%)</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stop Loss:</span>
                        <span className="font-semibold ml-2">Widened to 2.5 × ATR</span>
                      </div>
                    </div>
                  </div>

                   {/* Trade Controls */}
                   <div className="flex gap-3">
                     <Button 
                       className="flex-1" 
                       variant={tradingActive ? "danger" : "default"}
                       onClick={handleStartStopTrading}
                     >
                       {tradingActive ? (
                         <>
                           <Pause className="w-4 h-4 mr-2" />
                           Stop Trading Engines
                         </>
                       ) : (
                         <>
                           <Play className="w-4 h-4 mr-2" />
                           Start Trading Engines
                         </>
                       )}
                     </Button>
                     <Button variant="outline" onClick={handleAdjustParameters}>
                       <Settings className="w-4 h-4 mr-2" />
                       Adjust Parameters
                     </Button>
                     <Button variant="outline" onClick={handleBacktest}>
                       <BarChart3 className="w-4 h-4 mr-2" />
                       Backtest
                     </Button>
                   </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modals */}
      <ParameterAdjustmentModal open={parametersOpen} onOpenChange={setParametersOpen} />
      <BacktestModal open={backtestOpen} onOpenChange={setBacktestOpen} />
    </div>
  );
};