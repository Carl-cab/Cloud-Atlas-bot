import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Brain, TrendingUp, TrendingDown, Activity, BarChart3, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MLFeatures {
  rsi: number;
  volatility: number;
  returns: number;
  sma_20: number;
  bollinger_upper: number;
  bollinger_lower: number;
}

interface MLSignal {
  id: string;
  symbol: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  features: MLFeatures;
  risk_amount: number;
  position_size: number;
  created_at: string;
}

interface ModelPerformance {
  model_version: string;
  symbol: string;
  accuracy: number;
  precision_score: number;
  recall_score: number;
  f1_score: number;
  total_trades: number;
  winning_trades: number;
}

export const MLTradingInterface = () => {
  const [signals, setSignals] = useState<MLSignal[]>([]);
  const [performance, setPerformance] = useState<ModelPerformance[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD');
  const [isGeneratingSignal, setIsGeneratingSignal] = useState(false);
  const [mlStatus, setMlStatus] = useState<'active' | 'inactive' | 'training'>('inactive');

  useEffect(() => {
    fetchSignals();
    fetchPerformance();
  }, [selectedSymbol]);

  const fetchSignals = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ml-trading-engine', {
        body: { action: 'get_signals', symbol: selectedSymbol }
      });

      if (error) throw error;
      if (data?.success) {
        setSignals(data.signals || []);
      }
    } catch (error) {
      console.error('Error fetching ML signals:', error);
    }
  };

  const fetchPerformance = async () => {
    try {
      const { data, error } = await supabase
        .from('ml_model_performance')
        .select('*')
        .eq('symbol', selectedSymbol)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setPerformance(data || []);
    } catch (error) {
      console.error('Error fetching performance data:', error);
    }
  };

  const generateSignal = async () => {
    setIsGeneratingSignal(true);
    try {
      // Generate mock market data for demonstration
      const mockMarketData = Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() - (99 - i) * 15 * 60 * 1000,
        open: 40000 + Math.random() * 2000,
        high: 40000 + Math.random() * 2500,
        low: 39000 + Math.random() * 1500,
        close: 40000 + Math.random() * 2000,
        volume: Math.random() * 100
      }));

      const { data, error } = await supabase.functions.invoke('ml-trading-engine', {
        body: {
          action: 'generate_signal',
          symbol: selectedSymbol,
          marketData: mockMarketData,
          capital: 10000
        }
      });

      if (error) throw error;
      if (data?.success) {
        await fetchSignals();
        setMlStatus('active');
      }
    } catch (error) {
      console.error('Error generating ML signal:', error);
    } finally {
      setIsGeneratingSignal(false);
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY': return 'text-green-500';
      case 'SELL': return 'text-red-500';
      default: return 'text-yellow-500';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'BUY': return <TrendingUp className="h-4 w-4" />;
      case 'SELL': return <TrendingDown className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatFeatures = (features: MLFeatures) => {
    return [
      { label: 'RSI', value: features.rsi?.toFixed(2) || 'N/A', unit: '' },
      { label: 'Volatility', value: (features.volatility * 100)?.toFixed(2) || 'N/A', unit: '%' },
      { label: 'Returns', value: (features.returns * 100)?.toFixed(2) || 'N/A', unit: '%' },
      { label: 'SMA 20', value: features.sma_20?.toFixed(2) || 'N/A', unit: '$' }
    ];
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Brain className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">ML Trading Engine</h2>
            <p className="text-muted-foreground">Advanced machine learning powered trading signals</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Badge variant={mlStatus === 'active' ? 'default' : 'secondary'}>
            {mlStatus === 'active' ? 'Active' : 'Inactive'}
          </Badge>
          <Button onClick={generateSignal} disabled={isGeneratingSignal}>
            {isGeneratingSignal ? 'Generating...' : 'Generate Signal'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="signals" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="signals">Live Signals</TabsTrigger>
          <TabsTrigger value="features">Feature Analysis</TabsTrigger>
          <TabsTrigger value="performance">Model Performance</TabsTrigger>
          <TabsTrigger value="risk">Risk Management</TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Recent ML Signals
                <select 
                  value={selectedSymbol} 
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="text-sm border rounded px-2 py-1"
                >
                  <option value="BTCUSD">BTC/USD</option>
                  <option value="ETHUSD">ETH/USD</option>
                  <option value="ADAUSD">ADA/USD</option>
                </select>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {signals.length > 0 ? (
                <div className="space-y-3">
                  {signals.slice(0, 5).map((signal) => (
                    <div key={signal.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={getSignalColor(signal.signal_type)}>
                          {getSignalIcon(signal.signal_type)}
                        </div>
                        <div>
                          <div className="font-medium">{signal.symbol}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(signal.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={signal.signal_type === 'BUY' ? 'default' : signal.signal_type === 'SELL' ? 'destructive' : 'secondary'}>
                          {signal.signal_type}
                        </Badge>
                        <div className="text-sm text-muted-foreground mt-1">
                          {(signal.confidence * 100).toFixed(1)}% confidence
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No signals generated yet. Click "Generate Signal" to start.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          {signals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Latest Feature Analysis</CardTitle>
                <CardDescription>Technical indicators used for ML signal generation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {formatFeatures(signals[0].features).map((feature, index) => (
                    <div key={index} className="text-center p-3 border rounded-lg">
                      <div className="text-2xl font-bold text-primary">{feature.value}{feature.unit}</div>
                      <div className="text-sm text-muted-foreground">{feature.label}</div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 space-y-3">
                  <div className="flex justify-between">
                    <span>RSI Level</span>
                    <Progress value={signals[0].features.rsi || 50} className="w-32" />
                  </div>
                  <div className="flex justify-between">
                    <span>Volatility</span>
                    <Progress value={(signals[0].features.volatility || 0.02) * 1000} className="w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Performance Metrics</CardTitle>
              <CardDescription>Historical accuracy and trading results</CardDescription>
            </CardHeader>
            <CardContent>
              {performance.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {(performance[0].accuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Accuracy</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {((performance[0].winning_trades / performance[0].total_trades) * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Win Rate</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {performance[0].total_trades}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Trades</div>
                  </div>
                  <div className="text-center p-3 border rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {(performance[0].f1_score * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">F1 Score</div>
                  </div>
                </div>
              ) : (
                <Alert>
                  <BarChart3 className="h-4 w-4" />
                  <AlertDescription>
                    No performance data available yet. Generate some signals to see metrics.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Management</CardTitle>
              <CardDescription>Position sizing and risk controls based on ML confidence</CardDescription>
            </CardHeader>
            <CardContent>
              {signals.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Risk Amount</div>
                      <div className="text-lg font-semibold">${signals[0].risk_amount.toFixed(2)}</div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Position Size</div>
                      <div className="text-lg font-semibold">{signals[0].position_size.toFixed(6)}</div>
                    </div>
                  </div>
                  
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Risk per trade is automatically calculated as 0.5% of total capital based on ML signal confidence.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};