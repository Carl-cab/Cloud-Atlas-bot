import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Play, 
  Square, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Clock,
  CheckCircle,
  X,
  AlertTriangle,
  Zap,
  BarChart3,
  Eye,
  RefreshCw,
  Target,
  ArrowLeft,
  Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop-loss' | 'take-profit';
  quantity: number;
  price?: number;
  stop_price?: number;
  time_in_force?: 'GTC' | 'IOC' | 'FOK';
}

interface LiveOrder {
  id: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  status: string;
  created_at: string;
  kraken_order_id?: string;
}

interface AccountBalance {
  [key: string]: string;
}

interface RiskSettings {
  max_position_size: number;
  max_daily_loss: number;
  stop_loss_percentage?: number;
  circuit_breaker_enabled?: boolean;
  circuit_breaker_threshold?: number;
  max_correlation_exposure?: number;
  max_portfolio_risk?: number;
}

export const LiveTrading = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [accountBalance, setAccountBalance] = useState<AccountBalance>({});
  const [openOrders, setOpenOrders] = useState<LiveOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<LiveOrder[]>([]);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [riskSettings, setRiskSettings] = useState<RiskSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [priceUpdateTime, setPriceUpdateTime] = useState<Date>(new Date());

  // Order form state
  const [orderForm, setOrderForm] = useState<OrderRequest>({
    symbol: 'BTCUSD',
    side: 'buy',
    type: 'market',
    quantity: 0.001,
    time_in_force: 'GTC'
  });

  const [confirmationModal, setConfirmationModal] = useState<{
    show: boolean;
    order?: OrderRequest;
    estimated_cost?: number;
    risk_analysis?: any;
  }>({ show: false });

  useEffect(() => {
    fetchRiskSettings();
    if (isLiveMode) {
      fetchAccountData();
      fetchMarketPrices();
      fetchOpenOrders();
      
      const interval = setInterval(() => {
        fetchMarketPrices();
        fetchOpenOrders();
        fetchAccountData();
      }, 5000); // Update every 5 seconds for real-time feel

      return () => clearInterval(interval);
    }
  }, [isLiveMode]);

  const fetchRiskSettings = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase
        .from('risk_settings')
        .select('*')
        .eq('user_id', user.data.user.id)
        .single();

      if (data) {
        setRiskSettings(data);
      }
    } catch (error) {
      console.error('Error fetching risk settings:', error);
    }
  };

  const fetchAccountData = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase.functions.invoke('live-trading-engine', {
        body: { action: 'get_balance', user_id: user.data.user.id }
      });

      if (error) throw error;
      if (data?.success) {
        setAccountBalance(data.balance);
      } else {
        throw new Error(data?.error || 'Failed to fetch account balance');
      }
    } catch (error) {
      console.error('Error fetching account data:', error);
      const errorMessage = error.message?.includes('credentials') 
        ? "Kraken API credentials not configured. Please add your API keys in Dashboard → Security."
        : `Failed to fetch account balance: ${error.message}`;
      
      toast({
        title: "Connection Error",
        description: errorMessage,
        variant: "destructive"
      });
      
      // If credentials issue, disable live mode
      if (error.message?.includes('credentials')) {
        setIsLiveMode(false);
      }
    }
  };

  const fetchOpenOrders = async () => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase.functions.invoke('live-trading-engine', {
        body: { action: 'get_open_orders', user_id: user.data.user.id }
      });

      if (error) throw error;
      if (data?.success) {
        const orders = Object.entries(data.orders || {}).map(([id, order]: [string, any]) => ({
          id,
          kraken_order_id: id,
          symbol: order.descr.pair,
          side: order.descr.type,
          type: order.descr.ordertype,
          quantity: parseFloat(order.vol),
          price: parseFloat(order.descr.price || '0'),
          status: order.status,
          created_at: new Date(order.opentm * 1000).toISOString()
        }));
        setOpenOrders(orders);
      }
    } catch (error) {
      console.error('Error fetching open orders:', error);
    }
  };

  const fetchMarketPrices = async () => {
    try {
      const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD'];
      const prices: Record<string, number> = {};

      for (const symbol of symbols) {
        const { data, error } = await supabase.functions.invoke('live-trading-engine', {
          body: { action: 'get_market_price', symbol }
        });

        if (data?.success) {
          prices[symbol] = data.price;
        }
      }

      setMarketPrices(prices);
      setPriceUpdateTime(new Date());
    } catch (error) {
      console.error('Error fetching market prices:', error);
    }
  };

  const calculateEstimatedCost = (order: OrderRequest): number => {
    const price = order.type === 'market' ? marketPrices[order.symbol] : order.price || 0;
    return order.quantity * price;
  };

  const validateOrderRisk = async (order: OrderRequest) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data, error } = await supabase.functions.invoke('risk-management-engine', {
        body: {
          action: 'validate_order',
          user_id: user.data.user.id,
          order_data: order
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Risk validation error:', error);
      throw error;
    }
  };

  const validateOrder = (order: OrderRequest): string | null => {
    if (order.quantity <= 0) return "Quantity must be greater than 0";
    
    if (order.type === 'limit' && (!order.price || order.price <= 0)) {
      return "Limit orders require a valid price";
    }

    if ((order.type === 'stop-loss' || order.type === 'take-profit') && (!order.stop_price || order.stop_price <= 0)) {
      return "Stop orders require a valid stop price";
    }

    const estimatedCost = calculateEstimatedCost(order);
    const availableBalance = parseFloat(accountBalance.ZUSD || accountBalance.USD || '0');
    
    if (order.side === 'buy' && estimatedCost > availableBalance * 0.95) {
      return "Insufficient USD balance for this order";
    }

    return null;
  };

  const handleOrderSubmit = async () => {
    const validationError = validateOrder(orderForm);
    if (validationError) {
      toast({
        title: "Order Validation Failed",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      // Validate against risk settings
      const riskAnalysis = await validateOrderRisk(orderForm);
      
      setConfirmationModal({
        show: true,
        order: orderForm,
        estimated_cost: calculateEstimatedCost(orderForm),
        risk_analysis: riskAnalysis
      });
    } catch (error) {
      toast({
        title: "Risk Validation Failed",
        description: error.message || "Order violates risk management rules",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmOrder = async () => {
    if (!confirmationModal.order) return;

    setIsLoading(true);
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data, error } = await supabase.functions.invoke('live-trading-engine', {
        body: {
          action: 'place_order',
          user_id: user.data.user.id,
          ...confirmationModal.order
        }
      });

      if (error) throw error;
      
      if (data?.success) {
        toast({
          title: "Order Placed Successfully",
          description: `Order ID: ${data.order_id}`,
        });
        
        setConfirmationModal({ show: false });
        await fetchOpenOrders();
        await fetchAccountData();
      }
    } catch (error) {
      console.error('Error placing order:', error);
      toast({
        title: "Order Failed",
        description: error.message || "Failed to place order",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await supabase.functions.invoke('live-trading-engine', {
        body: {
          action: 'cancel_order',
          user_id: user.data.user.id,
          order_id: orderId
        }
      });

      if (error) throw error;
      
      if (data?.success) {
        toast({
          title: "Order Cancelled",
          description: "Order has been successfully cancelled",
        });
        
        await fetchOpenOrders();
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast({
        title: "Cancellation Failed",
        description: error.message || "Failed to cancel order",
        variant: "destructive"
      });
    }
  };

  const getOrderStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'open': case 'pending': return 'text-blue-500';
      case 'closed': case 'executed': return 'text-green-500';
      case 'cancelled': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const formatBalance = (amount: string) => {
    return parseFloat(amount).toFixed(8);
  };

  const handleToggleLiveMode = async () => {
    if (isLiveMode) {
      setIsLiveMode(false);
      return;
    }

    // Test connection before enabling live mode
    setIsLoading(true);
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('live-trading-engine', {
        body: { action: 'get_balance', user_id: user.data.user.id }
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to connect to Kraken API');
      }

      // Connection successful, enable live mode
      setIsLiveMode(true);
      setAccountBalance(data.balance);
      
      toast({
        title: "Live Mode Enabled",
        description: "Successfully connected to Kraken API",
      });
    } catch (error) {
      console.error('Connection test failed:', error);
      const errorMessage = error.message?.includes('credentials') 
        ? "Please add your Kraken API keys in Dashboard → Security before enabling Live Mode."
        : `Connection failed: ${error.message}`;
      
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPortfolioValue = () => {
    const usdBalance = parseFloat(accountBalance.ZUSD || accountBalance.USD || '0');
    const btcBalance = parseFloat(accountBalance.XXBT || '0');
    const ethBalance = parseFloat(accountBalance.XETH || '0');
    
    return usdBalance + 
           (btcBalance * (marketPrices.BTCUSD || 0)) + 
           (ethBalance * (marketPrices.ETHUSD || 0));
  };

  return (
    <div className="min-h-screen bg-gradient-hero p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </Button>
            
            <div className="flex items-center space-x-3">
              <Zap className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Live Trading Terminal
                </h1>
                <p className="text-muted-foreground">Real-time order execution via Kraken</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Badge variant={isLiveMode ? 'default' : 'secondary'} className="px-3 py-2">
              {isLiveMode ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Live Mode Active
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Demo Mode
                </>
              )}
            </Badge>
            
            <Button
              onClick={handleToggleLiveMode}
              variant={isLiveMode ? 'destructive' : 'default'}
              size="sm"
              className="px-4"
              disabled={isLoading}
            >
              {isLiveMode ? (
                <>
                  <Square className="h-4 w-4 mr-1" />
                  Disable Live Trading
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  {isLoading ? 'Connecting...' : 'Enable Live Mode'}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Live Mode Warning */}
        {!isLiveMode && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Demo Mode:</strong> Live trading is disabled. Click "Enable Live Mode" to start placing real orders on Kraken.
            </AlertDescription>
          </Alert>
        )}

        {isLiveMode && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              <strong>Live Mode Active:</strong> You are now connected to Kraken and can place real orders. All trades will use actual funds.
            </AlertDescription>
          </Alert>
        )}

        {/* Portfolio Summary */}
        {isLiveMode && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Portfolio Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  ${getPortfolioValue().toFixed(2)}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Open Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {openOrders.length}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">USD Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  ${parseFloat(accountBalance.ZUSD || accountBalance.USD || '0').toFixed(2)}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Last Update
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  {priceUpdateTime.toLocaleTimeString()}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="place-order" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="place-order">Place Orders</TabsTrigger>
            <TabsTrigger value="monitor">Monitor Trades</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="risk">Manage Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="place-order" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Target className="h-5 w-5" />
                    <span>Order Form</span>
                  </CardTitle>
                  <CardDescription>Place live trades with real-time market prices</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Symbol</Label>
                      <Select value={orderForm.symbol} onValueChange={(value) => setOrderForm(prev => ({ ...prev, symbol: value }))}>
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
                      <Select value={orderForm.side} onValueChange={(value: 'buy' | 'sell') => setOrderForm(prev => ({ ...prev, side: value }))}>
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
                      <Label>Order Type</Label>
                      <Select value={orderForm.type} onValueChange={(value: any) => setOrderForm(prev => ({ ...prev, type: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">Market</SelectItem>
                          <SelectItem value="limit">Limit</SelectItem>
                          <SelectItem value="stop-loss">Stop Loss</SelectItem>
                          <SelectItem value="take-profit">Take Profit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Time in Force</Label>
                      <Select value={orderForm.time_in_force} onValueChange={(value: any) => setOrderForm(prev => ({ ...prev, time_in_force: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GTC">Good Till Cancelled</SelectItem>
                          <SelectItem value="IOC">Immediate or Cancel</SelectItem>
                          <SelectItem value="FOK">Fill or Kill</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      step="0.00000001"
                      value={orderForm.quantity}
                      onChange={(e) => setOrderForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) }))}
                    />
                  </div>

                  {orderForm.type === 'limit' && (
                    <div>
                      <Label>Limit Price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={orderForm.price || ''}
                        onChange={(e) => setOrderForm(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                      />
                    </div>
                  )}

                  {(orderForm.type === 'stop-loss' || orderForm.type === 'take-profit') && (
                    <div>
                      <Label>Stop Price ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={orderForm.stop_price || ''}
                        onChange={(e) => setOrderForm(prev => ({ ...prev, stop_price: parseFloat(e.target.value) }))}
                      />
                    </div>
                  )}

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm font-medium">Order Summary</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Estimated Cost: ${calculateEstimatedCost(orderForm).toFixed(2)}
                    </div>
                  </div>

                  <Button 
                    onClick={handleOrderSubmit} 
                    disabled={!isLiveMode || isLoading}
                    className="w-full"
                    variant={orderForm.side === 'buy' ? 'default' : 'destructive'}
                  >
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : orderForm.side === 'buy' ? (
                      <TrendingUp className="h-4 w-4 mr-2" />
                    ) : (
                      <TrendingDown className="h-4 w-4 mr-2" />
                    )}
                    {isLoading ? 'Processing...' : `Place ${orderForm.side.charAt(0).toUpperCase() + orderForm.side.slice(1)} Order`}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Real-Time Market Prices</span>
                      <Button variant="outline" size="sm" onClick={fetchMarketPrices}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(marketPrices).map(([symbol, price]) => (
                        <div key={symbol} className="flex justify-between items-center p-2 rounded bg-muted">
                          <span className="font-medium">{symbol}</span>
                          <span className="text-lg font-bold text-primary">${price.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground text-center">
                        Last updated: {priceUpdateTime.toLocaleTimeString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {riskSettings && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <Shield className="h-4 w-4" />
                        <span>Risk Protection</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Max Position Size:</span>
                        <span>{(riskSettings.max_position_size * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Stop Loss:</span>
                        <span>{((riskSettings.stop_loss_percentage || 0.05) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        All orders are automatically validated against your risk settings
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="monitor" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Open Orders</span>
                    <Button variant="outline" size="sm" onClick={fetchOpenOrders}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {openOrders.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No open orders</p>
                  ) : (
                    <div className="space-y-3">
                      {openOrders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between p-3 border rounded">
                          <div>
                            <div className="font-medium">{order.symbol}</div>
                            <div className="text-sm text-muted-foreground">
                              {order.side.toUpperCase()} {order.quantity} @ ${order.price}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={getOrderStatusColor(order.status)}>
                              {order.status}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancelOrder(order.kraken_order_id || order.id)}
                              className="ml-2"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(accountBalance).length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      {isLiveMode ? 'Loading balance...' : 'Enable Live Mode to view balance'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(accountBalance)
                        .filter(([, amount]) => parseFloat(amount) > 0)
                        .map(([asset, amount]) => (
                          <div key={asset} className="flex justify-between">
                            <span className="font-medium">{asset}</span>
                            <span>{formatBalance(amount)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Account Overview</CardTitle>
                <CardDescription>Real-time account information and balance details</CardDescription>
              </CardHeader>
              <CardContent>
                {isLiveMode ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold mb-3">Account Balances</h3>
                      <div className="space-y-2">
                        {Object.entries(accountBalance).map(([asset, amount]) => (
                          <div key={asset} className="flex justify-between p-2 bg-muted rounded">
                            <span className="font-medium">{asset}</span>
                            <span>{formatBalance(amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold mb-3">Portfolio Summary</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Total Value:</span>
                          <span className="font-bold">${getPortfolioValue().toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Open Orders:</span>
                          <span>{openOrders.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Last Update:</span>
                          <span>{priceUpdateTime.toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Enable Live Mode to view account details</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Risk Management</CardTitle>
                <CardDescription>Orders are automatically validated against your risk settings</CardDescription>
              </CardHeader>
              <CardContent>
                {riskSettings ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 border rounded">
                        <div className="text-sm font-medium">Max Position Size</div>
                        <div className="text-2xl font-bold text-primary">
                          {(riskSettings.max_position_size * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">of portfolio</div>
                      </div>
                      
                      <div className="p-4 border rounded">
                        <div className="text-sm font-medium">Max Daily Loss</div>
                        <div className="text-2xl font-bold text-destructive">
                          {(riskSettings.max_daily_loss * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">of portfolio</div>
                      </div>
                      
                      <div className="p-4 border rounded">
                        <div className="text-sm font-medium">Stop Loss</div>
                         <div className="text-2xl font-bold text-warning">
                          {((riskSettings.stop_loss_percentage || 0.05) * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">per position</div>
                      </div>
                    </div>
                    
                    <Alert>
                      <Shield className="h-4 w-4" />
                      <AlertDescription>
                        All orders are automatically validated against these risk parameters before execution.
                        Orders that exceed risk limits will be rejected.
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No risk settings configured</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => navigate('/')}
                    >
                      Configure Risk Settings
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Order Confirmation Dialog */}
      <Dialog open={confirmationModal.show} onOpenChange={(open) => setConfirmationModal({ show: open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Order</DialogTitle>
            <DialogDescription>
              Please review your order details before submitting to Kraken
            </DialogDescription>
          </DialogHeader>
          
          {confirmationModal.order && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium">Symbol:</span>
                  <p>{confirmationModal.order.symbol}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Side:</span>
                  <p className="capitalize">{confirmationModal.order.side}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Type:</span>
                  <p className="capitalize">{confirmationModal.order.type}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Quantity:</span>
                  <p>{confirmationModal.order.quantity}</p>
                </div>
              </div>
              
              <div className="p-3 bg-muted rounded">
                <div className="text-sm font-medium">Estimated Cost</div>
                <div className="text-lg font-bold">${confirmationModal.estimated_cost?.toFixed(2)}</div>
              </div>

              {confirmationModal.risk_analysis && (
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Order validated against risk management settings
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmationModal({ show: false })}>
              Cancel
            </Button>
            <Button onClick={confirmOrder} disabled={isLoading}>
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirm Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};