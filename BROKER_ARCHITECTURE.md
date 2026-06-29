# Broker Abstraction Layer -- Architecture

## 1. Overview and Motivation

Cloud Atlas Bot was originally built as a Kraken-only crypto trading bot. Kraken-specific
concepts (ZUSD/XXBT asset names, API signing, symbol mappings) were woven directly into
the trading engine and edge functions. This coupling created three problems:

1. **Vendor lock-in.** Adding a second exchange (Coinbase, Alpaca, Interactive Brokers)
   would require rewriting the trading engine.
2. **Single asset class.** Kraken is crypto-only. Supporting stocks, ETFs, forex, options,
   futures, or metals requires brokers that serve those asset classes.
3. **Testability.** Paper trading was handled as a special `mode` flag inside the live
   trading path, mixing simulation logic with real order placement.

The broker abstraction layer solves all three by introducing a uniform `BrokerAdapter`
interface that every broker implements. The trading engine programs against this interface
and never sees Kraken-specific (or any broker-specific) data structures.

**Key design decisions:**

- Adapters MUST NOT throw exceptions. All operations return `BrokerResult<T>`.
- Adapters MUST NOT access the database. They receive credentials and return results;
  the engine handles persistence.
- Adapters MUST map all broker-native symbols, errors, and data formats to canonical types.
- The Paper adapter is a first-class citizen, not a flag on a live adapter.


## 2. Architecture Diagram

```
+--------------------------------------------------------------------+
|                        TRADING ENGINE                               |
|  (signal generation, risk management, order orchestration)          |
+------------------------------|-------------------------------------+
                               |
                               | uses BrokerAdapter interface
                               |
+------------------------------|-------------------------------------+
|                       BROKER REGISTRY                               |
|  register() | select(criteria) | failover() | healthCheckAll()      |
+---------|-------------|-------------|-------------|------------------+
          |             |             |             |
          v             v             v             v
   +-----------+  +-----------+  +-----------+  +-----------+
   |  Kraken   |  |  Paper    |  |  Alpaca   |  |  (future) |
   |  Adapter  |  |  Adapter  |  |  Adapter  |  |  Adapter  |
   +-----------+  +-----------+  +-----------+  +-----------+
          |             |
          v             v
   +-----------+  +-------------------+
   | Kraken    |  | In-memory state + |
   | REST API  |  | real market data  |
   +-----------+  | provider          |
                  +-------------------+

   +-------------------------------------------------------------------+
   |                      AUDIT LAYER                                   |
   |  emitBrokerAudit() --> auditLog() --> security_audit_log table     |
   +-------------------------------------------------------------------+

   +-------------------------------------------------------------------+
   |                    DATABASE TABLES                                  |
   |  broker_accounts | broker_capabilities | broker_health             |
   |  broker_orders   | broker_positions    | broker_balances           |
   |  broker_transactions | broker_failures                             |
   +-------------------------------------------------------------------+
```


## 3. Core Abstractions

### 3.1. Domain Types (`types.ts`)

All types are broker-independent. No Kraken, Coinbase, or Alpaca concepts leak into
these definitions. Every broker adapter maps its native types to and from these.

| Type / Interface    | Purpose                                                   |
|---------------------|-----------------------------------------------------------|
| `AssetClass`        | Union: `crypto`, `stock`, `etf`, `forex`, `option`, `future`, `metal` |
| `AssetInfo`         | Metadata for a tradeable asset (symbol, min/max quantity, step sizes) |
| `OrderRequest`      | What the engine sends to place an order                   |
| `Order`             | What the adapter returns after placement/query            |
| `OrderSide`         | `buy` or `sell`                                           |
| `OrderType`         | `market`, `limit`, `stop_loss`, `take_profit`, `stop_limit` |
| `OrderStatus`       | `pending`, `open`, `partially_filled`, `filled`, `cancelled`, `expired`, `rejected`, `failed` |
| `TimeInForce`       | `GTC`, `IOC`, `FOK`, `DAY`                               |
| `Position`          | An open position with entry price, current price, P&L     |
| `Balance`           | Per-currency balance (total, available, locked)           |
| `AccountBalances`   | All balances plus total equity in USD                     |
| `Ticker`            | Real-time price snapshot (last, bid, ask, volume, 24h range) |
| `OHLCV`            | Historical candle data                                    |
| `Trade`             | An executed fill (order ID, price, fee, realized P&L)     |
| `FeeEstimate`       | Maker/taker fee rates and estimated fee for a quantity    |
| `BrokerHealth`      | Status, latency, rate limits, maintenance window          |
| `BrokerCapabilities`| What a broker supports (asset classes, order types, features) |
| `BrokerCredentials` | API key, secret, optional passphrase and sandbox flag     |
| `BrokerResult<T>`   | Result wrapper for all adapter operations                 |

