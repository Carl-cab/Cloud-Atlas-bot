import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Filter, 
  Settings,
  BarChart3,
  Target,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface GradientBoostingFeatures {
  technical_indicators: {
    rsi: number;
    macd: number;
    adx: number;
    atr: number;
    bollinger_position: number;
    volume_ratio: number;
  };
  market_structure: {
    trend_strength: number;
    volatility_regime: string;
    momentum: number;
    support_resistance_level: number;
  };
  ml_features: {
    price_velocity: number;
    feature_importance_score: number;
    ensemble_prediction: number;
    confidence_interval: [number, number];
  };
}

interface MLTradeSignal {
  id: string;
  symbol: string;
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  gradient_boost_score: number;
  features: GradientBoostingFeatures;
  risk_assessment: {
    risk_score: number;
    position_size: number;
    stop_loss: number;
    take_profit: number;
  };
  filters_passed: string[];
  created_at: string;
}

interface FilterSettings {
  min_confidence: number;
  min_gradient_score: number;
  max_risk_score: number;
  require_trend_confirmation: boolean;
  require_volume_confirmation: boolean;
  volatility_filter: boolean;
}

export const MLTradeFilter = () => {
  const [signals, setSignals] = useState<MLTradeSignal[]>([]);
  const [filteredSignals, setFilteredSignals] = useState<MLTradeSignal[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD');
  const [isTraining, setIsTraining] = useState(false);
  const [modelStatus, setModelStatus] = useState<'active' | 'training' | 'idle'>('idle');
  
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    min_confidence: 0.7,
    min_gradient_score: 0.6,
    max_risk_score: 0.8,
    require_trend_confirmation: true,
    require_volume_confirmation: false,
    volatility_filter: true
  });

  useEffect(() => {
    fetchMLSignals();
  }, [selectedSymbol]);

  useEffect(() => {
    applyFilters();
  }, [signals, filterSettings]);

  const fetchMLSignals = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-ml-engine', {
        body: { action: 'get_filtered_signals', symbol: selectedSymbol }
      });

      if (error) throw error;
      if (data?.success) {
        setSignals(data.signals || []);
      }
    } catch (error) {
      console.error('Error fetching ML signals:', error);
    }
  };

  const trainGradientBoostingModel = async () => {
    setIsTraining(true);
    setModelStatus('training');
    
    try {
      const { data, error } = await supabase.functions.invoke('enhanced-ml-engine', {
        body: { 
          action: 'train_gradient_boosting',
          symbol: selectedSymbol,
          lookback_days: 30
        }
      });

      if (error) throw error;
      if (data?.success) {
        setModelStatus('active');
        await fetchMLSignals();
      }
    } catch (error) {
      console.error('Error training model:', error);
      setModelStatus('idle');
    } finally {
      setIsTraining(false);
    }
  };

  const generateEnhancedSignal = async () => {
    try {
      // Generate mock market data with more realistic patterns
      const mockMarketData = Array.from({ length: 200 }, (_, i) => {
        const basePrice = 40000;
        const trend = Math.sin(i / 50) * 2000;
        const noise = (Math.random() - 0.5) * 1000;
        const price = basePrice + trend + noise;
        
        return {
          timestamp: Date.now() - (199 - i) * 15 * 60 * 1000,
          open: price,
          high: price + Math.random() * 500,
          low: price - Math.random() * 500,
          close: price + (Math.random() - 0.5) * 200,
          volume: Math.random() * 100 + 50
        };
      });

      const { data, error } = await supabase.functions.invoke('enhanced-ml-engine', {
        body: {
          action: 'generate_enhanced_signal',
          symbol: selectedSymbol,
          marketData: mockMarketData,
          capital: 10000,
          filter_settings: filterSettings
        }
      });

      if (error) throw error;
      if (data?.success) {
        await fetchMLSignals();
      }
    } catch (error) {
      console.error('Error generating enhanced signal:', error);
    }
  };

  const applyFilters = () => {
    const filtered = signals.filter(signal => {
      // Confidence filter
      if (signal.confidence < filterSettings.min_confidence) return false;
      
      // Gradient boosting score filter
      if (signal.gradient_boost_score < filterSettings.min_gradient_score) return false;
      
      // Risk score filter
      if (signal.risk_assessment.risk_score > filterSettings.max_risk_score) return false;
      
      // Trend confirmation filter
      if (filterSettings.require_trend_confirmation && 
          signal.features.market_structure.trend_strength < 0.6) return false;
      
      // Volume confirmation filter
      if (filterSettings.require_volume_confirmation && 
          signal.features.technical_indicators.volume_ratio < 1.2) return false;
      
      // Volatility filter
      if (filterSettings.volatility_filter && 
          signal.features.market_structure.volatility_regime === 'extreme') return false;
      
      return true;
    });
    
    setFilteredSignals(filtered);
  };

  const getSignalQuality = (signal: MLTradeSignal) => {
    const score = (signal.confidence + signal.gradient_boost_score) / 2;
    if (score >= 0.8) return { label: 'Excellent', color: 'text-green-500' };
    if (score >= 0.7) return { label: 'Good', color: 'text-blue-500' };
    if (score >= 0.6) return { label: 'Fair', color: 'text-yellow-500' };
    return { label: 'Poor', color: 'text-red-500' };
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'BUY': return <TrendingUp className="h-4 w-4" />;
      case 'SELL': return <TrendingDown className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Filter className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">ML Trade Filter</h2>
            <p className="text-muted-foreground">Enhanced Gradient Boosting with confidence scoring</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Badge variant={modelStatus === 'active' ? 'default' : modelStatus === 'training' ? 'secondary' : 'outline'}>
            {modelStatus === 'active' ? 'Model Active' : modelStatus === 'training' ? 'Training...' : 'Model Idle'}
          </Badge>
          <Button onClick={trainGradientBoostingModel} disabled={isTraining} variant="outline">
            {isTraining ? 'Training...' : 'Train Model'}
          </Button>
          <Button onClick={generateEnhancedSignal}>
            Generate Signal
          </Button>
        </div>
      </div>

      <Tabs defaultValue="filtered-signals" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="filtered-signals">Filtered Signals</TabsTrigger>
          <TabsTrigger value="filter-settings">Filter Settings</TabsTrigger>
          <TabsTrigger value="model-analysis">Model Analysis</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="filtered-signals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                High-Quality ML Signals ({filteredSignals.length})
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
              <CardDescription>
                Signals that pass all configured filters and quality thresholds
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredSignals.length > 0 ? (
                <div className="space-y-4">
                  {filteredSignals.slice(0, 5).map((signal) => {
                    const quality = getSignalQuality(signal);
                    return (
                      <div key={signal.id} className="p-4 border rounded-lg bg-card">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <div className={`${signal.signal_type === 'BUY' ? 'text-green-500' : signal.signal_type === 'SELL' ? 'text-red-500' : 'text-yellow-500'}`}>
                              {getSignalIcon(signal.signal_type)}
                            </div>
                            <div>
                              <div className="font-medium">{signal.symbol}</div>
                              <div className="text-sm text-muted-foreground">
                                {new Date(signal.created_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant={signal.signal_type === 'BUY' ? 'default' : signal.signal_type === 'SELL' ? 'destructive' : 'secondary'}>
                              {signal.signal_type}
                            </Badge>
                            <div className={`text-sm font-medium ${quality.color}`}>
                              {quality.label}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="flex justify-between">
                            <span>Confidence:</span>
                            <span className="font-medium">{(signal.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>GB Score:</span>
                            <span className="font-medium">{(signal.gradient_boost_score * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Risk Score:</span>
                            <span className="font-medium">{(signal.risk_assessment.risk_score * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Position:</span>
                            <span className="font-medium">${signal.risk_assessment.position_size.toFixed(0)}</span>
                          </div>
                        </div>
                        
                        <div className="mt-3 flex flex-wrap gap-1">
                          {signal.filters_passed.map((filter, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {filter}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Filter className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No signals pass current filter criteria.</p>
                  <p className="text-sm">Try adjusting filter settings or generate new signals.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filter-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>Advanced Filter Configuration</span>
              </CardTitle>
              <CardDescription>Configure quality thresholds and filtering criteria</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>Minimum Confidence: {(filterSettings.min_confidence * 100).toFixed(0)}%</Label>
                  <Slider
                    value={[filterSettings.min_confidence]}
                    onValueChange={([value]) => setFilterSettings(prev => ({ ...prev, min_confidence: value }))}
                    max={1}
                    min={0.5}
                    step={0.05}
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label>Minimum Gradient Boost Score: {(filterSettings.min_gradient_score * 100).toFixed(0)}%</Label>
                  <Slider
                    value={[filterSettings.min_gradient_score]}
                    onValueChange={([value]) => setFilterSettings(prev => ({ ...prev, min_gradient_score: value }))}
                    max={1}
                    min={0.4}
                    step={0.05}
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label>Maximum Risk Score: {(filterSettings.max_risk_score * 100).toFixed(0)}%</Label>
                  <Slider
                    value={[filterSettings.max_risk_score]}
                    onValueChange={([value]) => setFilterSettings(prev => ({ ...prev, max_risk_score: value }))}
                    max={1}
                    min={0.3}
                    step={0.05}
                    className="mt-2"
                  />
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Require Trend Confirmation</Label>
                  <Switch
                    checked={filterSettings.require_trend_confirmation}
                    onCheckedChange={(checked) => setFilterSettings(prev => ({ ...prev, require_trend_confirmation: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label>Require Volume Confirmation</Label>
                  <Switch
                    checked={filterSettings.require_volume_confirmation}
                    onCheckedChange={(checked) => setFilterSettings(prev => ({ ...prev, require_volume_confirmation: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <Label>Filter Extreme Volatility</Label>
                  <Switch
                    checked={filterSettings.volatility_filter}
                    onCheckedChange={(checked) => setFilterSettings(prev => ({ ...prev, volatility_filter: checked }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="model-analysis" className="space-y-4">
          {filteredSignals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Brain className="h-5 w-5" />
                  <span>Gradient Boosting Analysis</span>
                </CardTitle>
                <CardDescription>Feature importance and model insights</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h4 className="font-medium">Technical Indicators</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">RSI</span>
                        <Progress value={filteredSignals[0].features.technical_indicators.rsi} className="w-24" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">ADX</span>
                        <Progress value={filteredSignals[0].features.technical_indicators.adx} className="w-24" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Volume Ratio</span>
                        <Progress value={filteredSignals[0].features.technical_indicators.volume_ratio * 50} className="w-24" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-medium">Market Structure</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Trend Strength</span>
                        <Progress value={filteredSignals[0].features.market_structure.trend_strength * 100} className="w-24" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Momentum</span>
                        <Progress value={Math.abs(filteredSignals[0].features.market_structure.momentum) * 100} className="w-24" />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Volatility Regime</span>
                        <Badge variant="outline">{filteredSignals[0].features.market_structure.volatility_regime}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Filter Performance Metrics</CardTitle>
              <CardDescription>How well the filters are performing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {signals.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Signals</div>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {filteredSignals.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Passed Filters</div>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {signals.length > 0 ? ((filteredSignals.length / signals.length) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-sm text-muted-foreground">Filter Rate</div>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {filteredSignals.length > 0 ? (filteredSignals.reduce((acc, s) => acc + s.confidence, 0) / filteredSignals.length * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Confidence</div>
                </div>
              </div>
              
              {filteredSignals.length === 0 && signals.length > 0 && (
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Current filters are too restrictive. Consider lowering thresholds to allow more signals through.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};