// =============================================================================
// Kraken Broker Adapter
//
// Implements BrokerAdapter for Kraken exchange. All Kraken-specific logic
// (API signing, symbol mapping, balance key translation) is contained here.
//
// The Trading Engine never sees ZUSD, XXBT, or api.kraken.com.
// =============================================================================

import type { BrokerAdapter } from '../adapter.ts';
import type {
  OrderRequest,
  Order,
  OrderType,
  OrderStatus,
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

// ---------------------------------------------------------------------------
// Kraken-specific helpers (private to this module)
// ---------------------------------------------------------------------------

const KRAKEN_API_BASE = 'https://api.kraken.com';

const SYMBOL_TO_KRAKEN: Record<string, string> = {
  'BTCUSD': 'XBTUSD',
  'ETHUSD': 'ETHUSD',
  'ADAUSD': 'ADAUSD',
  'SOLUSD': 'SOLUSD',
  'XRPUSD': 'XRPUSD',
  'DOTUSD': 'DOTUSD',
  'LINKUSD': 'LINKUSD',
  'MATICUSD': 'MATICUSD',
};

const KRAKEN_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_KRAKEN).map(([k, v]) => [v, k])
);

const KRAKEN_ASSET_TO_CURRENCY: Record<string, string> = {
  'ZUSD': 'USD',
  'ZCAD': 'CAD',
  'ZEUR': 'EUR',
  'ZGBP': 'GBP',
  'XXBT': 'BTC',
  'XETH': 'ETH',
  'ADA': 'ADA',
  'SOL': 'SOL',
  'XRP': 'XRP',
  'DOT': 'DOT',
  'LINK': 'LINK',
};

const ORDER_TYPE_TO_KRAKEN: Record<OrderType, string> = {
  'market': 'market',
  'limit': 'limit',
  'stop_loss': 'stop-loss',
  'take_profit': 'take-profit',
  'stop_limit': 'stop-loss-limit',
};

function mapKrakenOrderStatus(krakenStatus: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    'pending': 'pending',
    'open': 'open',
    'closed': 'filled',
    'canceled': 'cancelled',
    'expired': 'expired',
  };
  return map[krakenStatus] ?? 'pending';
}

async function sha256(message: string): Promise<Uint8Array> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return new Uint8Array(buffer);
}