### 3.2. `BrokerResult<T>` Pattern

Every adapter method returns `BrokerResult<T>` instead of throwing:

```typescript
interface BrokerResult<T> {
  success: boolean;
  data?: T;          // present when success=true
  error?: string;    // generic error message (safe to log/display)
  brokerError?: string; // raw broker-specific error (for debugging)
  retryable?: boolean;  // hint for the engine's retry logic
}
```

This pattern ensures:

- **No uncaught exceptions.** The trading engine always gets a structured response.
- **Error separation.** The generic `error` field is safe to show in dashboards.
  The `brokerError` field contains raw broker output (e.g., `EOrder:Insufficient funds`)
  for debugging but is never exposed to end users.
- **Retry guidance.** Rate limit errors are `retryable: true`; authentication failures
  are `retryable: false`.

### 3.3. `BrokerCapabilities`

Each adapter exposes a static capability report:

```typescript
interface BrokerCapabilities {
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
```

The registry uses capabilities to filter and rank brokers during selection.


## 4. BrokerAdapter Interface

Defined in `adapter.ts`. Every broker implements this interface in full. The Trading
Engine only depends on this interface -- never on a concrete adapter class.

### 4.1. Method Groups

**Identity (readonly properties):**

| Property     | Type   | Example          |
|--------------|--------|------------------|
| `brokerId`   | string | `'kraken'`       |
| `brokerName` | string | `'Kraken'`       |

**Lifecycle:**

| Method                | Purpose                                          |
|-----------------------|--------------------------------------------------|
| `connect(creds)`      | Initialize adapter, warm up connections, validate config |
| `validateCredentials(creds)` | Verify credentials are correct and have required permissions |
| `testConnection()`    | Quick connectivity test (public endpoints, no creds needed) |
| `healthCheck()`       | Full health report: latency, rate limits, maintenance |

**Account:**

| Method              | Purpose                              |
|---------------------|--------------------------------------|
| `getBalances(creds)` | All account balances (per-currency)  |

**Market Data (public -- no credentials required):**

| Method                          | Purpose                        |
|---------------------------------|--------------------------------|
| `getMarketData(symbol)`         | Current ticker for a symbol    |
| `getHistoricalData(symbol, interval, limit)` | Historical OHLCV candles |

**Orders:**

| Method                                | Purpose                          |
|---------------------------------------|----------------------------------|
| `placeOrder(creds, order)`            | Submit a new order               |
| `cancelOrder(creds, orderId)`         | Cancel an existing order         |
| `modifyOrder(creds, orderId, changes)`| Modify an order (if supported)   |
| `getOrderStatus(creds, orderId)`      | Current status of a specific order |
| `getOpenOrders(creds)`                | All currently open orders        |
| `getClosedOrders(creds, since?)`      | Closed/filled order history      |

**Positions:**

| Method                | Purpose                          |
|-----------------------|----------------------------------|
| `getPositions(creds)` | All open positions               |

**Trade History:**

| Method                          | Purpose                   |
|---------------------------------|---------------------------|
| `getTradeHistory(creds, since?)`| Executed trade (fill) log |

**Fee Estimation:**

| Method                             | Purpose                                 |
|------------------------------------|-----------------------------------------|
| `estimateFees(symbol, qty, type)`  | Estimate maker/taker fees for a trade   |

