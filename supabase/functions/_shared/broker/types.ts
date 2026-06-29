// =============================================================================
// Broker Abstraction Layer — Domain Types
//
// All types are broker-independent. No Kraken, Coinbase, or Alpaca concepts
// leak into these definitions. Every broker adapter maps its native types
// to and from these.
// =============================================================================

// ---------------------------------------------------------------------------
// Asset Classes & Symbols
// ---------------------------------------------------------------------------

export type AssetClass =
  | 'crypto'
  | 'stock'
  | 'etf'
  | 'forex'
  | 'option'
  | 'future'
  | 'metal';

export interface AssetInfo {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  baseCurrency: string;
  quoteCurrency: string;
  minQuantity: number;
  maxQuantity: number;
  quantityStep: number;
  minPrice: number;
  priceStep: number;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export type OrderSide = 'buy' | 'sell';

export type OrderType = 'market' | 'limit' | 'stop_loss' | 'take_profit' | 'stop_limit';

export type OrderStatus =
  | 'pending'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'expired'
  | 'rejected'
  | 'failed';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'DAY';

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: TimeInForce;
  clientOrderId?: string;
}

export interface Order {
  id: string;
  brokerOrderId: string;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: number;
  filledQuantity: number;
  price?: number;
  stopPrice?: number;
  averageFillPrice?: number;
  fee: number;
  feeCurrency: string;
  timeInForce: TimeInForce;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export type PositionSide = 'long' | 'short';

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openedAt: string;
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export interface Balance {
  currency: string;
  total: number;
  available: number;
  locked: number;
}

export interface AccountBalances {
  balances: Balance[];
  totalEquityUsd: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Market Data
// ---------------------------------------------------------------------------

export interface Ticker {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: string;
}

export interface OHLCV {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Trade History
// ---------------------------------------------------------------------------

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  fee: number;
  feeCurrency: string;
  realizedPnl: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Fee Estimation
// ---------------------------------------------------------------------------

export interface FeeEstimate {
  makerFee: number;
  takerFee: number;
  estimatedFee: number;
  feeCurrency: string;
}

// ---------------------------------------------------------------------------
// Broker Health
// ---------------------------------------------------------------------------

export type BrokerHealthStatus = 'healthy' | 'degraded' | 'down' | 'maintenance';

export interface BrokerHealth {
  status: BrokerHealthStatus;
  latencyMs: number;
  rateLimitRemaining: number;
  rateLimitTotal: number;
  maintenanceWindow?: { start: string; end: string };
  message?: string;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Broker Capabilities
// ---------------------------------------------------------------------------

export interface BrokerCapabilities {
  brokerId: string;
  name: string;
  supportedAssetClasses: AssetClass[];
  supportedOrderTypes: OrderType[];
  supportsPaperTrading: boolean;
  supportsWebSocket: boolean;
  supportsStopLoss: boolean;
  supportsTakeProfit: boolean;
  supportsMarginTrading: boolean;
  maxOrdersPerSecond: number;
  supportedCurrencies: string[];
}

// ---------------------------------------------------------------------------
// Broker Credentials
// ---------------------------------------------------------------------------

export interface BrokerCredentials {
  brokerId: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  sandbox?: boolean;
}

// ---------------------------------------------------------------------------
// Adapter Result Wrapper
// ---------------------------------------------------------------------------

export interface BrokerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  brokerError?: string;
  retryable?: boolean;
}
