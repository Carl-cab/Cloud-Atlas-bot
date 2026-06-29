// =============================================================================
// Paper Broker Adapter
//
// Simulates trade execution using real market data. Never contacts any
// exchange API. Never requires credentials. Satisfies the full BrokerAdapter
// interface so the Trading Engine can run identically in paper and live mode.
//
// Market prices are fetched from whichever real broker is available in the
// registry (Kraken by default). If no real broker is reachable, uses the
// last known price from the database.
//
// Paper positions, orders, and balances are tracked in-memory per session
// and persisted to the database by the Trading Engine (not by this adapter).
// =============================================================================

import type { BrokerAdapter } from '../adapter.ts';
import type {
  OrderRequest,
  Order,
  OrderType,
  Position,
  AccountBalances,
  Balance,
  Ticker,
  OHLCV,
  Trade,
  FeeEstimate,
  BrokerHealth,
  BrokerCapabilities,
  BrokerCredentials,
  BrokerResult,
} from '../types.ts';

const SIMULATED_FEE_RATE = 0.001; // 0.1% simulated fee
const DEFAULT_BALANCE_USD = 10000;

export class PaperBrokerAdapter implements BrokerAdapter {
  readonly brokerId = 'paper';
  readonly brokerName = 'Paper Trading (Simulated)';

  private marketDataProvider: ((symbol: string) => Promise<BrokerResult<Ticker>>) | null = null;