**Capability Queries:**

| Method                   | Purpose                                    |
|--------------------------|--------------------------------------------|
| `getCapabilities()`      | Full capability report                     |
| `supportsAsset(symbol)`  | Whether a symbol is tradeable              |
| `supportsOrderType(type)`| Whether an order type is supported         |
| `supportsPaperTrading()` | Whether paper/simulated trading is offered |


## 5. Registry and Selection

### 5.1. BrokerRegistry (`registry.ts`)

The `BrokerRegistry` is a singleton that manages all registered adapters. It is
exported as `brokerRegistry` for convenience.

**Registration:**

```typescript
const registry = new BrokerRegistry();
registry.register(new KrakenBrokerAdapter(), 10);   // priority 10 (highest)
registry.register(new PaperBrokerAdapter(), 100);    // priority 100 (fallback)
```

Lower priority number means higher precedence. The default priority is 100.

**`RegisteredBroker` entry:**

```typescript
interface RegisteredBroker {
  adapter: BrokerAdapter;
  capabilities: BrokerCapabilities;
  lastHealth?: BrokerHealth;
  enabled: boolean;
  priority: number;
}
```

### 5.2. Selection Algorithm

`select(criteria: BrokerSelectionCriteria)` chooses the best broker:

```typescript
interface BrokerSelectionCriteria {
  userId: string;
  preferredBrokerId?: string;
  assetClass?: AssetClass;
  symbol?: string;
  requirePaperTrading?: boolean;
}
```

**Selection priority order:**

