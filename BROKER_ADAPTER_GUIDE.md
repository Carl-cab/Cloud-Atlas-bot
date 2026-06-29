# Broker Adapter Developer Guide

How to add a new broker to Cloud Atlas Bot. This guide walks through creating a
complete adapter using Alpaca as a running example.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Step-by-Step: Creating a New Adapter](#2-step-by-step-creating-a-new-adapter)
3. [Interface Method Reference](#3-interface-method-reference)
4. [Error Handling Rules](#4-error-handling-rules)
5. [Symbol Mapping Patterns](#5-symbol-mapping-patterns)
6. [Testing Checklist](#6-testing-checklist)
7. [Common Pitfalls](#7-common-pitfalls)

---

## 1. Prerequisites

Before starting, make sure you have:

- **Broker API documentation** -- You need the REST API docs for your target
  broker. Know the auth mechanism (HMAC signing, OAuth, API key header, etc.),
  the endpoint base URL, and any sandbox/paper environment URLs.
- **Test credentials** -- A sandbox or paper-trading API key from the broker.
  Never use production keys during development.
- **Familiarity with the contract files**:
  - `supabase/functions/_shared/broker/adapter.ts` -- The `BrokerAdapter`
    interface your class must implement.
  - `supabase/functions/_shared/broker/types.ts` -- All canonical domain types
    (`Order`, `Position`, `Ticker`, `BrokerResult<T>`, etc.).
  - `supabase/functions/_shared/broker/registry.ts` -- `BrokerRegistry` where
    your adapter gets registered.
  - `supabase/functions/_shared/broker/audit.ts` -- Audit event types emitted
    by the trading engine.
- **Two reference implementations to study**:
  - `supabase/functions/_shared/broker/adapters/kraken.ts` -- Full live adapter
    with API signing, symbol mapping, and error translation.
  - `supabase/functions/_shared/broker/adapters/paper.ts` -- Minimal adapter
    that simulates everything in memory.

---

## 2. Step-by-Step: Creating a New Adapter

### 2.1 Create the adapter file

Create `supabase/functions/_shared/broker/adapters/alpaca.ts`:

```typescript
// =============================================================================
// Alpaca Broker Adapter
//
// Implements BrokerAdapter for Alpaca Markets. All Alpaca-specific logic
// (auth headers, symbol formats, response parsing) is contained here.
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
```

### 2.2 Define broker-specific constants and helpers

Keep all broker-native concepts private to the module. Nothing Alpaca-specific
should leak out through the public interface.

```typescript
const ALPACA_PAPER_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_BASE = 'https://api.alpaca.markets';
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

// Alpaca uses plain symbols (AAPL, BTCUSD) -- less mapping needed than Kraken,
// but you still need a canonical mapping layer for any differences.
const SYMBOL_TO_ALPACA: Record<string, string> = {
  'BTCUSD': 'BTC/USD',
  'ETHUSD': 'ETH/USD',
  'AAPL': 'AAPL',
  'GOOGL': 'GOOGL',
  'SPY': 'SPY',
};

const ALPACA_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_ALPACA).map(([k, v]) => [v, k])
);

function mapAlpacaOrderStatus(alpacaStatus: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    'new': 'open',
    'accepted': 'open',
    'partially_filled': 'partially_filled',
    'filled': 'filled',
    'done_for_day': 'filled',
    'canceled': 'cancelled',
    'expired': 'expired',
    'rejected': 'rejected',
    'pending_new': 'pending',
    'pending_cancel': 'open',
    'pending_replace': 'open',
  };
  return map[alpacaStatus] ?? 'pending';
}

const ORDER_TYPE_TO_ALPACA: Record<OrderType, string> = {
  'market': 'market',
  'limit': 'limit',
  'stop_loss': 'stop',
  'take_profit': 'limit',   // Alpaca uses limit with limit_price
  'stop_limit': 'stop_limit',
};
```

### 2.3 Implement the BrokerAdapter interface

```typescript
export class AlpacaBrokerAdapter implements BrokerAdapter {
  readonly brokerId = 'alpaca';
  readonly brokerName = 'Alpaca Markets';

  // -----------------------------------------------------------------------
  // Private API helper
  // -----------------------------------------------------------------------
  private getBaseUrl(credentials: BrokerCredentials): string {
    return credentials.sandbox ? ALPACA_PAPER_BASE : ALPACA_LIVE_BASE;
  }

  private async apiRequest(
    method: string,
    path: string,
    credentials: BrokerCredentials,
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = `${this.getBaseUrl(credentials)}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'APCA-API-KEY-ID': credentials.apiKey,
        'APCA-API-SECRET-KEY': credentials.apiSecret,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Alpaca API ${response.status}: ${errorBody}`);
    }

    return await response.json();
  }
```

### 2.4 Implement every interface method

Every method returns `Promise<BrokerResult<T>>`. Never throw -- catch all
exceptions and wrap them. Here is the lifecycle group as an example:

```typescript
  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async connect(credentials: BrokerCredentials): Promise<BrokerResult<void>> {
    try {
      const validation = await this.validateCredentials(credentials);
      if (!validation.success || !validation.data?.valid) {
        return {
          success: false,
          error: 'Invalid Alpaca credentials',
          brokerError: validation.error,
        };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async validateCredentials(
    credentials: BrokerCredentials
  ): Promise<BrokerResult<{ valid: boolean; permissions?: string[] }>> {
    try {
      const account = await this.apiRequest('GET', '/v2/account', credentials);
      return {
        success: true,
        data: {
          valid: (account as any).status === 'ACTIVE',
          permissions: ['trading', 'data'],
        },
      };
    } catch (e) {
      return { success: false, error: `Credential validation failed: ${e.message}` };
    }
  }

  async testConnection(): Promise<BrokerResult<{ connected: boolean; latencyMs: number }>> {
    const start = Date.now();
    try {
      const resp = await fetch(`${ALPACA_PAPER_BASE}/v2/clock`, {
        headers: { 'APCA-API-KEY-ID': '', 'APCA-API-SECRET-KEY': '' },
      });
      const latencyMs = Date.now() - start;
      return {
        success: true,
        data: { connected: resp.status !== 0, latencyMs },
      };
    } catch (e) {
      return {
        success: false,
        error: e.message,
        data: { connected: false, latencyMs: Date.now() - start },
      };
    }
  }

  async healthCheck(): Promise<BrokerResult<BrokerHealth>> {
    const conn = await this.testConnection();
    return {
      success: true,
      data: {
        status: conn.data?.connected ? 'healthy' : 'down',
        latencyMs: conn.data?.latencyMs ?? -1,
        rateLimitRemaining: 200,
        rateLimitTotal: 200,
        checkedAt: new Date().toISOString(),
        message: conn.error,
      },
    };
  }
```

Then continue with account, market data, orders, positions, trades, fees,
and capabilities. See the full method reference in Section 3 below.

### 2.5 Implement getCapabilities and the supports* methods

```typescript
  getCapabilities(): BrokerCapabilities {
    return {
      brokerId: this.brokerId,
      name: this.brokerName,
      supportedAssetClasses: ['stock', 'etf', 'crypto'],
      supportedOrderTypes: ['market', 'limit', 'stop_loss', 'stop_limit'],
      supportsPaperTrading: true,
      supportsWebSocket: true,
      supportsStopLoss: true,
      supportsTakeProfit: false,
      supportsMarginTrading: true,
      maxOrdersPerSecond: 10,
      supportedCurrencies: ['USD'],
    };
  }

  supportsAsset(symbol: string): boolean {
    return symbol in SYMBOL_TO_ALPACA;
  }

  supportsOrderType(orderType: OrderType): boolean {
    return orderType in ORDER_TYPE_TO_ALPACA;
  }

  supportsPaperTrading(): boolean {
    return true;
  }
}
```

### 2.6 Register with BrokerRegistry

In the startup code of the edge function that uses brokers (e.g.,
`trading-bot/index.ts`), register your adapter:

```typescript
import { brokerRegistry } from '../_shared/broker/mod.ts';
import { AlpacaBrokerAdapter } from '../_shared/broker/adapters/alpaca.ts';

// Register adapters (lower priority number = preferred)
brokerRegistry.register(new AlpacaBrokerAdapter(), 50);
```

The registry's `select()` method will then consider your adapter when matching
by asset class, symbol, or user preference.

### 2.7 Add to mod.ts barrel export

Edit `supabase/functions/_shared/broker/mod.ts` and add:

```typescript
// Built-in adapters
export { KrakenBrokerAdapter } from './adapters/kraken.ts';
export { PaperBrokerAdapter } from './adapters/paper.ts';
export { AlpacaBrokerAdapter } from './adapters/alpaca.ts';  // <-- add this
```

---

## 3. Interface Method Reference

Every method on `BrokerAdapter` is listed below with its signature, purpose,
and return expectations.

### Identity (readonly properties)

| Property       | Type     | Description                                      |
|----------------|----------|--------------------------------------------------|
| `brokerId`     | `string` | Unique key (e.g., `'alpaca'`). Used in registry. |
| `brokerName`   | `string` | Human-readable name for UI display.              |

### Lifecycle

#### `connect(credentials: BrokerCredentials): Promise<BrokerResult<void>>`

Initialize the adapter. Validate credentials and warm up connections. Called
once before the adapter is used for trading.

- Return `{ success: true }` if ready.
- Return `{ success: false, error: '...' }` if credentials are invalid or the
  broker is unreachable.

#### `validateCredentials(credentials: BrokerCredentials): Promise<BrokerResult<{ valid: boolean; permissions?: string[] }>>`

Check whether the API keys are correct and have the required permissions.
This is called independently of `connect()` -- for example, when a user first
enters their keys in the UI.

- `data.valid` must be `true` only if the keys actually authenticated.
- `data.permissions` is optional; include it if the broker API reports
  permission scopes.

#### `testConnection(): Promise<BrokerResult<{ connected: boolean; latencyMs: number }>>`

Quick connectivity check using a public endpoint (no credentials needed).
Used for uptime monitoring.

#### `healthCheck(): Promise<BrokerResult<BrokerHealth>>`

Full health report. The returned `BrokerHealth` object includes:

```typescript
{
  status: 'healthy' | 'degraded' | 'down' | 'maintenance',
  latencyMs: number,
  rateLimitRemaining: number,
  rateLimitTotal: number,
  maintenanceWindow?: { start: string; end: string },
  message?: string,
  checkedAt: string,  // ISO 8601
}
```

### Account

#### `getBalances(credentials: BrokerCredentials): Promise<BrokerResult<AccountBalances>>`

Return all account balances. Map broker-native asset names to canonical
currency codes (e.g., Kraken's `ZUSD` becomes `USD`, `XXBT` becomes `BTC`).

The returned `AccountBalances` must include:
- `balances`: Array of `Balance` objects (`{ currency, total, available, locked }`)
- `totalEquityUsd`: Total account value in USD
- `updatedAt`: ISO 8601 timestamp

### Market Data (public -- no credentials required)

#### `getMarketData(symbol: string): Promise<BrokerResult<Ticker>>`

Get the current ticker for a canonical symbol. Map the symbol to the broker's
format internally, then map the response back.

The returned `Ticker` must include: `symbol` (canonical), `lastPrice`,
`bidPrice`, `askPrice`, `volume24h`, `change24h`, `high24h`, `low24h`,
`timestamp`.

#### `getHistoricalData(symbol: string, interval: number, limit?: number): Promise<BrokerResult<OHLCV[]>>`

Return historical candles. `interval` is in minutes. Each `OHLCV` entry:
`{ timestamp, open, high, low, close, volume }`.

### Orders

#### `placeOrder(credentials: BrokerCredentials, order: OrderRequest): Promise<BrokerResult<Order>>`

Submit an order. The `OrderRequest` contains: `symbol`, `side`, `type`,
`quantity`, `price?`, `stopPrice?`, `timeInForce?`, `clientOrderId?`.

Map the canonical order type to the broker's native type. Return a full `Order`
object with all fields populated. Fields you do not yet know (like
`averageFillPrice` for a pending limit order) should be `undefined`.

The returned `Order` must include at minimum: `id`, `brokerOrderId`, `symbol`,
`side`, `type`, `status`, `quantity`, `filledQuantity`, `fee`, `feeCurrency`,
`timeInForce`, `createdAt`, `updatedAt`.

#### `cancelOrder(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<{ cancelled: boolean }>>`

Cancel an open order by its broker order ID.

#### `modifyOrder(credentials: BrokerCredentials, orderId: string, changes: Partial<OrderRequest>): Promise<BrokerResult<Order>>`

Modify an existing order. If the broker does not support modification, return:

```typescript
{ success: false, error: 'Broker does not support order modification. Cancel and re-place.' }
```

#### `getOrderStatus(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<Order>>`

Fetch the current state of a single order.

#### `getOpenOrders(credentials: BrokerCredentials): Promise<BrokerResult<Order[]>>`

Return all currently open (unfilled) orders.

#### `getClosedOrders(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Order[]>>`

Return filled/cancelled/expired orders. `since` is an ISO 8601 timestamp
filter.

### Positions

#### `getPositions(credentials: BrokerCredentials): Promise<BrokerResult<Position[]>>`

Return all open positions. Each `Position` includes: `id`, `symbol`, `side`
(`'long'` or `'short'`), `quantity`, `averageEntryPrice`, `currentPrice`,
`unrealizedPnl`, `realizedPnl`, `openedAt`.

If the broker does not have a native position concept (like Kraken spot),
return `{ success: true, data: [] }`.

### Trade History

#### `getTradeHistory(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Trade[]>>`

Return executed fills. Each `Trade`: `id`, `orderId`, `symbol`, `side`,
`quantity`, `price`, `fee`, `feeCurrency`, `realizedPnl`, `timestamp`.

### Fee Estimation

#### `estimateFees(symbol: string, quantity: number, orderType: OrderType): Promise<BrokerResult<FeeEstimate>>`

Estimate trading fees. Return: `makerFee` (rate), `takerFee` (rate),
`estimatedFee` (absolute amount for this quantity), `feeCurrency`.

### Capability Queries

#### `getCapabilities(): BrokerCapabilities`

Synchronous. Return a static capabilities object. This is called during
registration and cached by the registry.

#### `supportsAsset(symbol: string): boolean`

Return `true` if the given canonical symbol can be traded on this broker.

#### `supportsOrderType(orderType: OrderType): boolean`

Return `true` if the order type is supported.

#### `supportsPaperTrading(): boolean`

Return `true` if this broker has a sandbox/paper trading mode.

---

## 4. Error Handling Rules

### The BrokerResult pattern

Every adapter method returns `BrokerResult<T>`:

```typescript
interface BrokerResult<T> {
  success: boolean;
  data?: T;          // Present when success=true
  error?: string;    // Human-readable error (for logs/UI)
  brokerError?: string;  // Raw broker error string (for debugging)
  retryable?: boolean;   // Hint to the engine: safe to retry?
}
```

### Rules

1. **Never throw exceptions from any adapter method.** Wrap every method body
   in try/catch and return `{ success: false, error: e.message }`.

   ```typescript
   // WRONG -- this breaks the contract
   async getBalances(credentials: BrokerCredentials): Promise<BrokerResult<AccountBalances>> {
     const result = await this.apiRequest('GET', '/v2/account', credentials);
     return { success: true, data: this.mapBalances(result) };
   }

   // CORRECT
   async getBalances(credentials: BrokerCredentials): Promise<BrokerResult<AccountBalances>> {
     try {
       const result = await this.apiRequest('GET', '/v2/account', credentials);
       return { success: true, data: this.mapBalances(result) };
     } catch (e) {
       return { success: false, error: e.message };
     }
   }
   ```

2. **Separate the human error from the broker error.** The `error` field should
   contain a message the trading engine can log or show to users. The
   `brokerError` field preserves the raw error string from the broker's API
   response for debugging.

   ```typescript
   return {
     success: false,
     error: 'Order rejected: insufficient buying power',
     brokerError: '403: buying_power 0.00 is not sufficient for 1.5 shares of AAPL',
     retryable: false,
   };
   ```

3. **Set `retryable` when you can determine it.** Network timeouts and rate
   limits are retryable. Authentication failures and insufficient funds are not.

   ```typescript
   // Rate limited -- retryable
   if (response.status === 429) {
     return {
       success: false,
       error: 'Rate limited by broker',
       brokerError: `429: ${await response.text()}`,
       retryable: true,
     };
   }

   // Auth failure -- not retryable
   if (response.status === 401 || response.status === 403) {
     return {
       success: false,
       error: 'Authentication failed',
       brokerError: `${response.status}: ${await response.text()}`,
       retryable: false,
     };
   }
   ```

4. **On success, always include `data`.** Even for void-returning methods, the
   pattern is `{ success: true }` (data is omitted, not set to `null`).

---

## 5. Symbol Mapping Patterns

Every broker uses different symbol formats. Your adapter must translate between
the canonical format used by the trading engine and the broker's native format.

### Canonical symbol format (used by the engine)

- Crypto: `BTCUSD`, `ETHUSD`, `SOLUSD` (base + quote, no separator)
- Stocks: `AAPL`, `GOOGL`, `SPY` (ticker symbol)
- Forex: `EURUSD`, `GBPJPY` (base + quote, no separator)

### How Kraken does it

Kraken uses non-standard names for some assets:

```typescript
// Outbound: canonical -> Kraken
const SYMBOL_TO_KRAKEN: Record<string, string> = {
  'BTCUSD': 'XBTUSD',   // Kraken calls Bitcoin "XBT"
  'ETHUSD': 'ETHUSD',
  'ADAUSD': 'ADAUSD',
};

// Inbound: Kraken -> canonical
const KRAKEN_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_KRAKEN).map(([k, v]) => [v, k])
);

// Balance asset names also need mapping
const KRAKEN_ASSET_TO_CURRENCY: Record<string, string> = {
  'ZUSD': 'USD',   // Kraken prefixes fiat with Z
  'XXBT': 'BTC',   // Kraken prefixes crypto with X
  'XETH': 'ETH',
};
```

### How to do it for your broker

1. **Create the forward map** (`SYMBOL_TO_ALPACA`) mapping every supported
   canonical symbol to the broker's format.

2. **Create the reverse map** (`ALPACA_TO_SYMBOL`) by inverting the forward map.

3. **Apply the forward map on every outbound API call** (order placement,
   market data requests, etc.):

   ```typescript
   const brokerSymbol = SYMBOL_TO_ALPACA[canonicalSymbol] ?? canonicalSymbol;
   ```

4. **Apply the reverse map on every inbound API response** (order data, trade
   history, positions, etc.):

   ```typescript
   const canonicalSymbol = ALPACA_TO_SYMBOL[alpacaSymbol] ?? alpacaSymbol;
   ```

5. **Map currency/asset names in balances** if the broker uses different codes
   (like Kraken's `ZUSD`/`XXBT` prefixes).

6. **Map order types, order statuses, and time-in-force values** to and from
   the canonical enums defined in `types.ts`.

The fallback `?? symbol` pattern ensures that unmapped symbols pass through
rather than crash, but you should log a warning when this happens so you know
to add the mapping.

---

## 6. Testing Checklist

The contract tests live at `src/test/security/broker-adapter.test.ts`. When
adding a new adapter, extend or add tests for these categories:

### Must verify

- [ ] **Capabilities shape**: `getCapabilities()` returns an object with all
      required fields from `BrokerCapabilities`.
- [ ] **Correct brokerId**: `brokerId` matches what you register in the
      registry (e.g., `'alpaca'`).
- [ ] **BrokerResult contract**: Every method returns `{ success: boolean }`
      -- never throws.
- [ ] **Order structure**: `placeOrder()` returns an `Order` with all required
      fields (`id`, `brokerOrderId`, `symbol`, `side`, `type`, `status`,
      `quantity`, `filledQuantity`, `fee`, `feeCurrency`, `createdAt`,
      `updatedAt`).
- [ ] **Symbol mapping round-trip**: A canonical symbol mapped to the broker
      format and back returns the original symbol.
- [ ] **Order type mapping**: All order types reported in
      `supportedOrderTypes` successfully map to the broker's format.
- [ ] **Order status mapping**: All broker-native statuses map to a valid
      `OrderStatus` enum value.
- [ ] **Registry selection**: After registration, `brokerRegistry.select()`
      returns your adapter when criteria match.
- [ ] **No credential leakage**: Serializing any `BrokerResult` to JSON must
      not contain `apiKey`, `apiSecret`, `passphrase`, or `password`.
- [ ] **Unsupported operations**: Methods the broker does not support (e.g.,
      `modifyOrder`) return `{ success: false }` with a clear error, not an
      exception.

### Example test to add

```typescript
function simulateAlpacaCapabilities(): BrokerCapabilities {
  return {
    brokerId: 'alpaca',
    name: 'Alpaca Markets',
    supportedAssetClasses: ['stock', 'etf', 'crypto'],
    supportedOrderTypes: ['market', 'limit', 'stop_loss', 'stop_limit'],
    supportsPaperTrading: true,
    supportsWebSocket: true,
    supportsStopLoss: true,
    supportsTakeProfit: false,
    supportsMarginTrading: true,
    maxOrdersPerSecond: 10,
    supportedCurrencies: ['USD'],
  };
}

describe('Alpaca Adapter Contract', () => {
  it('reports correct brokerId', () => {
    const caps = simulateAlpacaCapabilities();
    expect(caps.brokerId).toBe('alpaca');
  });

  it('supports stock and crypto asset classes', () => {
    const caps = simulateAlpacaCapabilities();
    expect(caps.supportedAssetClasses).toContain('stock');
    expect(caps.supportedAssetClasses).toContain('crypto');
  });

  it('declares paper trading support', () => {
    expect(simulateAlpacaCapabilities().supportsPaperTrading).toBe(true);
  });

  it('selected by registry when user prefers alpaca', () => {
    const allBrokers = [
      simulateKrakenCapabilities(),
      simulatePaperCapabilities(),
      simulateAlpacaCapabilities(),
    ];
    const selected = simulateBrokerSelection('alpaca', false, allBrokers);
    expect(selected?.brokerId).toBe('alpaca');
  });
});
```

### Running the tests

```bash
npx vitest run src/test/security/broker-adapter.test.ts
```

---

## 7. Common Pitfalls

### Pitfall 1: Throwing instead of returning BrokerResult

The adapter contract says **never throw**. The trading engine does not wrap
adapter calls in try/catch -- it checks `result.success`. A thrown exception
will crash the edge function.

```typescript
// WRONG
async getBalances(credentials: BrokerCredentials) {
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error('API error');  // <-- breaks the contract
  // ...
}

// CORRECT
async getBalances(credentials: BrokerCredentials) {
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      return { success: false, error: 'API error', brokerError: await resp.text() };
    }
    // ...
  } catch (e) {
    return { success: false, error: e.message };
  }
}
```

### Pitfall 2: Leaking credentials in responses

Never include credentials in `BrokerResult` data, error messages, or logs.
The contract test suite serializes results to JSON and checks for `apiKey`,
`apiSecret`, and `password`. If your error handling interpolates the full
request config, you will leak secrets.

```typescript
// WRONG
return { success: false, error: `Failed with key ${credentials.apiKey}` };

// CORRECT
return { success: false, error: 'Authentication failed' };
```

### Pitfall 3: Not mapping all fields

When converting a broker API response to an `Order`, every required field must
be present. Missing `feeCurrency` or `filledQuantity` will cause downstream
crashes in the P&L engine or reconciliation engine.

Check the `Order` type definition -- these fields have no `?`:

```
id, brokerOrderId, symbol, side, type, status, quantity,
filledQuantity, fee, feeCurrency, timeInForce, createdAt, updatedAt
```

Use sensible defaults for fields the broker does not provide:

```typescript
fee: parseFloat(data.fee ?? '0'),
feeCurrency: 'USD',
filledQuantity: parseFloat(data.filled_qty ?? '0'),
timeInForce: data.time_in_force ?? 'GTC',
```

### Pitfall 4: Forgetting to map symbols on inbound data

You mapped the symbol to Alpaca format when placing the order. But when parsing
the order status response, the symbol comes back in Alpaca format. You must
reverse-map it:

```typescript
// In mapAlpacaOrder():
symbol: ALPACA_TO_SYMBOL[data.symbol] ?? data.symbol,  // Reverse map
```

If you skip this, the trading engine sees `BTC/USD` instead of `BTCUSD` and
cannot match it to any tracked position.

### Pitfall 5: Not handling unsupported operations

If your broker does not support a feature (e.g., `modifyOrder` or
`getPositions`), do not leave the method body empty or return garbage. Return
a clear error:

```typescript
async modifyOrder(): Promise<BrokerResult<Order>> {
  return {
    success: false,
    error: 'Alpaca does not support order modification. Cancel and re-place.',
  };
}
```

For operations that logically return an empty collection when unsupported
(e.g., positions on a spot-only exchange), returning an empty array is fine:

```typescript
async getPositions(): Promise<BrokerResult<Position[]>> {
  return { success: true, data: [] };
}
```

### Pitfall 6: Accessing the database directly

Adapters must not access the database. The adapter's job is: receive
credentials, call the broker API, return canonical types. The trading engine
handles all database persistence. If you need to cache data (like the last
known price), do it in-memory within the adapter instance, not by writing
to Supabase tables.

### Pitfall 7: Forgetting to register or export

Your adapter exists but nobody can use it if you skip either of these:

1. **Register in the trading function**: `brokerRegistry.register(new AlpacaBrokerAdapter(), 50);`
2. **Export from mod.ts**: `export { AlpacaBrokerAdapter } from './adapters/alpaca.ts';`

### Pitfall 8: Hardcoding sandbox vs production URLs

Use the `credentials.sandbox` flag to switch between paper and live endpoints.
Do not hardcode one or the other.

```typescript
private getBaseUrl(credentials: BrokerCredentials): string {
  return credentials.sandbox ? ALPACA_PAPER_BASE : ALPACA_LIVE_BASE;
}
```

---

## Quick Reference: File Locations

| File | Purpose |
|------|---------|
| `supabase/functions/_shared/broker/adapter.ts` | `BrokerAdapter` interface |
| `supabase/functions/_shared/broker/types.ts` | All canonical types |
| `supabase/functions/_shared/broker/registry.ts` | `BrokerRegistry` + singleton |
| `supabase/functions/_shared/broker/audit.ts` | Audit event types |
| `supabase/functions/_shared/broker/mod.ts` | Barrel export (add your adapter here) |
| `supabase/functions/_shared/broker/adapters/kraken.ts` | Kraken reference implementation |
| `supabase/functions/_shared/broker/adapters/paper.ts` | Paper trading (simplest) implementation |
| `supabase/functions/_shared/broker/adapters/<your-broker>.ts` | Your new adapter |
| `src/test/security/broker-adapter.test.ts` | Contract tests |
