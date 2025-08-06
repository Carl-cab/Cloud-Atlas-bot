import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Square, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Shield,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  Zap,
  Eye,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StopLossSettings {
  enabled: boolean;
  type: 'percentage' | 'fixed';
  value: number;
  trailing: boolean;
}

interface TakeProfitSettings {
  enabled: boolean;
  type: 'percentage' | 'fixed';
  value: number;
}

interface RiskManagementSettings {
  stopLoss: StopLossSettings;
  takeProfit: TakeProfitSettings;
  maxPositionSize: number;
  maxDailyLoss: number;
  circuitBreakerEnabled: boolean;
}

interface TradingConfig {
  mode: 'paper' | 'live';
  paperBalance: number;
  autoTradingEnabled: boolean;
  riskManagement: RiskManagementSettings;
}

export const EnhancedTradingInterface = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<TradingConfig>({
    mode: 'paper',
    paperBalance: 10000,
    autoTradingEnabled: false,
    riskManagement: {
      stopLoss: { enabled: true, type: 'percentage', value: 2, trailing: false },
      takeProfit: { enabled: true, type: 'percentage', value: 5 },
      maxPositionSize: 10,
      maxDailyLoss: 200,
      circuitBreakerEnabled: true
    }
  });

  const [realTimeData, setRealTimeData] = useState<Record<string, any>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  useEffect(() => {
    loadTradingConfig();
    setupRealTimeUpdates();
  }, []);

  const loadTradingConfig = async () => {
    try {
      const userId = '00000000-0000-0000-0000-000000000000';
      
      // Load bot config
      const { data: botConfig } = await supabase
        .from('bot_config')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Load risk settings
      const { data: riskSettings } = await supabase
        .from('risk_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (botConfig && riskSettings) {
        setConfig({
          mode: (botConfig.mode as 'paper' | 'live') || 'paper',
          paperBalance: botConfig.paper_trading_balance || 10000,
          autoTradingEnabled: botConfig.is_active || false,
          riskManagement: {
            stopLoss: {
              enabled: botConfig.stop_loss_enabled || true,
              type: 'percentage',
              value: riskSettings.max_daily_loss / 100 || 2,
              trailing: botConfig.trailing_stop_enabled || false
            },
            takeProfit: {
              enabled: botConfig.take_profit_enabled || true,
              type: 'percentage',
              value: 5
            },
            maxPositionSize: riskSettings.max_position_size * 100 || 10,
            maxDailyLoss: riskSettings.max_daily_loss || 200,
            circuitBreakerEnabled: riskSettings.circuit_breaker_enabled || true
          }
        });
      }
    } catch (error) {
      console.error('Error loading trading config:', error);
      toast({
        title: "Configuration Error",
        description: "Failed to load trading configuration",
        variant: "destructive"
      });
    }
  };

  const setupRealTimeUpdates = () => {
    setConnectionStatus('connecting');
    
    // Subscribe to market data updates
    const marketDataChannel = supabase
      .channel('market-data')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'market_data_cache' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'symbol' in payload.new) {
            const marketData = payload.new as any;
            setRealTimeData(prev => ({
              ...prev,
              [marketData.symbol]: marketData
            }));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          toast({
            title: "Real-time Connected",
            description: "Live market data feed active"
          });
        }
      });

    // Subscribe to notifications
    const notificationChannel = supabase
      .channel('notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_queue' },
        (payload) => {
          if (payload.new.user_id === '00000000-0000-0000-0000-000000000000') {
            toast({
              title: payload.new.title,
              description: payload.new.message,
              variant: payload.new.priority === 'high' ? 'destructive' : 'default'
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(marketDataChannel);
      supabase.removeChannel(notificationChannel);
    };
  };

  const updateTradingConfig = async (newConfig: Partial<TradingConfig>) => {
    try {
      const userId = '00000000-0000-0000-0000-000000000000';
      const updatedConfig = { ...config, ...newConfig };
      
      // Update bot config
      await supabase
        .from('bot_config')
        .upsert({
          user_id: userId,
          mode: updatedConfig.mode,
          paper_trading_balance: updatedConfig.paperBalance,
          is_active: updatedConfig.autoTradingEnabled,
          stop_loss_enabled: updatedConfig.riskManagement.stopLoss.enabled,
          take_profit_enabled: updatedConfig.riskManagement.takeProfit.enabled,
          trailing_stop_enabled: updatedConfig.riskManagement.stopLoss.trailing
        });

      // Update risk settings
      await supabase
        .from('risk_settings')
        .upsert({
          user_id: userId,
          max_daily_loss: updatedConfig.riskManagement.maxDailyLoss,
          max_position_size: updatedConfig.riskManagement.maxPositionSize / 100,
          circuit_breaker_enabled: updatedConfig.riskManagement.circuitBreakerEnabled
        });

      setConfig(updatedConfig);
      
      toast({
        title: "Configuration Updated",
        description: "Trading settings have been saved successfully"
      });

    } catch (error) {
      console.error('Error updating config:', error);
      toast({
        title: "Update Failed",
        description: "Failed to save trading configuration",
        variant: "destructive"
      });
    }
  };

  const toggleAutoTrading = async () => {
    const newStatus = !config.autoTradingEnabled;
    
    // Security check for live mode
    if (newStatus && config.mode === 'live') {
      const confirmed = confirm(
        'Are you sure you want to enable live auto-trading? This will use real funds.'
      );
      if (!confirmed) return;
    }

    await updateTradingConfig({ autoTradingEnabled: newStatus });
    
    // Log security event
    await supabase.functions.invoke('security-audit', {
      body: {
        action: 'toggle_auto_trading',
        resource: 'trading_bot',
        metadata: { enabled: newStatus, mode: config.mode }
      }
    });
  };

  const switchTradingMode = async (mode: 'paper' | 'live') => {
    if (mode === 'live') {
      const confirmed = confirm(
        'Switching to live mode will use real funds. Are you sure?'
      );
      if (!confirmed) return;
    }

    await updateTradingConfig({ mode });
    
    toast({
      title: `Switched to ${mode.toUpperCase()} Mode`,
      description: mode === 'live' 
        ? 'You are now trading with real funds'
        : 'You are now in safe paper trading mode',
      variant: mode === 'live' ? 'destructive' : 'default'
    });
  };

  const testEmergencyStop = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('risk-management-engine', {
        body: {
          action: 'emergency_stop',
          user_id: '00000000-0000-0000-0000-000000000000',
          reason: 'Manual emergency stop test'
        }
      });

      if (error) throw error;

      toast({
        title: "Emergency Stop Activated",
        description: "All trading has been halted",
        variant: "destructive"
      });
    } catch (error) {
      console.error('Emergency stop error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Zap className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle>Enhanced Trading Engine</CardTitle>
                  <CardDescription>Advanced order management with stop-loss & take-profit</CardDescription>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
                  {connectionStatus === 'connected' ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Live Data
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 mr-1" />
                      {connectionStatus}
                    </>
                  )}
                </Badge>
                
                <Badge variant={config.mode === 'live' ? 'destructive' : 'secondary'}>
                  {config.mode === 'live' ? 'LIVE MODE' : 'PAPER MODE'}
                </Badge>
              </div>
            </div>

            <Button
              onClick={toggleAutoTrading}
              variant={config.autoTradingEnabled ? 'destructive' : 'default'}
              className="min-w-[140px]"
            >
              {config.autoTradingEnabled ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Stop Trading
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Trading
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="orders">Smart Orders</TabsTrigger>
          <TabsTrigger value="risk">Risk Management</TabsTrigger>
          <TabsTrigger value="settings">Trading Settings</TabsTrigger>
          <TabsTrigger value="monitor">Live Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Smart Order Placement
              </CardTitle>
              <CardDescription>
                Place orders with automatic stop-loss and take-profit management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Order Form with Stop-Loss/Take-Profit */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Order Details</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Symbol</Label>
                      <Select defaultValue="BTCUSD">
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
                      <Label>Side</Label>
                      <Select defaultValue="buy">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Quantity</Label>
                      <Input type="number" placeholder="0.001" step="0.001" />
                    </div>
                    
                    <div>
                      <Label>Order Type</Label>
                      <Select defaultValue="market">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">Market</SelectItem>
                          <SelectItem value="limit">Limit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Risk Management</h4>
                  
                  {/* Stop Loss */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={config.riskManagement.stopLoss.enabled}
                        onCheckedChange={(checked) =>
                          updateTradingConfig({
                            riskManagement: {
                              ...config.riskManagement,
                              stopLoss: { ...config.riskManagement.stopLoss, enabled: checked }
                            }
                          })
                        }
                      />
                      <Label>Stop Loss</Label>
                    </div>
                    
                    {config.riskManagement.stopLoss.enabled && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input 
                          type="number" 
                          placeholder="2%" 
                          value={config.riskManagement.stopLoss.value}
                          onChange={(e) =>
                            updateTradingConfig({
                              riskManagement: {
                                ...config.riskManagement,
                                stopLoss: { 
                                  ...config.riskManagement.stopLoss, 
                                  value: parseFloat(e.target.value) || 0
                                }
                              }
                            })
                          }
                        />
                        <div className="flex items-center space-x-2">
                          <Switch 
                            checked={config.riskManagement.stopLoss.trailing}
                            onCheckedChange={(checked) =>
                              updateTradingConfig({
                                riskManagement: {
                                  ...config.riskManagement,
                                  stopLoss: { ...config.riskManagement.stopLoss, trailing: checked }
                                }
                              })
                            }
                          />
                          <Label className="text-sm">Trailing</Label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Take Profit */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={config.riskManagement.takeProfit.enabled}
                        onCheckedChange={(checked) =>
                          updateTradingConfig({
                            riskManagement: {
                              ...config.riskManagement,
                              takeProfit: { ...config.riskManagement.takeProfit, enabled: checked }
                            }
                          })
                        }
                      />
                      <Label>Take Profit</Label>
                    </div>
                    
                    {config.riskManagement.takeProfit.enabled && (
                      <Input 
                        type="number" 
                        placeholder="5%" 
                        value={config.riskManagement.takeProfit.value}
                        onChange={(e) =>
                          updateTradingConfig({
                            riskManagement: {
                              ...config.riskManagement,
                              takeProfit: { 
                                ...config.riskManagement.takeProfit, 
                                value: parseFloat(e.target.value) || 0
                              }
                            }
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Risk Amount: $50.00 | Max Loss: ${config.riskManagement.maxDailyLoss}
                </div>
                <Button className="bg-gradient-primary">
                  Place Smart Order
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Management Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="flex items-center justify-between">
                      Max Position Size
                      <span className="text-sm text-muted-foreground">
                        {config.riskManagement.maxPositionSize}%
                      </span>
                    </Label>
                    <Slider
                      value={[config.riskManagement.maxPositionSize]}
                      onValueChange={([value]) =>
                        updateTradingConfig({
                          riskManagement: {
                            ...config.riskManagement,
                            maxPositionSize: value
                          }
                        })
                      }
                      max={25}
                      min={1}
                      step={1}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label>Max Daily Loss ($)</Label>
                    <Input 
                      type="number" 
                      value={config.riskManagement.maxDailyLoss}
                      onChange={(e) =>
                        updateTradingConfig({
                          riskManagement: {
                            ...config.riskManagement,
                            maxDailyLoss: parseFloat(e.target.value) || 0
                          }
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch 
                      checked={config.riskManagement.circuitBreakerEnabled}
                      onCheckedChange={(checked) =>
                        updateTradingConfig({
                          riskManagement: {
                            ...config.riskManagement,
                            circuitBreakerEnabled: checked
                          }
                        })
                      }
                    />
                    <Label>Circuit Breaker</Label>
                  </div>
                  
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Circuit breaker will automatically halt trading if daily loss exceeds the limit
                    </AlertDescription>
                  </Alert>

                  <Button 
                    variant="destructive" 
                    onClick={testEmergencyStop}
                    className="w-full"
                  >
                    Emergency Stop Test
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Trading Mode & Paper Trading
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Trading Mode</Label>
                    <Select 
                      value={config.mode}
                      onValueChange={(value: 'paper' | 'live') => switchTradingMode(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paper">Paper Trading</SelectItem>
                        <SelectItem value="live">Live Trading</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {config.mode === 'paper' && (
                    <div>
                      <Label>Paper Trading Balance ($)</Label>
                      <Input 
                        type="number" 
                        value={config.paperBalance}
                        onChange={(e) =>
                          updateTradingConfig({
                            paperBalance: parseFloat(e.target.value) || 10000
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Alert className={config.mode === 'live' ? 'border-destructive' : ''}>
                    {config.mode === 'live' ? (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Live Mode Active:</strong> You are trading with real funds. 
                          All trades will impact your actual account balance.
                        </AlertDescription>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Paper Trading Mode:</strong> Safe environment for testing strategies 
                          without risking real money.
                        </AlertDescription>
                      </>
                    )}
                  </Alert>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitor" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Portfolio Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  ${config.mode === 'paper' ? config.paperBalance.toFixed(2) : '0.00'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {config.mode === 'paper' ? 'Paper Balance' : 'Live Balance'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Active Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0</div>
                <p className="text-xs text-muted-foreground">Open positions</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Daily P&L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-accent">+$0.00</div>
                <p className="text-xs text-muted-foreground">Today's performance</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Real-time Market Data</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(realTimeData).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(realTimeData).map(([symbol, data]) => (
                    <div key={symbol} className="flex items-center justify-between p-2 border rounded">
                      <span className="font-medium">{symbol}</span>
                      <div className="flex items-center space-x-4">
                        <span className="text-lg font-bold">${data.price}</span>
                        <Badge variant={data.change_24h > 0 ? 'default' : 'destructive'}>
                          {data.change_24h > 0 ? '+' : ''}{data.change_24h}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="h-8 w-8 mx-auto mb-2" />
                  <p>Waiting for real-time market data...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};