1. Filter out disabled brokers.
2. Filter out brokers whose `lastHealth.status` is `'down'`.
3. Filter by `requirePaperTrading` (if set, broker must declare `supportsPaperTrading`).
4. Filter by `assetClass` (if set, broker must list it in `supportedAssetClasses`).
5. Filter by `symbol` (if set, broker's `supportsAsset()` must return true).
6. Among remaining candidates:
   - If `preferredBrokerId` is set and matches a candidate, that candidate wins.
   - Otherwise, sort by priority (lower number = higher priority).
7. Return the top candidate, or `null` if no broker qualifies.

### 5.3. Health Checks

`healthCheckAll()` iterates all registered brokers and calls `healthCheck()` on each.
The returned `BrokerHealth` is stored as `lastHealth` on the `RegisteredBroker` entry,
which the selection algorithm uses to exclude downed brokers.

### 5.4. Failover

`failover(failedBrokerId, criteria)`:

1. Marks the failed broker's `lastHealth.status` as `'down'` with a descriptive message.
2. Calls `select(criteria)` to find the next-best broker.
3. Returns the fallback adapter, or `null` if none qualifies.

This is a soft failover -- the failed broker is not unregistered, only marked down.
A subsequent `healthCheckAll()` can restore it if it recovers.

### 5.5. Additional Methods

| Method                        | Purpose                                        |
|-------------------------------|------------------------------------------------|
| `get(brokerId)`               | Direct lookup by ID (returns null if disabled) |
| `unregister(brokerId)`        | Remove a broker entirely                       |
| `getAll()`                    | All registered brokers (enabled and disabled)  |
| `getEnabled()`                | Only enabled brokers                           |
| `listCapabilities()`          | Capability reports for all enabled brokers     |
| `findByAssetClass(assetClass)`| All adapters supporting a given asset class    |


## 6. Adapter Lifecycle

The expected sequence for using an adapter:

```
1. Registry.select(criteria)      -->  BrokerAdapter
2. adapter.testConnection()        -->  BrokerResult<{connected, latencyMs}>
3. adapter.connect(credentials)    -->  BrokerResult<void>
4. adapter.validateCredentials()   -->  BrokerResult<{valid, permissions[]}>
5. adapter.healthCheck()           -->  BrokerResult<BrokerHealth>
6. adapter.placeOrder(...)         -->  BrokerResult<Order>
   adapter.getBalances(...)        -->  BrokerResult<AccountBalances>
   adapter.getPositions(...)       -->  BrokerResult<Position[]>
   ...
7. (no explicit disconnect -- adapters are stateless per-request)
```

Notes:

- `testConnection()` does not require credentials. It hits public endpoints (e.g.,
  Kraken's `/0/public/SystemStatus`) to verify network connectivity.
- `connect()` validates credentials and prepares the adapter for authenticated calls.
- Adapters are designed to be stateless across requests. They do not hold persistent
  connections. Each method call is self-contained.
- Credentials are passed per-call, never stored in adapter instance state.


## 7. Database Schema

All tables are created by migration `20260620000007_broker_abstraction.sql`. The
migration is additive -- it does not modify existing tables (`executed_trades`,
`trading_positions`, etc.). Both old and new schemas coexist during migration.

### 7.1. `broker_accounts`

Per-user broker configuration.

| Column        | Type        | Notes                                    |
|---------------|-------------|------------------------------------------|
| `id`          | UUID PK     | Auto-generated                           |
| `user_id`     | UUID        | References the authenticated user        |
| `broker_id`   | TEXT        | e.g., `'kraken'`, `'paper'`, `'alpaca'`  |
| `display_name`| TEXT        | User-facing label                        |
| `is_enabled`  | BOOLEAN     | Default `true`                           |
| `is_default`  | BOOLEAN     | Default `false`; at most one per user    |
| `mode`        | TEXT        | `'paper'` or `'live'`                    |
| `config`      | JSONB       | Broker-specific configuration            |
| `created_at`  | TIMESTAMPTZ |                                          |
| `updated_at`  | TIMESTAMPTZ |                                          |

**Constraints:** `UNIQUE(user_id, broker_id)` -- one account per broker per user.

**RLS:** Users can only SELECT and manage their own rows (`auth.uid() = user_id`).

### 7.2. `broker_capabilities`

System-managed reference table describing what each broker supports.

| Column                     | Type     | Notes                                   |
|----------------------------|----------|-----------------------------------------|
| `broker_id`                | TEXT PK  | Matches adapter's `brokerId`            |
| `broker_name`              | TEXT     |                                         |
| `supported_asset_classes`  | TEXT[]   | e.g., `{crypto}`, `{crypto,stock,etf}`  |
| `supported_order_types`    | TEXT[]   | e.g., `{market,limit,stop_loss}`        |
| `supports_paper_trading`   | BOOLEAN  |                                         |
| `supports_websocket`       | BOOLEAN  |                                         |
| `supports_stop_loss`       | BOOLEAN  |                                         |
| `supports_take_profit`     | BOOLEAN  |                                         |
| `supports_margin`          | BOOLEAN  |                                         |
| `max_orders_per_second`    | INTEGER  |                                         |
| `supported_currencies`     | TEXT[]   |                                         |
| `updated_at`               | TIMESTAMPTZ |                                      |

Seeded with `kraken` and `paper` entries on migration. Uses `ON CONFLICT DO NOTHING`
so re-running the migration is safe.

### 7.3. `broker_health`

Time-series health check log.

| Column                | Type        | Notes                                  |
|-----------------------|-------------|----------------------------------------|
| `id`                  | UUID PK     |                                        |
| `broker_id`           | TEXT        |                                        |
| `status`              | TEXT        | `healthy`, `degraded`, `down`, `maintenance` |
| `latency_ms`          | INTEGER     |                                        |
| `rate_limit_remaining`| INTEGER     |                                        |
| `rate_limit_total`    | INTEGER     |                                        |
| `message`             | TEXT        | Optional status message                |
| `checked_at`          | TIMESTAMPTZ |                                        |

**Index:** `(broker_id, checked_at DESC)` for efficient latest-health queries.

### 7.4. `broker_orders`

Broker-agnostic order log.

| Column               | Type           | Notes                               |
|----------------------|----------------|--------------------------------------|
| `id`                 | UUID PK        |                                      |
| `user_id`            | UUID           |                                      |
| `broker_id`          | TEXT           |                                      |
| `broker_order_id`    | TEXT           | ID returned by the broker            |
| `client_order_id`    | TEXT           | Application-assigned idempotency key |
| `symbol`             | TEXT           | Canonical symbol (e.g., `BTCUSD`)    |
| `side`               | TEXT           | `buy` or `sell`                      |
| `order_type`         | TEXT           |                                      |
| `status`             | TEXT           | Default `pending`                    |
| `quantity`           | DECIMAL(20,8)  |                                      |
| `filled_quantity`    | DECIMAL(20,8)  | Default 0                            |
| `price`              | DECIMAL(20,8)  | Limit price (nullable for market)    |
| `stop_price`         | DECIMAL(20,8)  |                                      |
| `average_fill_price` | DECIMAL(20,8)  |                                      |
| `fee`                | DECIMAL(20,8)  | Default 0                            |
| `fee_currency`       | TEXT           | Default `USD`                        |
| `time_in_force`      | TEXT           | Default `GTC`                        |
| `created_at`         | TIMESTAMPTZ    |                                      |
| `updated_at`         | TIMESTAMPTZ    |                                      |

**RLS:** Users can only SELECT their own orders.
**Indexes:** `(user_id, created_at DESC)`, `(broker_id, status)`.

### 7.5. `broker_positions`

Broker-agnostic position tracking.

| Column               | Type           | Notes                               |
|----------------------|----------------|--------------------------------------|
| `id`                 | UUID PK        |                                      |
| `user_id`            | UUID           |                                      |
| `broker_id`          | TEXT           |                                      |
| `symbol`             | TEXT           |                                      |
| `side`               | TEXT           | `long` or `short`                    |
| `quantity`           | DECIMAL(20,8)  |                                      |
| `average_entry_price`| DECIMAL(20,8)  |                                      |
| `current_price`      | DECIMAL(20,8)  |                                      |
| `unrealized_pnl`     | DECIMAL(20,8)  |                                      |
| `realized_pnl`       | DECIMAL(20,8)  | Default 0                            |
| `status`             | TEXT           | `open` or `closed`                   |
| `opened_at`          | TIMESTAMPTZ    |                                      |
| `closed_at`          | TIMESTAMPTZ    | Nullable                             |

**RLS:** Users can only SELECT their own positions.
**Index:** `(user_id, status)`.

### 7.6. `broker_balances`

Point-in-time balance snapshots.

| Column           | Type           | Notes                                  |
|------------------|----------------|----------------------------------------|
| `id`             | UUID PK        |                                        |
| `user_id`        | UUID           |                                        |
| `broker_id`      | TEXT           |                                        |
| `currency`       | TEXT           |                                        |
| `total`          | DECIMAL(20,8)  |                                        |
| `available`      | DECIMAL(20,8)  |                                        |
| `locked`         | DECIMAL(20,8)  | Default 0                              |
| `total_equity_usd`| DECIMAL(20,8) |                                        |
| `snapshot_at`    | TIMESTAMPTZ    |                                        |

**Index:** `(user_id, broker_id, snapshot_at DESC)`.

### 7.7. `broker_transactions`

Fill/trade log per broker.

| Column         | Type           | Notes                                    |
|----------------|----------------|------------------------------------------|
| `id`           | UUID PK        |                                          |
| `user_id`      | UUID           |                                          |
| `broker_id`    | TEXT           |                                          |
| `order_id`     | UUID FK        | References `broker_orders(id)`           |
| `symbol`       | TEXT           |                                          |
| `side`         | TEXT           | `buy` or `sell`                          |
| `quantity`     | DECIMAL(20,8)  |                                          |
| `price`        | DECIMAL(20,8)  |                                          |
| `fee`          | DECIMAL(20,8)  | Default 0                                |
| `fee_currency` | TEXT           | Default `USD`                            |
| `realized_pnl` | DECIMAL(20,8)  |                                          |
| `executed_at`  | TIMESTAMPTZ    |                                          |

**RLS:** Users can only SELECT their own transactions.
**Index:** `(user_id, executed_at DESC)`.

### 7.8. `broker_failures`

Error log for debugging and monitoring. Not RLS-protected (intended for admin/system
queries).

| Column          | Type        | Notes                                      |
|-----------------|-------------|--------------------------------------------|
| `id`            | UUID PK     |                                            |
| `user_id`       | UUID        | Nullable (some failures are system-level)  |
| `broker_id`     | TEXT        |                                            |
| `operation`     | TEXT        | e.g., `placeOrder`, `getBalances`          |
| `error_message` | TEXT        |                                            |
| `error_details` | JSONB       | Raw error context                          |
| `retryable`     | BOOLEAN     | Default `false`                            |
| `occurred_at`   | TIMESTAMPTZ |                                            |

**Index:** `(broker_id, occurred_at DESC)`.


## 8. Audit Integration

### 8.1. Event Flow

```
Adapter operation (e.g., placeOrder)
        |
        v
emitBrokerAudit(supabase, event)    [broker/audit.ts]
        |
        v
auditLog(supabase, entry)           [_shared/auditLogger.ts]
        |
        v
INSERT into security_audit_log      [existing table]
```

### 8.2. Audit Actions

The `BrokerAuditAction` type defines all broker-related audit events:

| Action                | Severity  | When emitted                              |
|-----------------------|-----------|-------------------------------------------|
| `BROKER_SELECTED`     | INFO      | Registry selects a broker for a request   |
| `BROKER_HEALTHCHECK`  | DEBUG     | Health check completes                    |
| `BROKER_CONNECT`      | INFO      | Adapter connection established            |
| `BROKER_FAILOVER`     | WARNING   | Primary broker failed, switching to backup|
| `ORDER_SUBMITTED`     | INFO      | Order sent to broker                      |
| `ORDER_FILLED`        | INFO      | Order fully filled                        |
| `ORDER_CANCELLED`     | INFO      | Order cancelled                           |
| `ORDER_REJECTED`      | WARNING   | Broker rejected the order                 |
| `ORDER_FAILED`        | CRITICAL  | Order failed (network, internal error)    |
| `ORDER_MODIFIED`      | INFO      | Order modified                            |
| `POSITION_OPENED`     | INFO      | New position opened                       |
| `POSITION_CLOSED`     | INFO      | Position closed                           |
| `BALANCE_FETCHED`     | DEBUG     | Balance query completed                   |
| `MARKET_DATA_FETCHED` | DEBUG     | Market data query completed               |
| `CREDENTIAL_VALIDATED`| INFO      | Credential validation attempt             |

### 8.3. Audit Event Structure

```typescript
interface BrokerAuditEvent {
  userId: string | null;     // null for system-level events
  action: BrokerAuditAction;
  brokerId: string;
  details: Record<string, unknown>;  // free-form context
}
```

All events are tagged with `category: AuditCategory.TRADING` and flow into the
existing `security_audit_log` table with the broker ID included in the details payload.


## 9. Security Invariants

### 9.1. Credential Handling

- **Credentials are never stored in adapter instance state.** They are passed as
  parameters to each method call and used only for that request. The adapter does
  not retain them between calls.
- **The `BrokerCredentials` type is only used in method parameters.** It never
  appears in `BrokerResult` responses, `Order` objects, or audit event details.
- **Per-user encrypted keys** are stored in the database using AES-GCM with HKDF
  key derivation (v2). The broker abstraction layer receives decrypted credentials
  from the secure-credentials edge function -- it never handles encryption/decryption
  itself.

### 9.2. Paper Adapter Safety

- **Paper adapter never requires real credentials.** `connect()` and
  `validateCredentials()` always return success regardless of input.
- **Paper adapter never contacts exchange APIs.** It delegates to a market data
  provider (typically the Kraken adapter) for live prices, but never sends
  authenticated requests.
- **Paper order IDs are prefixed with `paper-`** to prevent confusion with real
  exchange order IDs.

### 9.3. Response Safety

- **Order responses never expose secrets.** The `Order` type has no fields for
  API keys, secrets, or passwords. Contract tests verify that `JSON.stringify(result)`
  does not contain `apiKey`, `apiSecret`, `privateKey`, or `password`.
- **Broker-specific errors are separated.** The `brokerError` field on `BrokerResult`
  contains raw broker output for developer debugging. The `error` field contains a
  sanitized message suitable for user-facing display.

### 9.4. Database Security

- **Row Level Security (RLS)** is enabled on `broker_accounts`, `broker_orders`,
  `broker_positions`, and `broker_transactions`. Users can only access their own data
  via `auth.uid() = user_id`.
- **`broker_capabilities`** is a system-managed reference table with no RLS (read-only
  system data).
- **`broker_health`** and **`broker_failures`** are operational tables without
  user-scoped RLS (intended for system monitoring).

### 9.5. Adapter Identity

- `brokerId` and `brokerName` are `readonly` properties. They cannot be changed after
  adapter construction. This prevents impersonation attacks where an adapter claims to
  be a different broker.


## 10. Current Adapters

### 10.1. KrakenBrokerAdapter (`adapters/kraken.ts`)

The production adapter for Kraken cryptocurrency exchange.

**Broker ID:** `kraken`

**Symbol mapping:** Canonical symbols (e.g., `BTCUSD`) are mapped to Kraken-native
pairs (e.g., `XBTUSD`). Asset codes are similarly translated (`ZUSD` -> `USD`,
`XXBT` -> `BTC`). All mapping tables are private to the module.

**API authentication:** Requests to private endpoints use HMAC-SHA512 signing with
nonce-based replay protection. The signing flow:

1. Generate nonce (current timestamp).
2. SHA-256 hash of `nonce + POST body`.
3. Concatenate API path bytes with the hash.
4. HMAC-SHA512 using the base64-decoded API secret.
5. Base64-encode the signature.

**Capabilities:**
- Asset classes: `crypto` only
- Order types: `market`, `limit`, `stop_loss`, `take_profit`, `stop_limit`
- Paper trading: not supported (use the Paper adapter instead)
- WebSocket: supported
- Margin trading: supported
- Rate limit: 1 order/second
- Currencies: USD, CAD, EUR, GBP

**Notable behaviors:**
- `modifyOrder()` returns `success: false` -- Kraken does not support order modification.
  The engine must cancel and re-place.
- `getPositions()` returns an empty array -- Kraken reports positions as balances, not
  as structured position objects. The engine derives positions from trade history.
- Fee estimation uses static rates (maker: 0.16%, taker: 0.26%) as a conservative
  default. Actual fees depend on 30-day volume tier.
- `connect()` validates credentials by calling the Balance endpoint.

### 10.2. PaperBrokerAdapter (`adapters/paper.ts`)

The simulation adapter for risk-free testing and development.

**Broker ID:** `paper`

**Market data:** Delegates to a real market data provider (injected via
`setMarketDataProvider()`). Typically this is `krakenAdapter.getMarketData`. Falls
back to synthetic hardcoded prices if no provider is available:

| Symbol   | Synthetic Price |
|----------|----------------|
| BTCUSD   | 65,000         |
| ETHUSD   | 3,500          |
| SOLUSD   | 150            |
| ADAUSD   | 0.45           |
| XRPUSD   | 0.55           |
| AAPL     | 190            |
| GOOGL    | 175            |
| SPY      | 540            |
| (other)  | 100            |

**Capabilities:**
- Asset classes: all seven (`crypto`, `stock`, `etf`, `forex`, `option`, `future`, `metal`)
- Order types: all five
- Paper trading: yes
- WebSocket: not supported
- Margin trading: not supported
- Rate limit: 100 orders/second
- Currencies: USD

**Notable behaviors:**
- `connect()` and `validateCredentials()` always succeed.
- `testConnection()` returns latency 0 and `connected: true`.
- `healthCheck()` always returns `healthy` with the message "Paper broker is always healthy".
- `placeOrder()` for market orders immediately fills at the current bid/ask.
  Limit orders are marked `open` (the engine manages simulated fill logic).
- Fees use a flat 0.1% simulated rate.
- Default paper balance: $10,000 USD.
- `getOrderStatus()` returns an error directing callers to the Trading Engine --
  paper order state tracking is the engine's responsibility, not the adapter's.
- `getHistoricalData()` generates synthetic candles with random noise around the
  base price, suitable for backtesting but not for production signal generation.
- `supportsAsset()` returns `true` for any symbol.


## 11. Testing Strategy

### 11.1. Contract Tests (`src/test/security/broker-adapter.test.ts`)

The test suite contains 27 tests organized into 6 groups. Tests use simulated adapter
behavior (not the real adapter classes) to validate the contract shapes and invariants.

**Group 1: Capabilities (7 tests)**
- Kraken reports `brokerId: 'kraken'`, Paper reports `brokerId: 'paper'`.
- All required capability fields are present on both adapters.
- Paper supports all asset classes (crypto, stock, forex); Kraken supports only crypto.
- Paper declares `supportsPaperTrading: true`; Kraken declares `false`.

**Group 2: Order Placement (5 tests)**
- Paper `placeOrder` returns `BrokerResult` with `success: true`.
- Order response has all required fields (id, brokerOrderId, symbol, side, quantity,
  status, fee, feeCurrency, timestamps).
- Market orders are immediately filled in paper mode (status `filled`, filledQuantity
  matches requested quantity).
- Paper order IDs match the `paper-` prefix pattern.
- Fees are calculated correctly at the 0.1% rate.

**Group 3: Broker Registry Selection (5 tests)**
- Preferred broker is selected when available.
- Paper broker is selected when `requirePaperTrading: true`.
- Non-paper brokers are excluded when paper trading is required (even if preferred).
- Returns `null` when no broker matches criteria.
- Falls back to any available broker when preferred broker is not registered.

**Group 4: BrokerResult Contract (3 tests)**
- Success results have a `data` field.
- Failure results have an `error` field.
- Broker-specific errors are stored in `brokerError` separately from the generic `error`.

**Group 5: Security Invariants (3 tests)**
- Paper adapter never requires real credentials (verified via `supportsPaperTrading`).
- Adapter `brokerId` is stable/immutable across instantiations.
- Order responses never contain credential-related strings (`apiKey`, `apiSecret`,
  `privateKey`, `password`) when serialized to JSON.

**Group 6: Multi-Asset Support (4 tests)**
- Paper adapter declares support for crypto, stock, and forex asset classes.
- Paper adapter declares support for market, limit, and stop_loss order types.


## 12. Barrel Export (`mod.ts`)

All public API surface is re-exported from `_shared/broker/mod.ts`:

```typescript
import {
  // Types
  BrokerAdapter, BrokerResult, BrokerCapabilities, BrokerCredentials,
  Order, OrderRequest, Position, Ticker, OHLCV, Trade, Balance, ...

  // Registry
  BrokerRegistry, brokerRegistry, BrokerSelectionCriteria,

  // Adapters
  KrakenBrokerAdapter, PaperBrokerAdapter,

  // Audit
  emitBrokerAudit, BrokerAuditAction, BrokerAuditEvent,
} from '../_shared/broker/mod.ts';
```

Edge functions should import exclusively from this barrel module to avoid reaching
into internal adapter files.


## 13. Adding a New Broker

To add a new broker (e.g., Alpaca for stocks):

1. Create `supabase/functions/_shared/broker/adapters/alpaca.ts`.
2. Implement `BrokerAdapter` in full. Map Alpaca-native types to canonical types.
3. Export the adapter from `mod.ts`.
4. Register it in the startup path:
   ```typescript
   brokerRegistry.register(new AlpacaBrokerAdapter(), 50);
   ```
5. Add a row to `broker_capabilities` (via migration or seed).
6. Add contract tests in `src/test/security/broker-adapter.test.ts`.
7. The Trading Engine will automatically discover the new broker through the registry's
   `select()` and `findByAssetClass()` methods.

No changes to the Trading Engine or existing adapters are required.