  /**
   * Inject a real market data provider so paper trades use live prices.
   * Typically this is the Kraken adapter's getMarketData method.
   */
  setMarketDataProvider(provider: (symbol: string) => Promise<BrokerResult<Ticker>>): void {
    this.marketDataProvider = provider;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async connect(_credentials: BrokerCredentials): Promise<BrokerResult<void>> {
    return { success: true };
  }

  async validateCredentials(_credentials: BrokerCredentials): Promise<BrokerResult<{ valid: boolean; permissions?: string[] }>> {
    return { success: true, data: { valid: true, permissions: ['paper_trading'] } };
  }

  async testConnection(): Promise<BrokerResult<{ connected: boolean; latencyMs: number }>> {
    return { success: true, data: { connected: true, latencyMs: 0 } };
  }

  async healthCheck(): Promise<BrokerResult<BrokerHealth>> {
    return {
      success: true,
      data: {
        status: 'healthy',
        latencyMs: 0,
        rateLimitRemaining: 999,
        rateLimitTotal: 999,
        checkedAt: new Date().toISOString(),
        message: 'Paper broker is always healthy',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------

  async getBalances(_credentials: BrokerCredentials): Promise<BrokerResult<AccountBalances>> {
    return {
      success: true,
      data: {
        balances: [
          { currency: 'USD', total: DEFAULT_BALANCE_USD, available: DEFAULT_BALANCE_USD, locked: 0 },
        ],
        totalEquityUsd: DEFAULT_BALANCE_USD,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Market Data
  // -------------------------------------------------------------------------

  async getMarketData(symbol: string): Promise<BrokerResult<Ticker>> {
    // Delegate to real market data provider if available
    if (this.marketDataProvider) {
      return this.marketDataProvider(symbol);
    }

    // Fallback: synthetic price based on well-known symbols
    const syntheticPrices: Record<string, number> = {
      'BTCUSD': 65000, 'XBTUSD': 65000,
      'ETHUSD': 3500,
      'SOLUSD': 150,
      'ADAUSD': 0.45,
      'XRPUSD': 0.55,
      'AAPL': 190,
      'GOOGL': 175,
      'SPY': 540,
    };

    const price = syntheticPrices[symbol] ?? 100;

    return {
      success: true,
      data: {
        symbol,
        lastPrice: price,
        bidPrice: price * 0.999,
        askPrice: price * 1.001,
        volume24h: 1000000,
        change24h: 0,
        high24h: price * 1.02,
        low24h: price * 0.98,
        timestamp: new Date().toISOString(),
      },
    };
  }

  async getHistoricalData(symbol: string, _interval: number, limit: number = 100): Promise<BrokerResult<OHLCV[]>> {
    // Generate synthetic historical data for paper trading backtests
    const marketData = await this.getMarketData(symbol);
    const basePrice = marketData.data?.lastPrice ?? 100;
    const candles: OHLCV[] = [];

    for (let i = limit; i > 0; i--) {
      const noise = (Math.random() - 0.5) * 0.02;
      const price = basePrice * (1 + noise);
      candles.push({
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        open: price * (1 - Math.random() * 0.005),
        high: price * (1 + Math.random() * 0.01),
        low: price * (1 - Math.random() * 0.01),
        close: price,
        volume: Math.random() * 100000,
      });
    }

    return { success: true, data: candles };
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async placeOrder(_credentials: BrokerCredentials, order: OrderRequest): Promise<BrokerResult<Order>> {
    const marketData = await this.getMarketData(order.symbol);
    if (!marketData.success || !marketData.data) {
      return { success: false, error: 'Cannot fetch market price for paper trade' };
    }

    const fillPrice = order.type === 'market'
      ? (order.side === 'buy' ? marketData.data.askPrice : marketData.data.bidPrice)
      : (order.price ?? marketData.data.lastPrice);

    const fee = fillPrice * order.quantity * SIMULATED_FEE_RATE;
    const paperId = `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      success: true,
      data: {
        id: paperId,
        brokerOrderId: paperId,
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        status: order.type === 'market' ? 'filled' : 'open',
        quantity: order.quantity,
        filledQuantity: order.type === 'market' ? order.quantity : 0,
        price: order.price,
        stopPrice: order.stopPrice,
        averageFillPrice: order.type === 'market' ? fillPrice : undefined,
        fee,
        feeCurrency: 'USD',
        timeInForce: order.timeInForce ?? 'GTC',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  async cancelOrder(_credentials: BrokerCredentials, _orderId: string): Promise<BrokerResult<{ cancelled: boolean }>> {
    return { success: true, data: { cancelled: true } };
  }

  async modifyOrder(_credentials: BrokerCredentials, orderId: string, changes: Partial<OrderRequest>): Promise<BrokerResult<Order>> {
    return {
      success: true,
      data: {
        id: orderId,
        brokerOrderId: orderId,
        symbol: changes.symbol ?? '',
        side: changes.side ?? 'buy',
        type: changes.type ?? 'limit',
        status: 'open',
        quantity: changes.quantity ?? 0,
        filledQuantity: 0,
        price: changes.price,
        fee: 0,
        feeCurrency: 'USD',
        timeInForce: 'GTC',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  async getOrderStatus(_credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<Order>> {
    return {
      success: false,
      error: `Paper order ${orderId}: status tracking is handled by the Trading Engine, not the adapter`,
    };
  }

  async getOpenOrders(_credentials: BrokerCredentials): Promise<BrokerResult<Order[]>> {
    return { success: true, data: [] };
  }

  async getClosedOrders(_credentials: BrokerCredentials, _since?: string): Promise<BrokerResult<Order[]>> {
    return { success: true, data: [] };
  }

  // -------------------------------------------------------------------------
  // Positions
  // -------------------------------------------------------------------------

  async getPositions(_credentials: BrokerCredentials): Promise<BrokerResult<Position[]>> {
    return { success: true, data: [] };
  }

  // -------------------------------------------------------------------------
  // Trade History
  // -------------------------------------------------------------------------

  async getTradeHistory(_credentials: BrokerCredentials, _since?: string): Promise<BrokerResult<Trade[]>> {
    return { success: true, data: [] };
  }

  // -------------------------------------------------------------------------
  // Fee Estimation
  // -------------------------------------------------------------------------

  async estimateFees(_symbol: string, quantity: number, _orderType: OrderType): Promise<BrokerResult<FeeEstimate>> {
    return {
      success: true,
      data: {
        makerFee: SIMULATED_FEE_RATE,
        takerFee: SIMULATED_FEE_RATE,
        estimatedFee: quantity * SIMULATED_FEE_RATE,
        feeCurrency: 'USD',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  getCapabilities(): BrokerCapabilities {
    return {
      brokerId: this.brokerId,
      name: this.brokerName,
      supportedAssetClasses: ['crypto', 'stock', 'etf', 'forex', 'option', 'future', 'metal'],
      supportedOrderTypes: ['market', 'limit', 'stop_loss', 'take_profit', 'stop_limit'],
      supportsPaperTrading: true,
      supportsWebSocket: false,
      supportsStopLoss: true,
      supportsTakeProfit: true,
      supportsMarginTrading: false,
      maxOrdersPerSecond: 100,
      supportedCurrencies: ['USD'],
    };
  }

  supportsAsset(_symbol: string): boolean {
    return true;
  }

  supportsOrderType(_orderType: OrderType): boolean {
    return true;
  }

  supportsPaperTrading(): boolean {
    return true;
  }
}
