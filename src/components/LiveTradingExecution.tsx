import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
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
  Target
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export const LiveTradingExecution = () => {
  const { toast } = useToast();
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [accountBalance, setAccountBalance] = useState<AccountBalance>({});
  const [openOrders, setOpenOrders] = useState<LiveOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<LiveOrder[]>([]);
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);

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
  }>({ show: false });

  useEffect(() => {
    if (isLiveMode) {
      fetchAccountData();
      fetchMarketPrices();
      const interval = setInterval(() => {
        fetchMarketPrices();
        fetchOpenOrders();
      }, 10000); // Update every 10 seconds

      return () => clearInterval(interval);
    }
  }, [isLiveMode]);

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
      }
    } catch (error) {
      console.error('Error fetching account data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch account balance",
        variant: "destructive"
      });
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
        // Convert Kraken order format to our format
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
    } catch (error) {
      console.error('Error fetching market prices:', error);
    }
  };

  const calculateEstimatedCost = (order: OrderRequest): number => {
    const price = order.type === 'market' ? marketPrices[order.symbol] : order.price || 0;
    return order.quantity * price;
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

  const handleOrderSubmit = () => {
    const validationError = validateOrder(orderForm);
    if (validationError) {
      toast({
        title: "Order Validation Failed",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    setConfirmationModal({
      show: true,
      order: orderForm,
      estimated_cost: calculateEstimatedCost(orderForm)
    });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Zap className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Live Trading Execution</h2>
            <p className="text-muted-foreground">Real-time order placement and management via Kraken</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <Badge variant={isLiveMode ? 'default' : 'secondary'} className="px-3 py-1">
            {isLiveMode ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Live Mode
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                Demo Mode
              </>
            )}
          </Badge>
          
          <Button
            onClick={() => setIsLiveMode(!isLiveMode)}
            variant={isLiveMode ? 'destructive' : 'default'}
            size="sm"
          >
            {isLiveMode ? (
              <>
                <Square className="h-4 w-4 mr-1" />
                Disable Live Trading
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Enable Live Trading
              </>
            )}
          </Button>
        </div>
      </div>

      {!isLiveMode && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Live trading is currently disabled. Enable it to place real orders on Kraken.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="place-order" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="place-order">Place Order</TabsTrigger>
          <TabsTrigger value="open-orders">Open Orders</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="history">Order History</TabsTrigger>
        </TabsList>

        <TabsContent value="place-order" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Target className="h-5 w-5" />
                  <span>New Order</span>
                </CardTitle>
                <CardDescription>Place a live trade order</CardDescription>
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

                <Button 
                  onClick={handleOrderSubmit} 
                  disabled={!isLiveMode}
                  className="w-full"
                  variant={orderForm.side === 'buy' ? 'default' : 'destructive'}
                >
                  {orderForm.side === 'buy' ? (
                    <>
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Place Buy Order
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4 mr-2" />
                      Place Sell Order
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Market Prices</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(marketPrices).map(([symbol, price]) => (
                      <div key={symbol} className="flex justify-between items-center">
                        <span className="font-medium">{symbol}</span>
                        <span className="text-lg font-bold">${price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Order Estimate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Estimated Cost:</span>
                      <span className="font-bold">${calculateEstimatedCost(orderForm).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimated Fee:</span>
                      <span>${(calculateEstimatedCost(orderForm) * 0.0026).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="open-orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Open Orders ({openOrders.length})</span>
                <Button onClick={fetchOpenOrders} size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {openOrders.length > 0 ? (
                <div className="space-y-3">
                  {openOrders.map((order) => (
                    <div key={order.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Badge variant={order.side === 'buy' ? 'default' : 'destructive'}>
                            {order.side.toUpperCase()}
                          </Badge>
                          <span className="font-medium">{order.symbol}</span>
                          <Badge variant="outline">{order.type}</Badge>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className={getOrderStatusColor(order.status)}>
                            {order.status}
                          </Badge>
                          <Button
                            onClick={() => cancelOrder(order.kraken_order_id || order.id)}
                            size="sm"
                            variant="destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Quantity:</span>
                          <span className="font-medium ml-2">{order.quantity.toFixed(8)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Price:</span>
                          <span className="font-medium ml-2">${order.price.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Created:</span>
                          <span className="font-medium ml-2">{new Date(order.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No open orders.</p>
                  <p className="text-sm">Place an order to see it here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Account Balance</span>
                <Button onClick={fetchAccountData} size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(accountBalance).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(accountBalance).map(([asset, amount]) => (
                    <div key={asset} className="p-3 border rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{asset}</span>
                        <span className="text-lg font-bold">{formatBalance(amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No balance data available.</p>
                  <p className="text-sm">Enable live trading to view your account balance.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Order History</CardTitle>
              <CardDescription>Recent completed and cancelled orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Order history will appear here.</p>
                <p className="text-sm">Complete some trades to view your trading history.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Order Confirmation Modal */}
      {confirmationModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Confirm Order</CardTitle>
              <CardDescription>Please review your order details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {confirmationModal.order && (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Symbol:</span>
                      <span className="font-medium ml-2">{confirmationModal.order.symbol}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Side:</span>
                      <Badge variant={confirmationModal.order.side === 'buy' ? 'default' : 'destructive'} className="ml-2">
                        {confirmationModal.order.side.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium ml-2">{confirmationModal.order.type}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-medium ml-2">{confirmationModal.order.quantity}</span>
                    </div>
                    {confirmationModal.order.price && (
                      <div>
                        <span className="text-muted-foreground">Price:</span>
                        <span className="font-medium ml-2">${confirmationModal.order.price}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Est. Cost:</span>
                      <span className="font-medium ml-2">${confirmationModal.estimated_cost?.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      This is a live order that will be placed on Kraken. Please confirm all details are correct.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="flex space-x-2">
                    <Button
                      onClick={confirmOrder}
                      disabled={isLoading}
                      className="flex-1"
                      variant={confirmationModal.order.side === 'buy' ? 'default' : 'destructive'}
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Placing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Confirm Order
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => setConfirmationModal({ show: false })}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};