async function hmacSha512(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(sig);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function signKrakenRequest(
  path: string,
  nonce: string,
  postData: string,
  privateKey: string
): Promise<string> {
  const hash = await sha256(nonce + postData);
  const pathBytes = new TextEncoder().encode(path);
  const message = new Uint8Array(pathBytes.length + hash.length);
  message.set(pathBytes);
  message.set(hash, pathBytes.length);

  const keyBytes = base64ToBytes(privateKey);
  const signature = await hmacSha512(keyBytes, message);
  return bytesToBase64(signature);
}

// ---------------------------------------------------------------------------
// Kraken Broker Adapter
// ---------------------------------------------------------------------------

export class KrakenBrokerAdapter implements BrokerAdapter {
  readonly brokerId = 'kraken';
  readonly brokerName = 'Kraken';

  // -------------------------------------------------------------------------
  // Private API request helper
  // -------------------------------------------------------------------------
  private async privateRequest(
    endpoint: string,
    params: Record<string, string>,
    credentials: BrokerCredentials
  ): Promise<Record<string, unknown>> {
    const path = `/0/private/${endpoint}`;
    const nonce = Date.now().toString();
    const postData = new URLSearchParams({ nonce, ...params }).toString();

    const signature = await signKrakenRequest(path, nonce, postData, credentials.apiSecret);

    const response = await fetch(`${KRAKEN_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'API-Key': credentials.apiKey,
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
    });

    return await response.json();
  }

  private checkKrakenErrors(result: Record<string, unknown>): string | null {
    const errors = result.error as string[] | undefined;
    if (errors && Array.isArray(errors) && errors.length > 0) {
      return errors.join(', ');
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async connect(credentials: BrokerCredentials): Promise<BrokerResult<void>> {
    const validation = await this.validateCredentials(credentials);
    if (!validation.success || !validation.data?.valid) {
      return { success: false, error: 'Invalid Kraken credentials', brokerError: validation.error };
    }
    return { success: true };
  }

  async validateCredentials(credentials: BrokerCredentials): Promise<BrokerResult<{ valid: boolean; permissions?: string[] }>> {
    try {
      const result = await this.privateRequest('Balance', {}, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) {
        return { success: true, data: { valid: false }, brokerError: error };
      }
      return { success: true, data: { valid: true } };
    } catch (e) {
      return { success: false, error: `Credential validation failed: ${e.message}` };
    }
  }

  async testConnection(): Promise<BrokerResult<{ connected: boolean; latencyMs: number }>> {
    const start = Date.now();
    try {
      const resp = await fetch(`${KRAKEN_API_BASE}/0/public/SystemStatus`);
      const data = await resp.json();
      const latencyMs = Date.now() - start;
      const status = data.result?.status;
      return {
        success: true,
        data: { connected: status === 'online', latencyMs },
      };
    } catch (e) {
      return { success: false, error: e.message, data: { connected: false, latencyMs: Date.now() - start } };
    }
  }

  async healthCheck(): Promise<BrokerResult<BrokerHealth>> {
    const conn = await this.testConnection();
    if (!conn.success || !conn.data) {
      return {
        success: true,
        data: {
          status: 'down',
          latencyMs: conn.data?.latencyMs ?? -1,
          rateLimitRemaining: 0,
          rateLimitTotal: 15,
          checkedAt: new Date().toISOString(),
          message: conn.error,
        },
      };
    }

    return {
      success: true,
      data: {
        status: conn.data.connected ? 'healthy' : 'down',
        latencyMs: conn.data.latencyMs,
        rateLimitRemaining: 15,
        rateLimitTotal: 15,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------

  async getBalances(credentials: BrokerCredentials): Promise<BrokerResult<AccountBalances>> {
    try {
      const result = await this.privateRequest('Balance', {}, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) return { success: false, error, brokerError: error };

      const raw = (result.result ?? {}) as Record<string, string>;
      const balances: Balance[] = [];
      let totalEquityUsd = 0;

      for (const [krakenAsset, amount] of Object.entries(raw)) {
        const total = parseFloat(amount);
        if (total === 0) continue;

        const currency = KRAKEN_ASSET_TO_CURRENCY[krakenAsset] ?? krakenAsset;
        balances.push({
          currency,
          total,
          available: total,
          locked: 0,
        });

        if (currency === 'USD') totalEquityUsd += total;
        if (currency === 'CAD') totalEquityUsd += total * 0.73;
      }

      return {
        success: true,
        data: {
          balances,
          totalEquityUsd,
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // -------------------------------------------------------------------------
  // Market Data
  // -------------------------------------------------------------------------

  async getMarketData(symbol: string): Promise<BrokerResult<Ticker>> {
    try {
      const krakenPair = SYMBOL_TO_KRAKEN[symbol] ?? symbol;
      const resp = await fetch(`${KRAKEN_API_BASE}/0/public/Ticker?pair=${krakenPair}`);
      const data = await resp.json();

      const error = this.checkKrakenErrors(data);
      if (error) return { success: false, error, brokerError: error };

      const pairKey = Object.keys(data.result ?? {})[0];
      if (!pairKey) return { success: false, error: 'No ticker data returned' };

      const t = data.result[pairKey];
      return {
        success: true,
        data: {
          symbol,
          lastPrice: parseFloat(t.c[0]),
          bidPrice: parseFloat(t.b[0]),
          askPrice: parseFloat(t.a[0]),
          volume24h: parseFloat(t.v[1]),
          change24h: 0,
          high24h: parseFloat(t.h[1]),
          low24h: parseFloat(t.l[1]),
          timestamp: new Date().toISOString(),
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getHistoricalData(symbol: string, interval: number, limit: number = 720): Promise<BrokerResult<OHLCV[]>> {
    try {
      const krakenPair = SYMBOL_TO_KRAKEN[symbol] ?? symbol;
      const resp = await fetch(`${KRAKEN_API_BASE}/0/public/OHLC?pair=${krakenPair}&interval=${interval}`);
      const data = await resp.json();

      const error = this.checkKrakenErrors(data);
      if (error) return { success: false, error, brokerError: error };

      const pairKey = Object.keys(data.result ?? {}).find(k => k !== 'last');
      if (!pairKey) return { success: false, error: 'No OHLC data returned' };

      const candles: OHLCV[] = (data.result[pairKey] as any[]).slice(-limit).map((c: any) => ({
        timestamp: new Date(c[0] * 1000).toISOString(),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[6]),
      }));

      return { success: true, data: candles };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  async placeOrder(credentials: BrokerCredentials, order: OrderRequest): Promise<BrokerResult<Order>> {
    try {
      const krakenPair = SYMBOL_TO_KRAKEN[order.symbol] ?? order.symbol;
      const krakenOrderType = ORDER_TYPE_TO_KRAKEN[order.type] ?? order.type;

      const params: Record<string, string> = {
        pair: krakenPair,
        type: order.side,
        ordertype: krakenOrderType,
        volume: order.quantity.toString(),
      };

      if (order.price != null) params.price = order.price.toString();
      if (order.stopPrice != null) params.price2 = order.stopPrice.toString();
      if (order.timeInForce) params.timeinforce = order.timeInForce;
      if (order.clientOrderId) {
        params.userref = parseInt(order.clientOrderId.replace(/-/g, '').substring(0, 8), 16).toString();
      }

      const result = await this.privateRequest('AddOrder', params, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) {
        return { success: false, error: `Order rejected: ${error}`, brokerError: error };
      }

      const txid = ((result.result as any)?.txid ?? [])[0] ?? '';
      const descr = (result.result as any)?.descr ?? {};

      return {
        success: true,
        data: {
          id: txid,
          brokerOrderId: txid,
          clientOrderId: order.clientOrderId,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          status: 'pending',
          quantity: order.quantity,
          filledQuantity: 0,
          price: order.price,
          stopPrice: order.stopPrice,
          fee: 0,
          feeCurrency: 'USD',
          timeInForce: order.timeInForce ?? 'GTC',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async cancelOrder(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<{ cancelled: boolean }>> {
    try {
      const result = await this.privateRequest('CancelOrder', { txid: orderId }, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) return { success: false, error, brokerError: error };
      return { success: true, data: { cancelled: true } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async modifyOrder(_credentials: BrokerCredentials, _orderId: string, _changes: Partial<OrderRequest>): Promise<BrokerResult<Order>> {
    return { success: false, error: 'Kraken does not support order modification. Cancel and re-place.' };
  }

  async getOrderStatus(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<Order>> {
    try {
      const result = await this.privateRequest('QueryOrders', { txid: orderId }, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) return { success: false, error, brokerError: error };

      const orderData = (result.result as Record<string, any>)?.[orderId];
      if (!orderData) return { success: false, error: 'Order not found' };

      return {
        success: true,
        data: this.mapKrakenOrder(orderId, orderData),
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getOpenOrders(credentials: BrokerCredentials): Promise<BrokerResult<Order[]>> {
    try {
      const result = await this.privateRequest('OpenOrders', {}, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) return { success: false, error, brokerError: error };

      const open = (result.result as any)?.open ?? {};
      const orders = Object.entries(open).map(([id, data]: [string, any]) => this.mapKrakenOrder(id, data));

      return { success: true, data: orders };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getClosedOrders(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Order[]>> {
    try {
      const params: Record<string, string> = {};
      if (since) params.start = (new Date(since).getTime() / 1000).toString();

      const result = await this.privateRequest('ClosedOrders', params, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) return { success: false, error, brokerError: error };

      const closed = (result.result as any)?.closed ?? {};
      const orders = Object.entries(closed).map(([id, data]: [string, any]) => this.mapKrakenOrder(id, data));

      return { success: true, data: orders };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // -------------------------------------------------------------------------
  // Positions (Kraken returns balances, not positions)
  // -------------------------------------------------------------------------

  async getPositions(_credentials: BrokerCredentials): Promise<BrokerResult<Position[]>> {
    return { success: true, data: [] };
  }

  // -------------------------------------------------------------------------
  // Trade History
  // -------------------------------------------------------------------------

  async getTradeHistory(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Trade[]>> {
    try {
      const params: Record<string, string> = {};
      if (since) params.start = (new Date(since).getTime() / 1000).toString();

      const result = await this.privateRequest('TradesHistory', params, credentials);
      const error = this.checkKrakenErrors(result);
      if (error) return { success: false, error, brokerError: error };

      const trades = (result.result as any)?.trades ?? {};
      const mapped: Trade[] = Object.entries(trades).map(([id, t]: [string, any]) => ({
        id,
        orderId: t.ordertxid ?? '',
        symbol: KRAKEN_TO_SYMBOL[t.pair] ?? t.pair,
        side: t.type as 'buy' | 'sell',
        quantity: parseFloat(t.vol),
        price: parseFloat(t.price),
        fee: parseFloat(t.fee),
        feeCurrency: 'USD',
        realizedPnl: 0,
        timestamp: new Date(t.time * 1000).toISOString(),
      }));

      return { success: true, data: mapped };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // -------------------------------------------------------------------------
  // Fee Estimation
  // -------------------------------------------------------------------------

  async estimateFees(symbol: string, quantity: number, _orderType: OrderType): Promise<BrokerResult<FeeEstimate>> {
    const makerFee = 0.0016;
    const takerFee = 0.0026;
    return {
      success: true,
      data: {
        makerFee,
        takerFee,
        estimatedFee: quantity * takerFee,
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
      supportedAssetClasses: ['crypto'],
      supportedOrderTypes: ['market', 'limit', 'stop_loss', 'take_profit', 'stop_limit'],
      supportsPaperTrading: false,
      supportsWebSocket: true,
      supportsStopLoss: true,
      supportsTakeProfit: true,
      supportsMarginTrading: true,
      maxOrdersPerSecond: 1,
      supportedCurrencies: ['USD', 'CAD', 'EUR', 'GBP'],
    };
  }

  supportsAsset(symbol: string): boolean {
    return symbol in SYMBOL_TO_KRAKEN || Object.values(SYMBOL_TO_KRAKEN).includes(symbol);
  }

  supportsOrderType(orderType: OrderType): boolean {
    return orderType in ORDER_TYPE_TO_KRAKEN;
  }

  supportsPaperTrading(): boolean {
    return false;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private mapKrakenOrder(txid: string, data: any): Order {
    const descr = data.descr ?? {};
    const canonicalSymbol = KRAKEN_TO_SYMBOL[descr.pair] ?? descr.pair ?? '';

    return {
      id: txid,
      brokerOrderId: txid,
      clientOrderId: data.userref?.toString(),
      symbol: canonicalSymbol,
      side: descr.type === 'sell' ? 'sell' : 'buy',
      type: (descr.ordertype === 'limit' ? 'limit' : 'market') as OrderType,
      status: mapKrakenOrderStatus(data.status),
      quantity: parseFloat(data.vol ?? '0'),
      filledQuantity: parseFloat(data.vol_exec ?? '0'),
      price: parseFloat(descr.price ?? '0') || undefined,
      averageFillPrice: parseFloat(data.price ?? '0') || undefined,
      fee: parseFloat(data.fee ?? '0'),
      feeCurrency: 'USD',
      timeInForce: 'GTC',
      createdAt: data.opentm ? new Date(data.opentm * 1000).toISOString() : new Date().toISOString(),
      updatedAt: data.closetm ? new Date(data.closetm * 1000).toISOString() : new Date().toISOString(),
    };
  }
}
