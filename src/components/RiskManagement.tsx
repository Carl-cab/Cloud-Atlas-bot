import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Shield, 
  AlertTriangle, 
  TrendingDown, 
  Activity,
  Target,
  BarChart3,
  Clock,
  DollarSign,
  Calculator,
  Zap,
  Settings,
  StopCircle,
  Play,
  Pause,
  Eye,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RiskSettings {
  max_daily_loss: number;
  max_position_size: number;
  max_portfolio_risk: number;
  max_symbol_exposure: number;
  circuit_breaker_enabled: boolean;
  circuit_breaker_threshold: number;
  position_sizing_method: string;
  max_correlation_exposure: number;
}

interface RiskEvent {
  id: string;
  event_type: string;
  severity: string;
  description: string;
  triggered_by: any;
  actions_taken: string[];
  created_at: string;
  resolved_at?: string;
}

interface PositionSizingResult {
  symbol: string;
  calculation_method: string;
  recommended_size: number;
  max_size: number;
  risk_score: number;
  confidence_level: number;
}

interface RiskMonitoring {
  limit_type: string;
  current_value: number;
  limit_value: number;
  utilization_percentage: number;
  status: string;
}

export const RiskManagement = () => {
  const { toast } = useToast();
  const [riskSettings, setRiskSettings] = useState<RiskSettings>({
    max_daily_loss: 500,
    max_position_size: 0.10,
    max_portfolio_risk: 0.05,
    max_symbol_exposure: 0.20,
    circuit_breaker_enabled: true,
    circuit_breaker_threshold: 0.03,
    position_sizing_method: 'kelly',
    max_correlation_exposure: 0.30
  });

  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [riskMonitoring, setRiskMonitoring] = useState<RiskMonitoring[]>([]);
  const [positionSizing, setPositionSizing] = useState<PositionSizingResult[]>([]);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState<'active' | 'triggered' | 'disabled'>('active');
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Position Sizing Calculator State
  const [calcSymbol, setCalcSymbol] = useState('BTCUSD');
  const [calcCapital, setCalcCapital] = useState(10000);
  const [calcRiskPerTrade, setCalcRiskPerTrade] = useState(0.02);
  const [calcWinRate, setCalcWinRate] = useState(0.6);
  const [calcAvgWin, setCalcAvgWin] = useState(1.5);
  const [calcAvgLoss, setCalcAvgLoss] = useState(1.0);

  useEffect(() => {
    fetchRiskSettings();
    fetchRiskEvents();
    fetchRiskMonitoring();
    startRealTimeMonitoring();
  }, []);

  const fetchRiskSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('risk_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setRiskSettings(data);
      }
    } catch (error) {
      console.error('Error fetching risk settings:', error);
    }
  };

  const fetchRiskEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('risk_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRiskEvents(data || []);
    } catch (error) {
      console.error('Error fetching risk events:', error);
    }
  };

  const fetchRiskMonitoring = async () => {
    try {
      const { data, error } = await supabase
        .from('risk_limits_monitoring')
        .select('*')
        .order('last_updated', { ascending: false });

      if (error) throw error;
      setRiskMonitoring(data || []);
    } catch (error) {
      console.error('Error fetching risk monitoring:', error);
    }
  };

  const startRealTimeMonitoring = () => {
    // Simulate real-time risk monitoring
    const interval = setInterval(() => {
      // Mock risk monitoring updates
      const mockMonitoring: RiskMonitoring[] = [
        {
          limit_type: 'daily_loss',
          current_value: 120 + Math.random() * 50,
          limit_value: riskSettings.max_daily_loss,
          utilization_percentage: 0,
          status: 'normal'
        },
        {
          limit_type: 'position_size',
          current_value: riskSettings.max_position_size * 0.8 + Math.random() * 0.1,
          limit_value: riskSettings.max_position_size,
          utilization_percentage: 0,
          status: 'normal'
        },
        {
          limit_type: 'portfolio_risk',
          current_value: riskSettings.max_portfolio_risk * 0.7 + Math.random() * 0.1,
          limit_value: riskSettings.max_portfolio_risk,
          utilization_percentage: 0,
          status: 'normal'
        }
      ];

      mockMonitoring.forEach(item => {
        item.utilization_percentage = (item.current_value / item.limit_value) * 100;
        if (item.utilization_percentage > 90) item.status = 'critical';
        else if (item.utilization_percentage > 75) item.status = 'warning';
        else item.status = 'normal';
      });

      setRiskMonitoring(mockMonitoring);
    }, 5000);

    return () => clearInterval(interval);
  };

  const updateRiskSettings = async () => {
    try {
      const { error } = await supabase
        .from('risk_settings')
        .upsert({
          ...riskSettings,
          user_id: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;
      
      toast({
        title: "Risk Settings Updated",
        description: "Your risk management settings have been saved successfully."
      });
    } catch (error) {
      console.error('Error updating risk settings:', error);
      toast({
        title: "Error",
        description: "Failed to update risk settings.",
        variant: "destructive"
      });
    }
  };

  const calculatePositionSize = async () => {
    setIsCalculating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('risk-management-engine', {
        body: {
          action: 'calculate_position_size',
          symbol: calcSymbol,
          capital: calcCapital,
          risk_per_trade: calcRiskPerTrade,
          method: riskSettings.position_sizing_method,
          win_rate: calcWinRate,
          avg_win: calcAvgWin,
          avg_loss: calcAvgLoss
        }
      });

      if (error) throw error;
      if (data?.success) {
        setPositionSizing(prev => [data.result, ...prev.slice(0, 4)]);
        toast({
          title: "Position Size Calculated",
          description: `Recommended size: ${data.result.recommended_size.toFixed(4)} units`
        });
      }
    } catch (error) {
      console.error('Error calculating position size:', error);
      toast({
        title: "Calculation Error",
        description: "Failed to calculate position size.",
        variant: "destructive"
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const triggerCircuitBreaker = async (reason: string) => {
    try {
      setCircuitBreakerStatus('triggered');
      
      const { error } = await supabase
        .from('risk_events')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          event_type: 'circuit_breaker',
          severity: 'critical',
          description: `Circuit breaker triggered: ${reason}`,
          triggered_by: { manual: true, reason },
          actions_taken: ['halt_trading', 'close_positions']
        });

      if (error) throw error;
      
      toast({
        title: "Circuit Breaker Activated",
        description: "All trading has been halted for safety.",
        variant: "destructive"
      });
      
      await fetchRiskEvents();
    } catch (error) {
      console.error('Error triggering circuit breaker:', error);
    }
  };

  const resetCircuitBreaker = async () => {
    setCircuitBreakerStatus('active');
    toast({
      title: "Circuit Breaker Reset",
      description: "Trading can now resume."
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'critical': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Risk Management System</h2>
            <p className="text-muted-foreground">Advanced position sizing, circuit breakers, and exposure limits</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <Badge 
            variant={circuitBreakerStatus === 'active' ? 'default' : circuitBreakerStatus === 'triggered' ? 'destructive' : 'secondary'}
            className="px-3 py-1"
          >
            {circuitBreakerStatus === 'active' && <><Shield className="h-3 w-3 mr-1" />Circuit Breaker Active</>}
            {circuitBreakerStatus === 'triggered' && <><StopCircle className="h-3 w-3 mr-1" />Emergency Stop</>}
            {circuitBreakerStatus === 'disabled' && <><Pause className="h-3 w-3 mr-1" />Disabled</>}
          </Badge>
          
          {circuitBreakerStatus === 'triggered' && (
            <Button onClick={resetCircuitBreaker} size="sm">
              <Play className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="monitoring" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="monitoring">Live Monitoring</TabsTrigger>
          <TabsTrigger value="position-sizing">Position Sizing</TabsTrigger>
          <TabsTrigger value="circuit-breakers">Circuit Breakers</TabsTrigger>
          <TabsTrigger value="limits">Exposure Limits</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {riskMonitoring.map((item, index) => (
              <Card key={index}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium capitalize">
                    {item.limit_type.replace('_', ' ')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className={getStatusColor(item.status)}>
                        {item.current_value.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">
                        / {item.limit_value.toFixed(2)}
                      </span>
                    </div>
                    <Progress value={item.utilization_percentage} className="h-2" />
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className={`text-xs ${getStatusColor(item.status)}`}>
                        {item.utilization_percentage.toFixed(1)}%
                      </Badge>
                      <Badge variant="outline" className={getSeverityBadge(item.status)}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Recent Risk Events</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {riskEvents.length > 0 ? (
                  riskEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <AlertTriangle className={`h-4 w-4 mt-1 ${getStatusColor(event.severity)}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-sm capitalize">{event.event_type.replace('_', ' ')}</h4>
                          <Badge className={getSeverityBadge(event.severity)}>{event.severity}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{event.description}</p>
                        <div className="flex items-center space-x-2 mt-2">
                          <span className="text-xs text-muted-foreground">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                          {event.actions_taken.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {event.actions_taken.length} actions taken
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No risk events recorded.</p>
                    <p className="text-sm">Your trading is operating within safe parameters.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="position-sizing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calculator className="h-5 w-5" />
                  <span>Position Size Calculator</span>
                </CardTitle>
                <CardDescription>Calculate optimal position sizes using advanced algorithms</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Symbol</Label>
                    <Select value={calcSymbol} onValueChange={setCalcSymbol}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BTCUSD">BTC/USD</SelectItem>
                        <SelectItem value="ETHUSD">ETH/USD</SelectItem>
                        <SelectItem value="ADAUSD">ADA/USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Capital ($)</Label>
                    <Input
                      type="number"
                      value={calcCapital}
                      onChange={(e) => setCalcCapital(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div>
                  <Label>Risk per Trade: {(calcRiskPerTrade * 100).toFixed(1)}%</Label>
                  <Slider
                    value={[calcRiskPerTrade]}
                    onValueChange={([value]) => setCalcRiskPerTrade(value)}
                    max={0.1}
                    min={0.005}
                    step={0.005}
                    className="mt-2"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Win Rate</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={calcWinRate}
                      onChange={(e) => setCalcWinRate(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Avg Win</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={calcAvgWin}
                      onChange={(e) => setCalcAvgWin(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Avg Loss</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={calcAvgLoss}
                      onChange={(e) => setCalcAvgLoss(Number(e.target.value))}
                    />
                  </div>
                </div>

                <Button onClick={calculatePositionSize} disabled={isCalculating} className="w-full">
                  {isCalculating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Calculate Position Size
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Calculations</CardTitle>
                <CardDescription>Position sizing recommendations</CardDescription>
              </CardHeader>
              <CardContent>
                {positionSizing.length > 0 ? (
                  <div className="space-y-3">
                    {positionSizing.map((calc, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{calc.symbol}</h4>
                          <Badge variant="outline">{calc.calculation_method}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Recommended:</span>
                            <span className="font-medium ml-2">{calc.recommended_size.toFixed(4)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Max Size:</span>
                            <span className="font-medium ml-2">{calc.max_size.toFixed(4)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Risk Score:</span>
                            <span className="font-medium ml-2">{(calc.risk_score * 100).toFixed(1)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Confidence:</span>
                            <span className="font-medium ml-2">{(calc.confidence_level * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No calculations yet.</p>
                    <p className="text-sm">Use the calculator to get position size recommendations.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="circuit-breakers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <span>Emergency Circuit Breakers</span>
              </CardTitle>
              <CardDescription>Automatic trading halts to protect against extreme losses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold text-red-600 flex items-center space-x-2">
                    <StopCircle className="h-4 w-4" />
                    <span>Manual Emergency Controls</span>
                  </h4>
                  
                  <div className="space-y-3">
                    <Button 
                      variant="destructive" 
                      className="w-full justify-start"
                      onClick={() => triggerCircuitBreaker('Manual emergency stop')}
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      Emergency Stop All Trading
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full justify-start text-red-600 border-red-600 hover:bg-red-50"
                      onClick={() => triggerCircuitBreaker('Manual position liquidation')}
                    >
                      <TrendingDown className="h-4 w-4 mr-2" />
                      Liquidate All Positions
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => triggerCircuitBreaker('Manual 24h pause')}
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Trading for 24 Hours
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Automatic Triggers</h4>
                  
                  <div className="space-y-3">
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Daily Loss Limit</span>
                        <Badge variant={riskSettings.circuit_breaker_enabled ? 'default' : 'secondary'}>
                          {riskSettings.circuit_breaker_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Triggers at {(riskSettings.circuit_breaker_threshold * 100).toFixed(1)}% daily loss
                      </p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Volatility Spike</span>
                        <Badge variant="default">Enabled</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Triggers when volatility exceeds 3x normal levels
                      </p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Correlation Breakdown</span>
                        <Badge variant="default">Enabled</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Triggers when asset correlations change rapidly
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Target className="h-5 w-5" />
                <span>Exposure Limits</span>
              </CardTitle>
              <CardDescription>Position and portfolio exposure constraints</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">Position Limits</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <Label>Max Position Size: {(riskSettings.max_position_size * 100).toFixed(1)}%</Label>
                      <Slider
                        value={[riskSettings.max_position_size]}
                        onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, max_position_size: value }))}
                        max={0.25}
                        min={0.01}
                        step={0.01}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Max Symbol Exposure: {(riskSettings.max_symbol_exposure * 100).toFixed(1)}%</Label>
                      <Slider
                        value={[riskSettings.max_symbol_exposure]}
                        onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, max_symbol_exposure: value }))}
                        max={0.5}
                        min={0.05}
                        step={0.05}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Max Correlation Exposure: {(riskSettings.max_correlation_exposure * 100).toFixed(1)}%</Label>
                      <Slider
                        value={[riskSettings.max_correlation_exposure]}
                        onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, max_correlation_exposure: value }))}
                        max={0.8}
                        min={0.1}
                        step={0.05}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold">Portfolio Limits</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <Label>Max Portfolio Risk: {(riskSettings.max_portfolio_risk * 100).toFixed(1)}%</Label>
                      <Slider
                        value={[riskSettings.max_portfolio_risk]}
                        onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, max_portfolio_risk: value }))}
                        max={0.2}
                        min={0.01}
                        step={0.005}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <Label>Daily Loss Limit ($)</Label>
                      <Input
                        type="number"
                        value={riskSettings.max_daily_loss}
                        onChange={(e) => setRiskSettings(prev => ({ ...prev, max_daily_loss: Number(e.target.value) }))}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>Risk Management Settings</span>
              </CardTitle>
              <CardDescription>Configure risk management parameters and algorithms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Circuit Breakers</Label>
                    <p className="text-sm text-muted-foreground">Automatically halt trading during extreme conditions</p>
                  </div>
                  <Switch
                    checked={riskSettings.circuit_breaker_enabled}
                    onCheckedChange={(checked) => setRiskSettings(prev => ({ ...prev, circuit_breaker_enabled: checked }))}
                  />
                </div>
                
                <div>
                  <Label>Circuit Breaker Threshold: {(riskSettings.circuit_breaker_threshold * 100).toFixed(1)}%</Label>
                  <Slider
                    value={[riskSettings.circuit_breaker_threshold]}
                    onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, circuit_breaker_threshold: value }))}
                    max={0.1}
                    min={0.01}
                    step={0.005}
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label>Position Sizing Method</Label>
                  <Select 
                    value={riskSettings.position_sizing_method} 
                    onValueChange={(value) => setRiskSettings(prev => ({ ...prev, position_sizing_method: value }))}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kelly">Kelly Criterion</SelectItem>
                      <SelectItem value="fixed_percentage">Fixed Percentage</SelectItem>
                      <SelectItem value="volatility_adjusted">Volatility Adjusted</SelectItem>
                      <SelectItem value="risk_parity">Risk Parity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Button onClick={updateRiskSettings} className="w-full">
                <Settings className="h-4 w-4 mr-2" />
                Save Risk Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};