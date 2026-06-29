# Adding a New Broker to Cloud Atlas Bot

Quick reference for implementing a new `BrokerAdapter`. Use the Paper adapter
(`supabase/functions/_shared/broker/adapters/paper.ts`) as a working example.

---

## Checklist

### 1. Create the adapter file

Add `supabase/functions/_shared/broker/adapters/<name>.ts`.

### 2. Implement the `BrokerAdapter` interface

Your class must satisfy every method in `_shared/broker/adapter.ts`:

| Category | Methods |
|---|---|
| Identity | `brokerId`, `brokerName` (readonly properties) |
| Lifecycle | `connect`, `validateCredentials`, `testConnection`, `healthCheck` |
| Account | `getBalances` |
| Market Data | `getMarketData`, `getHistoricalData` |
| Orders | `placeOrder`, `cancelOrder`, `modifyOrder`, `getOrderStatus`, `getOpenOrders`, `getClosedOrders` |
| Positions | `getPositions` |
| Trade History | `getTradeHistory` |
| Fees | `estimateFees` |
| Capabilities | `getCapabilities`, `supportsAsset`, `supportsOrderType`, `supportsPaperTrading` |

Rules (from `adapter.ts`):
- **Never throw.** Return `BrokerResult<T>` with `success: false` on errors.
- **Never access the database.** Receive credentials in, return results out.
- **Map everything** to canonical types in `types.ts` -- symbols, errors, data formats.

### 3. Add symbol mapping

Create private maps between broker-native symbols and canonical symbols:

```ts
const SYMBOL_TO_BROKER: Record<string, string> = {
  'BTCUSD': 'BTC-USD',   // canonical -> broker-native
};

const BROKER_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_BROKER).map(([k, v]) => [v, k])
);
```

### 4. Register in the `BrokerRegistry`

In the module that bootstraps your trading pipeline, register the adapter:

```ts
import { brokerRegistry } from '../_shared/broker/mod.ts';
import { ExampleBrokerAdapter } from '../_shared/broker/adapters/example.ts';

brokerRegistry.register(new ExampleBrokerAdapter(), 50);
//                                                  ^^ priority (lower = preferred)
```

### 5. Export from `mod.ts`

Add to `supabase/functions/_shared/broker/mod.ts`:

```ts
export { ExampleBrokerAdapter } from './adapters/example.ts';
```

### 6. Add a database migration

Create a new migration file and INSERT into `broker_capabilities`:

```sql
INSERT INTO public.broker_capabilities
  (broker_id, broker_name, supported_asset_classes, supported_order_types,
   supports_paper_trading, supports_websocket, supported_currencies)
VALUES
  ('example', 'Example Exchange', '{crypto}', '{market,limit,stop_loss}',
   false, true, '{USD,EUR}')
ON CONFLICT (broker_id) DO NOTHING;
```

### 7. Add contract tests

Extend or mirror the existing test suite at
`src/test/security/broker-adapter.test.ts` to cover your adapter.

### 8. Verify

```bash
npx vitest run src/test/security/broker-adapter.test.ts
```

---

## Minimal Adapter Skeleton

```ts
import type { BrokerAdapter } from '../adapter.ts';
import type {
  OrderRequest, Order, OrderType, Position, AccountBalances,
  Ticker, OHLCV, Trade, FeeEstimate, BrokerHealth,
  BrokerCapabilities, BrokerCredentials, BrokerResult,
} from '../types.ts';

export class ExampleBrokerAdapter implements BrokerAdapter {
  readonly brokerId = 'example';
  readonly brokerName = 'Example Exchange';

  // -- Lifecycle --
  async connect(credentials: BrokerCredentials): Promise<BrokerResult<void>> { /* ... */ }
  async validateCredentials(credentials: BrokerCredentials): Promise<BrokerResult<{ valid: boolean; permissions?: string[] }>> { /* ... */ }
  async testConnection(): Promise<BrokerResult<{ connected: boolean; latencyMs: number }>> { /* ... */ }
  async healthCheck(): Promise<BrokerResult<BrokerHealth>> { /* ... */ }

  // -- Account --
  async getBalances(credentials: BrokerCredentials): Promise<BrokerResult<AccountBalances>> { /* ... */ }

  // -- Market Data --
  async getMarketData(symbol: string): Promise<BrokerResult<Ticker>> { /* ... */ }
  async getHistoricalData(symbol: string, interval: number, limit?: number): Promise<BrokerResult<OHLCV[]>> { /* ... */ }

  // -- Orders --
  async placeOrder(credentials: BrokerCredentials, order: OrderRequest): Promise<BrokerResult<Order>> { /* ... */ }
  async cancelOrder(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<{ cancelled: boolean }>> { /* ... */ }
  async modifyOrder(credentials: BrokerCredentials, orderId: string, changes: Partial<OrderRequest>): Promise<BrokerResult<Order>> { /* ... */ }
  async getOrderStatus(credentials: BrokerCredentials, orderId: string): Promise<BrokerResult<Order>> { /* ... */ }
  async getOpenOrders(credentials: BrokerCredentials): Promise<BrokerResult<Order[]>> { /* ... */ }
  async getClosedOrders(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Order[]>> { /* ... */ }

  // -- Positions & History --
  async getPositions(credentials: BrokerCredentials): Promise<BrokerResult<Position[]>> { /* ... */ }
  async getTradeHistory(credentials: BrokerCredentials, since?: string): Promise<BrokerResult<Trade[]>> { /* ... */ }

  // -- Fees --
  async estimateFees(symbol: string, quantity: number, orderType: OrderType): Promise<BrokerResult<FeeEstimate>> { /* ... */ }

  // -- Capabilities --
  getCapabilities(): BrokerCapabilities {
    return {
      brokerId: this.brokerId,
      name: this.brokerName,
      supportedAssetClasses: ['crypto'],
      supportedOrderTypes: ['market', 'limit', 'stop_loss'],
      supportsPaperTrading: false,
      supportsWebSocket: true,
      supportsStopLoss: true,
      supportsTakeProfit: false,
      supportsMarginTrading: false,
      maxOrdersPerSecond: 10,
      supportedCurrencies: ['USD'],
    };
  }
  supportsAsset(symbol: string): boolean { /* check symbol map */ return false; }
  supportsOrderType(orderType: OrderType): boolean { return this.getCapabilities().supportedOrderTypes.includes(orderType); }
  supportsPaperTrading(): boolean { return false; }
}
```
