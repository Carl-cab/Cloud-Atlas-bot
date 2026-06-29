// =============================================================================
// Broker Adapter Interface
//
// Every broker (Kraken, Alpaca, Interactive Brokers, Paper, etc.) implements
// this interface. The Trading Engine never knows which broker is behind it.
//
// Rules:
//   - Adapters MUST NOT throw. Return BrokerResult with success=false instead.
//   - Adapters MUST NOT access the database directly. They receive credentials
//     and return results; the engine handles persistence.
//   - Adapters MUST map all broker-specific symbols, errors, and data formats
//     to the canonical types defined in types.ts.
// =============================================================================

import type {
  OrderRequest,
  Order,
  Position,
  AccountBalances,
  Ticker,
  OHLCV,
  Trade,
  FeeEstimate,
  BrokerHealth,
  BrokerCapabilities,
  BrokerCredentials,
  BrokerResult,
  AssetClass,
  OrderType,
} from './types.ts';

export interface BrokerAdapter {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Unique broker identifier (e.g., 'kraken', 'alpaca', 'paper') */
  readonly brokerId: string;

  /** Human-readable broker name */
  readonly brokerName: string;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Initialize the adapter (warm up connections, validate config) */
  connect(credentials: BrokerCredentials): Promise<BrokerResult<void>>;

  /** Validate that credentials are correct and have required permissions */
  validateCredentials(credentials: BrokerCredentials): Promise<BrokerResult<{ valid: boolean; permissions?: string[] }>>;

  /** Quick connectivity test (does not require credentials for public endpoints) */
  testConnection(): Promise<BrokerResult<{ connected: boolean; latencyMs: number }>>;

  /** Broker health check with latency, rate limits, maintenance status */
  healthCheck(): Promise<BrokerResult<BrokerHealth>>;

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------

  /** Get all account balances normalized to the Balance[] format */
  getBalances(credentials: BrokerCredentials): Promise<BrokerResult<AccountBalances>>;

  // ---------------------------------------------------------------------------
  // Market Data (public — no credentials required)
  // ---------------------------------------------------------------------------

  /** Get current ticker for a symbol */
  getMarketData(symbol: string): Promise<BrokerResult<Ticker>>;

  /** Get historical OHLCV candles */
  getHistoricalData(symbol: string, interval: number, limit?: number): Promise<BrokerResult<OHLCV[]>>;

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  /** Submit a new order */
  placeOrder(credentials: BrokerCredentials, order: OrderRequest): Promise<BrokerResult<Order>>;

  /** Cancel an existing order */
  cancelOrder(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<{ cancelled: boolean }>>;

  /** Modify an existing order (not all brokers support this) */
  modifyOrder(credentials: BrokerCredentials, orderId: string, changes: Partial<OrderRequest>): Promise<BrokerResult<Order>>;

  /** Get the current status of a specific order */
  getOrderStatus(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<Order>>;

  /** Get all currently open orders */
  getOpenOrders(credentials: BrokerCredentials): Promise<BrokerResult<Order[]>>;

  /** Get closed/filled order history */
  getClosedOrders(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Order[]>>;

  // ---------------------------------------------------------------------------
  // Positions
  // ---------------------------------------------------------------------------

  /** Get all open positions */
  getPositions(credentials: BrokerCredentials): Promise<BrokerResult<Position[]>>;

  // ---------------------------------------------------------------------------
  // Trade History
  // ---------------------------------------------------------------------------

  /** Get executed trade history */
  getTradeHistory(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Trade[]>>;

  // ---------------------------------------------------------------------------
  // Fee Estimation
  // ---------------------------------------------------------------------------

  /** Estimate fees for a hypothetical order */
  estimateFees(symbol: string, quantity: number, orderType: OrderType): Promise<BrokerResult<FeeEstimate>>;

  // ---------------------------------------------------------------------------
  // Capability Queries
  // ---------------------------------------------------------------------------

  /** Full capability report */
  getCapabilities(): BrokerCapabilities;

  /** Check if a specific symbol is tradeable on this broker */
  supportsAsset(symbol: string): boolean;

  /** Check if a specific order type is supported */
  supportsOrderType(orderType: OrderType): boolean;

  /** Whether this broker supports paper/simulated trading */
  supportsPaperTrading(): boolean;
}
