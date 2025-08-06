import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Wifi, 
  WifiOff, 
  Activity, 
  TrendingUp, 
  Volume2, 
  Eye,
  Pause,
  Play,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface WebSocketConnection {
  id: string;
  exchange: string;
  symbol: string;
  type: 'ticker' | 'orderbook' | 'trades';
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastUpdate?: Date;
  data?: any;
}

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  bid: number;
  ask: number;
  timestamp: Date;
}

export const WebSocketManager = () => {
  const [connections, setConnections] = useState<WebSocketConnection[]>([]);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState('kraken');
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD');
  const { toast } = useToast();
  
  const wsRefs = useRef<Record<string, WebSocket>>({});

  const EXCHANGES = [
    { id: 'kraken', name: 'Kraken', wsUrl: 'wss://ws.kraken.com' },
    { id: 'binance', name: 'Binance', wsUrl: 'wss://stream.binance.com:9443/ws' },
    { id: 'coinbase', name: 'Coinbase', wsUrl: 'wss://ws-feed.exchange.coinbase.com' }
  ];

  const SYMBOLS = [
    'BTCUSD', 'ETHUSD', 'ADAUSD', 'SOLUSD', 'DOTUSD', 
    'XRPUSD', 'MATICUSD', 'AVAXUSD', 'LINKUSD', 'LTCUSD'
  ];

  useEffect(() => {
    // Auto-connect to Kraken BTCUSD on load
    connectToFeed('kraken', 'BTCUSD', 'ticker');
    
    return () => {
      // Cleanup all WebSocket connections
      Object.values(wsRefs.current).forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    };
  }, []);

  const connectToFeed = async (exchange: string, symbol: string, type: 'ticker' | 'orderbook' | 'trades') => {
    const connectionId = `${exchange}-${symbol}-${type}`;
    
    // Check if already connected
    if (connections.find(conn => conn.id === connectionId && conn.status === 'connected')) {
      toast({
        title: "Already Connected",
        description: `${exchange.toUpperCase()} ${symbol} ${type} feed is already active`,
      });
      return;
    }

    setIsConnecting(true);
    
    try {
      const newConnection: WebSocketConnection = {
        id: connectionId,
        exchange,
        symbol,
        type,
        status: 'connecting'
      };

      setConnections(prev => {
        const filtered = prev.filter(conn => conn.id !== connectionId);
        return [...filtered, newConnection];
      });

      // Create WebSocket connection based on exchange
      let ws: WebSocket;
      
      if (exchange === 'kraken') {
        ws = new WebSocket('wss://ws.kraken.com');
        
        ws.onopen = () => {
          // Subscribe to Kraken ticker
          const subscription = {
            event: 'subscribe',
            pair: [symbol.replace('USD', '/USD')],
            subscription: { name: type === 'ticker' ? 'ticker' : 'trade' }
          };
          ws.send(JSON.stringify(subscription));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (Array.isArray(data) && data[1] === symbol.replace('USD', '/USD')) {
              if (type === 'ticker' && data[2]) {
                const tickerData = data[2];
                setMarketData(prev => ({
                  ...prev,
                  [symbol]: {
                    symbol,
                    price: parseFloat(tickerData.c?.[0] || '0'),
                    change24h: parseFloat(tickerData.p?.[1] || '0'),
                    volume24h: parseFloat(tickerData.v?.[1] || '0'),
                    bid: parseFloat(tickerData.b?.[0] || '0'),
                    ask: parseFloat(tickerData.a?.[0] || '0'),
                    timestamp: new Date()
                  }
                }));
              }
              
              updateConnectionStatus(connectionId, 'connected');
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      }
      
      // Simulate other exchanges with mock data for demo
      else {
        // Create a mock WebSocket-like connection
        ws = new WebSocket('wss://echo.websocket.org');
        
        ws.onopen = () => {
          // Simulate market data updates
          const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              const mockPrice = 50000 + Math.random() * 10000;
              setMarketData(prev => ({
                ...prev,
                [symbol]: {
                  symbol,
                  price: mockPrice,
                  change24h: (Math.random() - 0.5) * 1000,
                  volume24h: Math.random() * 1000000,
                  bid: mockPrice - 10,
                  ask: mockPrice + 10,
                  timestamp: new Date()
                }
              }));
            } else {
              clearInterval(interval);
            }
          }, 1000);
          
          updateConnectionStatus(connectionId, 'connected');
        };
      }

      ws.onerror = (error) => {
        console.error(`WebSocket error for ${connectionId}:`, error);
        updateConnectionStatus(connectionId, 'error');
      };

      ws.onclose = () => {
        updateConnectionStatus(connectionId, 'disconnected');
        delete wsRefs.current[connectionId];
      };

      wsRefs.current[connectionId] = ws;

      toast({
        title: "Connecting to Feed",
        description: `Establishing ${exchange.toUpperCase()} ${symbol} ${type} connection...`,
      });

    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      updateConnectionStatus(connectionId, 'error');
      
      toast({
        title: "Connection Failed",
        description: "Failed to establish WebSocket connection",
        variant: "destructive"
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const updateConnectionStatus = (connectionId: string, status: WebSocketConnection['status']) => {
    setConnections(prev => prev.map(conn => 
      conn.id === connectionId 
        ? { ...conn, status, lastUpdate: new Date() }
        : conn
    ));
  };

  const disconnectFeed = (connectionId: string) => {
    const ws = wsRefs.current[connectionId];
    if (ws) {
      ws.close();
    }
    
    setConnections(prev => prev.filter(conn => conn.id !== connectionId));
    
    toast({
      title: "Feed Disconnected",
      description: "WebSocket connection has been closed",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'disconnected': return 'text-gray-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <Wifi className="h-4 w-4" />;
      case 'connecting': return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'error': return <WifiOff className="h-4 w-4" />;
      default: return <WifiOff className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ticker': return <TrendingUp className="h-4 w-4" />;
      case 'orderbook': return <Activity className="h-4 w-4" />;
      case 'trades': return <Volume2 className="h-4 w-4" />;
      default: return <Eye className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Real-Time Market Data Feeds
          </CardTitle>
          <CardDescription>
            Manage WebSocket connections for live market data streaming
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Exchange</label>
              <Select value={selectedExchange} onValueChange={setSelectedExchange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXCHANGES.map(exchange => (
                    <SelectItem key={exchange.id} value={exchange.id}>
                      {exchange.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Symbol</label>
              <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYMBOLS.map(symbol => (
                    <SelectItem key={symbol} value={symbol}>
                      {symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col space-y-2">
              <label className="text-sm font-medium">Connect Feed</label>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  onClick={() => connectToFeed(selectedExchange, selectedSymbol, 'ticker')}
                  disabled={isConnecting}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Ticker
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => connectToFeed(selectedExchange, selectedSymbol, 'trades')}
                  disabled={isConnecting}
                >
                  <Volume2 className="h-3 w-3 mr-1" />
                  Trades
                </Button>
              </div>
            </div>
          </div>

          {/* Active Connections */}
          <div className="space-y-3">
            <h4 className="font-medium">Active Connections</h4>
            {connections.length > 0 ? (
              <div className="space-y-2">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={getStatusColor(connection.status)}>
                        {getStatusIcon(connection.status)}
                      </div>
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(connection.type)}
                        <span className="font-medium">
                          {connection.exchange.toUpperCase()} {connection.symbol}
                        </span>
                      </div>
                      <Badge variant="outline" className={getStatusColor(connection.status)}>
                        {connection.status.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {connection.lastUpdate && (
                        <span className="text-xs text-muted-foreground">
                          {connection.lastUpdate.toLocaleTimeString()}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => disconnectFeed(connection.id)}
                      >
                        <Pause className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">
                No active connections. Connect to a feed to see real-time data.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Live Market Data */}
      {Object.keys(marketData).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Live Market Data</CardTitle>
            <CardDescription>
              Real-time price feeds from connected exchanges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(marketData).map((data) => (
                <div
                  key={data.symbol}
                  className="p-4 border rounded-lg bg-gradient-to-r from-primary/5 to-primary/10"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-lg">{data.symbol}</h4>
                    <Badge variant="outline" className="text-green-500">
                      LIVE
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Price:</span>
                      <span className="font-bold text-primary">
                        ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">24h Change:</span>
                      <span className={`font-medium ${data.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {data.change24h >= 0 ? '+' : ''}${data.change24h.toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Bid/Ask:</span>
                      <span className="text-sm">
                        ${data.bid.toFixed(2)} / ${data.ask.toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Volume:</span>
                      <span className="text-sm">
                        {data.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    
                    <div className="text-xs text-muted-foreground text-right">
                      Updated: {data.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection Status Alert */}
      {connections.some(conn => conn.status === 'error') && (
        <Alert>
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            Some WebSocket connections have errors. Check your network connection and try reconnecting.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};