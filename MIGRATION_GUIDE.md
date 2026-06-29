# Migration Guide: Broker Abstraction Layer

This guide covers migrating existing Cloud Atlas Bot edge functions from direct
Kraken API calls to the new broker abstraction layer. The abstraction lives in
`supabase/functions/_shared/broker/` and introduces four key pieces:

- **`BrokerAdapter`** interface (`adapter.ts`) -- the contract every broker implements
- **`BrokerRegistry`** (`registry.ts`) -- selects, health-checks, and fails over between adapters
- **`KrakenBrokerAdapter`** (`adapters/kraken.ts`) -- Kraken-specific logic, fully contained
- **`PaperBrokerAdapter`** (`adapters/paper.ts`) -- simulated execution using real market data

All types are imported through a single barrel module:

```ts
import {
  BrokerAdapter,
  BrokerRegistry,
  brokerRegistry,
  KrakenBrokerAdapter,
  PaperBrokerAdapter,
  emitBrokerAudit,
  type OrderRequest,
  type BrokerCredentials,
  type BrokerResult,
} from '../_shared/broker/mod.ts';
```

---

## Table of Contents

1. [Migration Strategy](#1-migration-strategy)
2. [Before You Start](#2-before-you-start)
3. [Step-by-Step Migration](#3-step-by-step-migration)
   - 3a. trading-bot/index.ts
   - 3b. live-trading-engine/index.ts
   - 3c. reconciliation-engine/index.ts
   - 3d. Paper trading path
4. [Testing at Each Step](#4-testing-at-each-step)
5. [Rollback Plan](#5-rollback-plan)
6. [Common Migration Patterns](#6-common-migration-patterns)
7. [Safety Rules](#7-safety-rules)

---

## 1. Migration Strategy

**Incremental migration, never a rewrite.** Each edge function is migrated
independently. At every intermediate commit the system must pass all existing
tests and paper trading must still work.

The key principles:

- **Dual-path execution** -- during transition, keep the old Kraken-direct code
  path behind a boolean guard. The new broker-adapter path runs alongside it.
  Compare results before trusting the new path exclusively.
- **One function at a time** -- migrate `trading-bot` first (it has the most
  complexity), verify, then move to `live-trading-engine`, then
  `reconciliation-engine`. Never migrate two functions in the same deploy.
- **Paper mode is the canary** -- every migration step must be validated in
  paper mode before it can affect live trading. The readiness gate already
  enforces this.
- **No behavioral changes** -- the abstraction changes *how* the code calls the
  exchange, not *what* it does. Risk checks, audit logging, kill switches, and
  cooldowns must remain identical.

---

## 2. Before You Start

### 2.1 Run all tests and record baselines

```bash
npx vitest run                          # Full test suite
npx vitest run src/test/security/       # Security tests specifically
```

Save the output. You will diff against this after each migration step.

### 2.2 Verify paper trading works end-to-end

1. Call `trading-bot` with `action: "generate_paper_signal"` and confirm a
   signal is stored in `strategy_signals`.
2. Call `trading-bot` with `action: "execute_trade"` and confirm a paper
   position appears in `trading_positions` and `executed_trades`.
3. Confirm the audit log contains `PAPER_TRADE_EXECUTED` entries.

### 2.3 Take note of existing behavior

Document the current response shapes for each action you plan to migrate.
The broker adapter returns canonical types (`Order`, `Ticker`, `AccountBalances`)
that have slightly different field names than the raw Kraken responses. You will
need to map downstream consumers to accept the new shapes or adapt at the
boundary.

### 2.4 Confirm the broker layer builds

```bash
# From the project root, verify the broker module has no import errors:
deno check supabase/functions/_shared/broker/mod.ts
```

---

## 3. Step-by-Step Migration

### 3a. trading-bot/index.ts

This is the largest function. It contains an inline `KrakenAPI` class, an
`MLEngine`, a `RegimeDetector`, a `RiskManager`, and a `NotificationManager`.
The migration target is the `KrakenAPI` class and every place it is called.

#### What to change

1. **Remove the inline `KrakenAPI` class** (lines 63-111 of the current file).
   Replace it with imports from the broker layer.

2. **Register adapters at the top of the request handler**, before the
   `switch(action)` block.

3. **Select the adapter using the registry** based on `bot_config.mode`.

4. **Replace every `krakenAPI.someMethod()` call** with the equivalent adapter
   method.

#### Before (current code)

```ts
// Current: inline KrakenAPI class, constructed per-request
const creds = await getPerUserKrakenCredentials(userId, token);
krakenAPI = new KrakenAPI(creds.apiKey, creds.privateKey);

// Usage in analyze_market:
const ohlcData = await krakenAPI.getOHLCData(symbol);
const marketData = ohlcData.result[Object.keys(ohlcData.result)[0]];
```

#### After (migrated code)

```ts
import {
  brokerRegistry,
  KrakenBrokerAdapter,
  PaperBrokerAdapter,
  emitBrokerAudit,
  type BrokerAdapter,
  type BrokerCredentials,
  type BrokerResult,
  type Ticker,
  type OHLCV,
  type OrderRequest,
} from '../_shared/broker/mod.ts';

// --- Register adapters once, at module level ---
const krakenAdapter = new KrakenBrokerAdapter();
const paperAdapter = new PaperBrokerAdapter();
paperAdapter.setMarketDataProvider((symbol) => krakenAdapter.getMarketData(symbol));

brokerRegistry.register(krakenAdapter, 10);   // priority 10 (primary)
brokerRegistry.register(paperAdapter, 100);   // priority 100 (fallback)

// --- Inside the request handler ---

// Select adapter based on trading mode
const broker: BrokerAdapter | null = brokerRegistry.select({
  userId,
  preferredBrokerId: botConfig.mode === 'paper' ? 'paper' : 'kraken',
  assetClass: 'crypto',
  symbol,
  requirePaperTrading: botConfig.mode === 'paper',
});

if (!broker) {
  return new Response(JSON.stringify({ error: 'No broker available' }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Build credentials (only needed for live mode)
let credentials: BrokerCredentials | null = null;
if (botConfig.mode === 'live') {
  const creds = await getPerUserKrakenCredentials(userId, token);
  credentials = {
    brokerId: 'kraken',
    apiKey: creds.apiKey,
    apiSecret: creds.privateKey,
  };
}

// Audit the selection
await emitBrokerAudit(supabase, {
  userId,
  action: 'BROKER_SELECTED',
  brokerId: broker.brokerId,
  details: { mode: botConfig.mode, symbol },
});
```

#### Replacing `analyze_market`

Before:

```ts
case 'analyze_market':
  const ohlcData = await krakenAPI.getOHLCData(symbol);
  const marketData = ohlcData.result[Object.keys(ohlcData.result)[0]];
  // ... manual parsing of Kraken-specific response format ...
```

After:

```ts
case 'analyze_market': {
  // Fetch OHLCV via the adapter -- no Kraken-specific parsing needed
  const ohlcResult: BrokerResult<OHLCV[]> = await broker.getHistoricalData(symbol, 15, 100);
  if (!ohlcResult.success || !ohlcResult.data) {
    return new Response(JSON.stringify({ error: ohlcResult.error ?? 'Failed to fetch market data' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const marketData = ohlcResult.data;

  // Store in DB -- fields already match because OHLCV is a canonical type
  const formattedData = marketData.map((candle) => ({
    symbol,
    timestamp: candle.timestamp,
    timeframe: '15m',
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));

  await supabase.from('market_data').upsert(formattedData);
  // ... rest of regime detection and signal generation unchanged ...
}
```

#### Replacing `generate_paper_signal`

Before:

```ts
case 'generate_paper_signal': {
  // Direct Kraken public API call
  const tickerResp = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${symbol}`);
  const tickerData = await tickerResp.json();
  const pairKey = Object.keys(tickerData.result || {})[0];
  currentPrice = pairKey ? parseFloat(tickerData.result[pairKey].c[0]) : 0;
}
```

After:

```ts
case 'generate_paper_signal': {
  // Use the adapter -- works for any broker, handles symbol mapping
  const tickerResult: BrokerResult<Ticker> = await broker.getMarketData(symbol);
  let currentPrice = tickerResult.success && tickerResult.data
    ? tickerResult.data.lastPrice
    : 0;

  // Fallback to synthetic price if adapter fails
  if (!currentPrice || isNaN(currentPrice)) {
    const basePrices: Record<string, number> = { 'BTCUSD': 65000, 'ETHUSD': 3500, 'SOLUSD': 150 };
    currentPrice = basePrices[symbol] ?? 65000;
  }
  // ... rest of signal generation unchanged ...
}
```

---

### 3b. live-trading-engine/index.ts

This function contains a `LiveTradingEngine` class with its own Kraken API
signature generation, request method, symbol mapping, and credential fetching.
All of this duplicates what `KrakenBrokerAdapter` already does.

#### What to change

1. **Remove** the `generateKrakenSignature`, `krakenRequest`, `mapSymbolToKraken`,
   and `getAssetKey` private methods from `LiveTradingEngine`.

2. **Remove** the inline `KrakenCredentials` interface -- use `BrokerCredentials`
   from the broker layer.

3. **Inject a `BrokerAdapter`** into `LiveTradingEngine` via constructor.

4. **Replace each method** that calls `this.krakenRequest(...)` with the
   corresponding adapter method.

#### Before

```ts
class LiveTradingEngine {
  private supabase;

  constructor() {
    this.supabase = createClient(/* ... */);
  }

  private async krakenRequest(endpoint: string, params: Record<string, any>, credentials: KrakenCredentials) {
    const nonce = Date.now().toString();
    const postData = `nonce=${nonce}&` + new URLSearchParams(params).toString();
    const path = `/0/private/${endpoint}`;
    const signature = await this.generateKrakenSignature(path, nonce, postData, credentials.private_key);
    const response = await fetch(`https://api.kraken.com${path}`, { /* ... */ });
    return await response.json();
  }

  async getAccountBalance(user_id: string, userToken: string): Promise<any> {
    const credentials = await this.getKrakenCredentials(user_id, userToken);
    const result = await this.krakenRequest('Balance', {}, credentials);
    if (result.error && result.error.length > 0) {
      throw new Error(`Kraken Balance Error: ${result.error.join(', ')}`);
    }
    return result.result;
  }

  async placeOrder(orderRequest: OrderRequest, userToken: string): Promise<any> {
    // ... kill switch, idempotency check ...
    const credentials = await this.getKrakenCredentials(orderRequest.user_id, userToken);
    const krakenParams = {
      pair: this.mapSymbolToKraken(orderRequest.symbol),
      type: orderRequest.side,
      ordertype: orderRequest.type,
      volume: orderRequest.quantity.toString(),
    };
    const result = await this.krakenRequest('AddOrder', krakenParams, credentials);
    // ... error handling, store order ...
  }
}
```

#### After

```ts
import {
  type BrokerAdapter,
  type BrokerCredentials,
  type OrderRequest as BrokerOrderRequest,
  emitBrokerAudit,
} from '../_shared/broker/mod.ts';

class LiveTradingEngine {
  private supabase;
  private broker: BrokerAdapter;

  constructor(broker: BrokerAdapter) {
    this.supabase = createClient(/* ... */);
    this.broker = broker;
  }

  async getAccountBalance(credentials: BrokerCredentials): Promise<AccountBalances> {
    const result = await this.broker.getBalances(credentials);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to fetch account balance');
    }
    return result.data;
  }

  async placeOrder(
    orderRequest: LocalOrderRequest,   // your existing interface
    credentials: BrokerCredentials,
    userToken: string
  ): Promise<any> {
    // Kill switch and idempotency checks remain UNCHANGED
    await this.checkKillSwitch(orderRequest.user_id);
    // ... idempotency check ...

    // Map to the canonical OrderRequest
    const brokerOrder: BrokerOrderRequest = {
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type === 'stop-loss' ? 'stop_loss'
          : orderRequest.type === 'take-profit' ? 'take_profit'
          : orderRequest.type,
      quantity: orderRequest.quantity,
      price: orderRequest.price,
      stopPrice: orderRequest.stop_price,
      timeInForce: orderRequest.time_in_force,
      clientOrderId: orderRequest.client_order_id,
    };

    const result = await this.broker.placeOrder(credentials, brokerOrder);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Order placement failed');
    }

    // Store order in database -- map canonical Order back to your schema
    await this.storeOrder({
      user_id: orderRequest.user_id,
      kraken_order_id: result.data.brokerOrderId,
      client_order_id: result.data.clientOrderId,
      symbol: result.data.symbol,
      side: result.data.side,
      type: result.data.type,
      quantity: result.data.quantity,
      price: result.data.price ?? 0,
      created_at: result.data.createdAt,
    });

    return {
      success: true,
      order_id: result.data.brokerOrderId,
      order_data: result.data,
    };
  }

  async getMarketPrice(symbol: string): Promise<number> {
    const result = await this.broker.getMarketData(symbol);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to fetch market price');
    }
    return result.data.lastPrice;
  }

  // getOpenOrders, getOrderHistory, cancelOrder follow the same pattern
}

// In the serve() handler, create the engine with the adapter:
const krakenAdapter = new KrakenBrokerAdapter();
const tradingEngine = new LiveTradingEngine(krakenAdapter);
```

---

### 3c. reconciliation-engine/index.ts

The reconciliation engine has its own inline `krakenPrivateRequest`,
`sha256`, `base64ToBytes`, `bytesToBase64`, and `extractKrakenUsdBalance`
functions. These are all subsumed by `KrakenBrokerAdapter.getBalances()`.

#### Before

```ts
// 70+ lines of Kraken API signing, parsing, and balance extraction
const creds = await getKrakenCredentials(userId, token);
const krakenResult = await krakenPrivateRequest('Balance', {}, creds.api_key, creds.private_key);
const krakenUsd = extractKrakenUsdBalance(krakenResult.result);
```

#### After

```ts
import { KrakenBrokerAdapter, type BrokerCredentials } from '../_shared/broker/mod.ts';

const krakenAdapter = new KrakenBrokerAdapter();

// Inside run_reconciliation:
const creds = await getPerUserCredentials(userId, token);
const brokerCreds: BrokerCredentials = {
  brokerId: 'kraken',
  apiKey: creds.api_key,
  apiSecret: creds.private_key,
};

const balanceResult = await krakenAdapter.getBalances(brokerCreds);
if (!balanceResult.success || !balanceResult.data) {
  // Handle error -- log and skip reconciliation cycle
  console.error('Kraken balance fetch failed:', balanceResult.error);
  return;
}

const krakenUsd = balanceResult.data.totalEquityUsd;
// ... compare against internal wallet balance, same logic as before ...
```

This lets you delete the inline `krakenPrivateRequest`, `sha256`,
`base64ToBytes`, `bytesToBase64`, and `extractKrakenUsdBalance` functions
entirely. The `getKrakenCredentials` helper can stay (it fetches per-user
credentials from `secure-credentials`), but its return type should be mapped
to `BrokerCredentials`.

---

### 3d. Paper Trading Path

Paper trading currently has inline simulation logic in `trading-bot/index.ts`
(the `execute_trade` case, `botConfig.mode === 'paper'` branch). The
`PaperBrokerAdapter` replaces this with a proper adapter that:

- Uses real market prices (via `setMarketDataProvider`)
- Simulates fills with realistic fee estimation
- Returns canonical `Order` objects

#### Before

```ts
if (botConfig.mode === 'paper') {
  const stopLossPrice = latestSignal.price * (1 - riskEval.stopLossPct);
  const takeProfitPrice = latestSignal.price * (1 + riskEval.takeProfitPct);
  const position = {
    user_id: userId,
    symbol,
    side: latestSignal.signal_type,
    quantity: riskEval.positionSize,
    entry_price: latestSignal.price,
    // ...
  };
  await supabase.from('trading_positions').insert(position);
  // ...
}
```

#### After

```ts
if (botConfig.mode === 'paper') {
  const paperBroker = brokerRegistry.get('paper') as PaperBrokerAdapter;
  if (!paperBroker) {
    throw new Error('Paper broker not registered');
  }

  // Place order through the adapter
  const orderReq: OrderRequest = {
    symbol,
    side: latestSignal.signal_type as 'buy' | 'sell',
    type: 'market',
    quantity: riskEval.positionSize,
  };

  const orderResult = await paperBroker.placeOrder(
    { brokerId: 'paper', apiKey: '', apiSecret: '' },  // Paper needs no real creds
    orderReq
  );

  if (!orderResult.success || !orderResult.data) {
    return new Response(JSON.stringify({ error: orderResult.error }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const filledOrder = orderResult.data;
  const entryPrice = filledOrder.averageFillPrice ?? latestSignal.price;
  const stopLossPrice = entryPrice * (1 - riskEval.stopLossPct);
  const takeProfitPrice = entryPrice * (1 + riskEval.takeProfitPct);

  // Persist to database -- same schema as before
  const position = {
    user_id: userId,
    symbol,
    side: latestSignal.signal_type,
    quantity: filledOrder.quantity,
    entry_price: entryPrice,
    stop_loss: stopLossPrice,
    take_profit: takeProfitPrice,
    strategy_used: latestSignal.strategy_type,
    risk_amount: balance * (riskEval.stopLossPct ?? 0.02),
    status: 'open',
  };

  const { data: posData, error: posErr } = await supabase
    .from('trading_positions')
    .insert(position)
    .select('id')
    .single();

  // ... rest of executed_trades insert and audit logging unchanged ...
}
```

The critical insight: **the database persistence layer does not change**. The
adapter handles order execution and returns a canonical `Order`. You map that
back into your existing DB schema. The `trading_positions` and
`executed_trades` tables are untouched.

---

## 4. Testing at Each Step

### 4.1 After each function migration

```bash
# Run the full test suite
npx vitest run

# Run security tests specifically (they check auth, kill switch, etc.)
npx vitest run src/test/security/

# Diff against your baseline output from step 2.1
```

### 4.2 Verify paper mode still works

After migrating each function:

1. Deploy to a staging environment (or run locally with `supabase functions serve`).
2. Generate a paper signal:
   ```
   POST /functions/v1/trading-bot
   { "action": "generate_paper_signal", "symbol": "XBTUSD" }
   ```
3. Execute a paper trade:
   ```
   POST /functions/v1/trading-bot
   { "action": "execute_trade", "symbol": "XBTUSD" }
   ```
4. Verify in the database:
   - `strategy_signals` has a new row
   - `trading_positions` has a new open position
   - `executed_trades` has a new entry
   - `audit_log` has `PAPER_TRADE_EXECUTED`

### 4.3 Verify adapter contract compliance

Write a contract test for each adapter. The test calls every `BrokerAdapter`
method and asserts the return shape matches the canonical types:

```ts
import { KrakenBrokerAdapter } from '../_shared/broker/adapters/kraken.ts';
import { PaperBrokerAdapter } from '../_shared/broker/adapters/paper.ts';

for (const adapter of [new KrakenBrokerAdapter(), new PaperBrokerAdapter()]) {
  describe(`${adapter.brokerName} contract`, () => {
    it('getCapabilities returns valid structure', () => {
      const caps = adapter.getCapabilities();
      expect(caps.brokerId).toBe(adapter.brokerId);
      expect(caps.supportedAssetClasses.length).toBeGreaterThan(0);
      expect(caps.supportedOrderTypes.length).toBeGreaterThan(0);
    });

    it('getMarketData returns a Ticker', async () => {
      const result = await adapter.getMarketData('BTCUSD');
      if (result.success) {
        expect(result.data).toHaveProperty('lastPrice');
        expect(result.data).toHaveProperty('symbol');
        expect(typeof result.data!.lastPrice).toBe('number');
      }
    });

    it('placeOrder returns an Order', async () => {
      const dummyCreds = { brokerId: adapter.brokerId, apiKey: 'test', apiSecret: 'test' };
      const order = { symbol: 'BTCUSD', side: 'buy' as const, type: 'market' as const, quantity: 0.001 };
      const result = await adapter.placeOrder(dummyCreds, order);
      // Paper adapter should succeed; Kraken adapter will fail without real creds
      if (result.success) {
        expect(result.data).toHaveProperty('id');
        expect(result.data).toHaveProperty('brokerOrderId');
        expect(result.data).toHaveProperty('status');
      }
    });

    it('healthCheck returns BrokerHealth', async () => {
      const result = await adapter.healthCheck();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('latencyMs');
    });
  });
}
```

### 4.4 Verify the registry selects correctly

```ts
import { BrokerRegistry, KrakenBrokerAdapter, PaperBrokerAdapter } from '../_shared/broker/mod.ts';

describe('BrokerRegistry selection', () => {
  const registry = new BrokerRegistry();
  registry.register(new KrakenBrokerAdapter(), 10);
  registry.register(new PaperBrokerAdapter(), 100);

  it('selects paper adapter when requirePaperTrading is true', () => {
    const adapter = registry.select({ userId: 'test', requirePaperTrading: true });
    expect(adapter?.brokerId).toBe('paper');
  });

  it('selects kraken adapter by default for crypto', () => {
    const adapter = registry.select({ userId: 'test', assetClass: 'crypto' });
    expect(adapter?.brokerId).toBe('kraken');
  });

  it('selects preferred broker when specified', () => {
    const adapter = registry.select({ userId: 'test', preferredBrokerId: 'paper' });
    expect(adapter?.brokerId).toBe('paper');
  });
});
```

---

## 5. Rollback Plan

### 5.1 Keep old code behind a guard during transition

Do not delete old code immediately. Wrap both paths in a guard variable:

```ts
// At the top of the function
const USE_BROKER_ADAPTER = true;  // flip to false to revert instantly

// In the action handler
if (USE_BROKER_ADAPTER) {
  // New broker adapter path
  const result = await broker.getHistoricalData(symbol, 15, 100);
  // ...
} else {
  // Legacy Kraken-direct path (unchanged from before)
  const ohlcData = await krakenAPI.getOHLCData(symbol);
  // ...
}
```

### 5.2 Deploy cadence

1. Deploy with `USE_BROKER_ADAPTER = false` -- smoke test, confirm nothing is
   broken by the new imports alone.
2. Flip to `true` in a second deploy -- run the paper trading verification
   from section 4.2.
3. After 48 hours of clean paper trading with the new path, remove the old
   code and the guard.

### 5.3 If something goes wrong

- **Immediate**: Change `USE_BROKER_ADAPTER` to `false` and redeploy. This
  restores the exact previous behavior with zero code changes.
- **If the adapter code itself has import errors**: The old code paths do not
  import from `_shared/broker/`, so reverting the guard also eliminates the
  broken import chain.
- **If database schema differences surface**: The adapter returns canonical
  types, but your DB insert calls use your existing schema. If a field mapping
  is wrong, the insert will fail and you will see it in logs. Fix the mapping
  or revert.

---

## 6. Common Migration Patterns

### Pattern 1: Fetching market price

Before (direct Kraken public API):

```ts
const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenSymbol}`);
const data = await response.json();
if (data.error && data.error.length > 0) {
  throw new Error(`Failed to fetch market price: ${data.error.join(', ')}`);
}
const tickerData = Object.values(data.result)[0] as any;
const price = parseFloat(tickerData.c[0]);
```

After (broker adapter):

```ts
const result = await broker.getMarketData(symbol);  // symbol is canonical, e.g. 'BTCUSD'
if (!result.success || !result.data) {
  throw new Error(result.error ?? 'Failed to fetch market price');
}
const price = result.data.lastPrice;
```

Key differences:
- No manual symbol mapping (`BTCUSD` -> `XBTUSD`) -- the adapter handles it.
- No manual parsing of Kraken's array-based ticker format.
- Error handling uses `BrokerResult.success` instead of checking `data.error`.

---

### Pattern 2: Fetching account balance

Before (direct Kraken private API):

```ts
const nonce = Date.now().toString();
const postData = new URLSearchParams({ nonce }).toString();
const signature = await generateKrakenSignature('/0/private/Balance', nonce, postData, privateKey);

const response = await fetch('https://api.kraken.com/0/private/Balance', {
  method: 'POST',
  headers: {
    'API-Key': apiKey,
    'API-Sign': signature,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: postData,
});
const result = await response.json();
const usdBalance = parseFloat(result.result?.ZUSD ?? '0');
```

After (broker adapter):

```ts
const credentials: BrokerCredentials = { brokerId: 'kraken', apiKey, apiSecret: privateKey };
const result = await broker.getBalances(credentials);
if (!result.success || !result.data) {
  throw new Error(result.error ?? 'Failed to fetch balance');
}
const usdBalance = result.data.balances.find(b => b.currency === 'USD')?.total ?? 0;
const totalEquity = result.data.totalEquityUsd;
```

Key differences:
- No manual HMAC-SHA512 signing -- the adapter handles it internally.
- No mapping from `ZUSD` to `USD` or `XXBT` to `BTC` -- the adapter
  normalizes all currency names.
- Balance is returned as a structured array with `total`, `available`, and
  `locked` fields.

---

### Pattern 3: Placing an order

Before (direct Kraken private API):

```ts
const krakenParams = {
  pair: this.mapSymbolToKraken(symbol),      // 'BTCUSD' -> 'XBTUSD'
  type: side,                                 // 'buy' | 'sell'
  ordertype: orderType,                       // 'market' | 'limit'
  volume: quantity.toString(),
};
if (price) krakenParams.price = price.toString();

const result = await this.krakenRequest('AddOrder', krakenParams, credentials);
if (result.error?.length > 0) {
  throw new Error(`Order failed: ${result.error.join(', ')}`);
}
const orderId = result.result.txid[0];
```

After (broker adapter):

```ts
const orderReq: OrderRequest = {
  symbol: 'BTCUSD',        // canonical symbol, adapter maps to Kraken's XBTUSD
  side: 'buy',
  type: 'market',
  quantity: 0.001,
  price: undefined,         // not needed for market orders
  clientOrderId: crypto.randomUUID(),
};

const result = await broker.placeOrder(credentials, orderReq);
if (!result.success || !result.data) {
  throw new Error(result.error ?? 'Order placement failed');
}
const orderId = result.data.brokerOrderId;
const status = result.data.status;           // 'pending', 'filled', etc.
const fee = result.data.fee;                 // already parsed as number
```

Key differences:
- Order type names use underscores (`stop_loss`) instead of hyphens (`stop-loss`).
- Symbol mapping is automatic.
- The returned `Order` object has structured fields instead of raw Kraken JSON.
- `clientOrderId` maps to Kraken's `userref` internally.

---

### Pattern 4: Handling errors (BrokerResult pattern)

The adapter never throws. It always returns a `BrokerResult<T>`:

```ts
interface BrokerResult<T> {
  success: boolean;
  data?: T;
  error?: string;        // human-readable error
  brokerError?: string;  // raw broker error string (for debugging)
  retryable?: boolean;   // true if the error is transient
}
```

Standard error handling pattern:

```ts
const result = await broker.placeOrder(credentials, order);

if (!result.success) {
  // Log the full error for debugging
  console.error(`Broker error: ${result.error}`, result.brokerError);

  // Decide whether to retry
  if (result.retryable) {
    // Queue for retry (implementation-specific)
  }

  // Return a safe error to the client
  return new Response(JSON.stringify({ error: 'Order failed' }), {
    status: 502,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Safe to use result.data here
const order = result.data!;
```

---

### Pattern 5: Credential construction

Credentials are always passed explicitly, never stored inside the adapter:

```ts
// Fetch per-user encrypted credentials from secure-credentials (unchanged)
const rawCreds = await getPerUserKrakenCredentials(userId, token);

// Wrap in the canonical BrokerCredentials type
const credentials: BrokerCredentials = {
  brokerId: 'kraken',
  apiKey: rawCreds.apiKey,
  apiSecret: rawCreds.privateKey,
  // passphrase is only needed for brokers like Coinbase
  // sandbox flag can be set for test environments
};

// Pass to any adapter method that requires auth
const balance = await broker.getBalances(credentials);
const order = await broker.placeOrder(credentials, orderRequest);
```

---

## 7. Safety Rules

These rules are non-negotiable. Any migration step that violates them must be
reverted immediately.

### 7.1 Never reduce security

- **JWT authentication** must remain on every edge function. The broker
  abstraction does not replace auth -- it sits below the auth layer.
- **Per-user credentials** must continue to be fetched from `secure-credentials`.
  Adapters receive credentials as arguments. They never fetch or store them.
- **Cross-user access checks** (`requestedUserId !== user.id`) must remain in
  place. The adapter does not know about users.
- **Error responses** must never expose internal broker errors to the client.
  Use `BrokerResult.error` for logging, return generic messages to the caller.

### 7.2 Never bypass risk controls

- **Kill switch** (`bot_config.is_paused`) must be checked before any adapter
  call that places or modifies orders. This check lives in the edge function,
  not in the adapter.
- **Risk evaluation** (`RiskManager.evaluateRisk`) must run before
  `broker.placeOrder()`. The adapter does not enforce risk limits.
- **Cooldown system** (daily loss, circuit breaker, max drawdown) must remain
  unchanged. These are engine-level concerns, not broker concerns.
- **Readiness gate** (50 paper trades, no failed health checks, no
  discrepancies) must remain in place for live trading.

### 7.3 Never weaken audit logging

- Every call to `broker.placeOrder()` must be followed by an audit log entry
  via `emitBrokerAudit()` or the existing `auditLog()` function.
- Failed orders must be logged with at least `AuditSeverity.WARNING`.
- Broker selection and failover events must be logged with `BROKER_SELECTED`
  and `BROKER_FAILOVER` actions.
- The existing `audit.tradeExecuted()`, `audit.tradeFailed()`, and
  `audit.authFailure()` calls must not be removed or made conditional.

### 7.4 Never skip the dual-path transition

- Do not delete old code in the same commit that adds the new path.
- The `USE_BROKER_ADAPTER` guard (or equivalent) must exist for at least one
  deploy cycle.
- Both paths must be tested before the old path is removed.

### 7.5 Never change database schema during migration

- The broker adapter returns canonical types (`Order`, `Ticker`, `Position`).
  You must map these back to your existing DB schema at the edge function level.
- Do not add new columns or tables as part of a broker migration commit. Schema
  changes should be separate, independently reviewed migrations.

---

## Quick Reference: File Mapping

| Old Location | Replaced By | Notes |
|---|---|---|
| `trading-bot/index.ts` `KrakenAPI` class | `KrakenBrokerAdapter` | Remove inline class entirely |
| `trading-bot/index.ts` direct `fetch(kraken.com/...)` | `broker.getMarketData()` | In `generate_paper_signal` |
| `live-trading-engine/index.ts` `krakenRequest()` | `KrakenBrokerAdapter.privateRequest()` | All private API calls |
| `live-trading-engine/index.ts` `generateKrakenSignature()` | `KrakenBrokerAdapter` (internal) | Signing is encapsulated |
| `live-trading-engine/index.ts` `mapSymbolToKraken()` | `KrakenBrokerAdapter` (internal) | Symbol mapping is encapsulated |
| `live-trading-engine/index.ts` `getAssetKey()` | `KrakenBrokerAdapter` (internal) | Asset key mapping is encapsulated |
| `reconciliation-engine/index.ts` `krakenPrivateRequest()` | `KrakenBrokerAdapter.getBalances()` | Plus all crypto helpers |
| `reconciliation-engine/index.ts` `extractKrakenUsdBalance()` | `AccountBalances.totalEquityUsd` | Built into return type |
| Inline paper trade simulation | `PaperBrokerAdapter.placeOrder()` | Returns canonical `Order` |

---

## Migration Checklist

Use this checklist to track progress. Each box must be checked before moving to
the next function.

### trading-bot/index.ts
- [ ] Import broker layer at module level
- [ ] Register KrakenBrokerAdapter and PaperBrokerAdapter
- [ ] Add `USE_BROKER_ADAPTER` guard
- [ ] Migrate `analyze_market` action
- [ ] Migrate `generate_paper_signal` action
- [ ] Migrate `execute_trade` paper path
- [ ] Migrate `generate_signal` fallback Kraken fetch
- [ ] Run full test suite -- all pass
- [ ] Verify paper trading end-to-end
- [ ] Deploy with guard = false, smoke test
- [ ] Deploy with guard = true, verify 48 hours
- [ ] Remove old code and guard

### live-trading-engine/index.ts
- [ ] Inject BrokerAdapter into LiveTradingEngine constructor
- [ ] Replace `krakenRequest` calls with adapter methods
- [ ] Remove inline Kraken signing code
- [ ] Remove `mapSymbolToKraken` and `getAssetKey`
- [ ] Run full test suite -- all pass
- [ ] Verify live-trading-engine actions via staging
- [ ] Deploy with guard = false, smoke test
- [ ] Deploy with guard = true, verify 48 hours
- [ ] Remove old code and guard

### reconciliation-engine/index.ts
- [ ] Replace `krakenPrivateRequest` with `KrakenBrokerAdapter.getBalances()`
- [ ] Remove inline crypto helpers
- [ ] Remove `extractKrakenUsdBalance` -- use `totalEquityUsd`
- [ ] Run full test suite -- all pass
- [ ] Verify reconciliation runs cleanly in staging
- [ ] Deploy and verify
- [ ] Remove old code
