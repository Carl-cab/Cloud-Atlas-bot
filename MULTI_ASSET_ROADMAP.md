# Multi-Asset Trading Roadmap

Cloud Atlas Bot evolution from crypto-only to multi-asset, multi-broker trading.

---

## Phase 1: Broker Abstraction Layer [COMPLETED]

**Goal:** Establish a clean broker-agnostic interface so the trading engine never sees Kraken-specific (or any broker-specific) types, symbols, or API calls.

### What was delivered

- **`BrokerAdapter` interface** (`supabase/functions/_shared/broker/adapter.ts`) -- 14 methods covering lifecycle, account, market data, orders, positions, trade history, fees, and capability queries. Adapters must never throw; all results wrapped in `BrokerResult<T>`.
- **Canonical domain types** (`broker/types.ts`) -- `AssetClass` union (`crypto | stock | etf | forex | option | future | metal`), plus `OrderRequest`, `Order`, `Position`, `AccountBalances`, `Ticker`, `OHLCV`, `Trade`, `FeeEstimate`, `BrokerHealth`, `BrokerCapabilities`, `BrokerCredentials`.
- **`KrakenBrokerAdapter`** (`broker/adapters/kraken.ts`) -- Full implementation: API signing, symbol mapping (XBTUSD/ZUSD normalization), balance translation, order placement/cancellation/status, market data, historical candles, fee estimation. Declares `supportedAssetClasses: ['crypto']`.
- **`PaperBrokerAdapter`** (`broker/adapters/paper.ts`) -- Simulated execution using real market data (injectable provider). Declares support for all seven asset classes. Generates synthetic prices for well-known symbols (BTC, ETH, AAPL, SPY, etc.).
- **`BrokerRegistry`** (`broker/registry.ts`) -- Central registry with `register()`, `select(criteria)`, `failover()`, `healthCheckAll()`, `findByAssetClass()`. Selection considers user preference, asset class, symbol support, health status, and priority.
- **Audit integration** (`broker/audit.ts`) -- `emitBrokerAudit()` emitting structured events (`ORDER_SUBMITTED`, `BROKER_FAILOVER`, etc.) through the existing `auditLogger`.
- **Barrel module** (`broker/mod.ts`) -- Single import point for all broker types, adapters, and registry.
- **Database migration** (`20260620000007_broker_abstraction.sql`) -- Eight new tables: `broker_accounts`, `broker_capabilities`, `broker_health`, `broker_orders`, `broker_positions`, `broker_balances`, `broker_transactions`, `broker_failures`. RLS policies, indexes, and seed data for Kraken + Paper.
- **Contract tests** (`src/test/security/broker-adapter.test.ts`) -- Validates `BrokerResult` shapes, capability reporting, and order lifecycle invariants.

### Current state

The abstraction layer exists but is not yet wired in. All three core edge functions (`trading-bot`, `live-trading-engine`, `reconciliation-engine`) still call the Kraken API directly with inline signing logic and hardcoded symbol mappings. The new `broker_*` tables are created but unused.

---

## Phase 2: Wire Adapters into Existing Code [NEXT]

**Goal:** Replace all direct Kraken API calls in the trading pipeline with `BrokerAdapter` method calls routed through the `BrokerRegistry`. After this phase, no edge function outside `broker/adapters/kraken.ts` should import anything from `api.kraken.com`.

### What this includes

1. **`trading-bot/index.ts` refactor**
   - Remove the inline `KrakenAPI` class (currently ~50 lines of duplicated API signing).
   - At function startup, initialize the `BrokerRegistry`, register `KrakenBrokerAdapter` and `PaperBrokerAdapter`.
   - Replace `getOHLCData()` calls with `adapter.getHistoricalData(symbol, interval)`.
   - Replace `getAccountBalance()` with `adapter.getBalances(credentials)`.
   - Replace `addOrder()` with `adapter.placeOrder(credentials, orderRequest)`.
   - Map the existing `getPerUserKrakenCredentials()` output to `BrokerCredentials`.
   - Use `brokerRegistry.select({ userId, assetClass: 'crypto', requirePaperTrading: mode === 'paper' })` to pick the right adapter based on `bot_config.mode`.

2. **`live-trading-engine/index.ts` refactor**
   - Remove the `LiveTradingEngine` class's inline Kraken signature generation and private `krakenRequest()` method.
   - Accept a `broker_id` parameter (defaulting to `'kraken'` for backward compatibility).
   - Delegate `placeOrder`, `cancelOrder`, `getMarketPrice`, `getOpenOrders`, `getClosedOrders` to `KrakenBrokerAdapter`.
   - Preserve the existing idempotency logic (`client_order_id` dedup) -- it wraps the adapter call, not the other way around.
   - Write order results to both `executed_trades` (backward compat) and `broker_orders` (new schema) during the transition period.

3. **`reconciliation-engine/index.ts` refactor**
   - Replace the inline `krakenPrivateRequest()` + `ZUSD`/`ZCAD` extraction with `adapter.getBalances(credentials)`.
   - The adapter already normalizes Kraken's `ZUSD` to `USD`, so the reconciliation logic simplifies.
   - Look up the user's broker from `broker_accounts` table (falling back to `'kraken'` if no row exists).
   - Write balance snapshots to `broker_balances` in addition to the existing `reconciliation_log`.

4. **Paper trading path**
   - When `bot_config.mode === 'paper'`, the registry returns `PaperBrokerAdapter`.
   - Inject Kraken's `getMarketData` as the paper adapter's market data provider so paper trades use real prices.
   - Paper orders go through the same `adapter.placeOrder()` code path -- the adapter handles simulation internally.

5. **Credential mapping**
   - Create a helper `toBrokerCredentials(brokerId, apiKey, apiSecret)` that maps the existing `secure-credentials` output to the `BrokerCredentials` type.
   - Store the user's active broker in `broker_accounts` so future phases can support multiple brokers per user.

### Key technical challenges

- **Dual-write period:** During migration, orders must be written to both `executed_trades` and `broker_orders`. A cleanup migration later removes the dual-write once the dashboard reads from `broker_orders`.
- **Error mapping:** The existing error handling in `trading-bot/index.ts` catches Kraken-specific error strings (e.g., `"EOrder:Insufficient funds"`). These must be mapped to generic errors inside the adapter, not in the engine.
- **Test coverage:** The inline Kraken API class in `trading-bot/index.ts` has no unit tests. Refactoring to use the adapter (which has contract tests) improves testability, but the refactor itself needs integration tests verifying the full signal-to-trade pipeline.
- **Zero downtime:** The refactor must be deployable without a maintenance window. The `broker_id` column defaults to `'kraken'`, and the code falls back to Kraken if no `broker_accounts` row exists.

### Dependencies

- Phase 1 (completed).

---

## Phase 3: Alpaca Adapter -- Stock and ETF Trading

**Goal:** Enable trading of US stocks and ETFs through Alpaca Markets, making Cloud Atlas Bot a true multi-asset platform.

### What this includes

1. **`AlpacaBrokerAdapter`** (`broker/adapters/alpaca.ts`)
   - Implement all 14 `BrokerAdapter` methods against Alpaca's REST API v2.
   - `brokerId: 'alpaca'`, `supportedAssetClasses: ['stock', 'etf']`.
   - Support both Alpaca paper and live environments (controlled by `BrokerCredentials.sandbox`).

2. **Symbol mapping**
   - Alpaca uses plain tickers (`AAPL`, `SPY`) -- simpler than Kraken's `XXBT`/`ZUSD` mess, but the adapter still needs to validate symbols against Alpaca's asset list.
   - Add an `AssetInfo` lookup method or cache that resolves `AAPL` to `{ assetClass: 'stock', baseCurrency: 'AAPL', quoteCurrency: 'USD', minQuantity: 0.001, ... }`.
   - Handle ETF identification (Alpaca tags assets with `class: 'us_equity'` -- need to distinguish ETFs from stocks using the `exchange` or asset metadata).

3. **Market hours handling**
   - Crypto trades 24/7; stocks do not. The adapter must expose market hours and the engine must respect them.
   - Add `getMarketHours()` to the `BrokerAdapter` interface (optional method or capability flag).
   - Pre-market (4:00-9:30 ET) and after-hours (16:00-20:00 ET) support via Alpaca's extended hours flag.
   - The signal generation engine must skip stock signals outside trading windows, or queue them for market open.

4. **Fractional shares**
   - Alpaca supports fractional shares (e.g., 0.5 shares of AAPL). The `OrderRequest.quantity` field already uses `number`, but `AssetInfo.quantityStep` needs to reflect fractional minimums.
   - Update paper adapter to respect `quantityStep` per asset class.

5. **Alpaca-specific features**
   - Day trade pattern (PDT) detection: flag accounts with < $25k equity that are approaching 3 day trades in 5 days.
   - Alpaca's `notional` order parameter (order by dollar amount instead of quantity).

6. **Database updates**
   - Seed `broker_capabilities` with Alpaca's capabilities.
   - The existing `broker_accounts` table already supports `broker_id = 'alpaca'`.

7. **Credential management**
   - Extend `secure-credentials` to store Alpaca API key + secret alongside Kraken credentials.
   - Alpaca uses a simpler auth model (API key + secret in headers, no HMAC signing), so the adapter is significantly less complex than Kraken's.

### Key technical challenges

- **Market hours awareness throughout the stack:** The scheduler, signal engine, and risk engine all currently assume 24/7 operation. Adding market hours means rethinking the scheduler's cron timing and the risk engine's "stale price" detection.
- **Settlement:** Stocks have T+1 settlement. The balance shown by `getBalances()` may differ from buying power due to unsettled funds. The adapter needs to surface `available` vs `total` accurately.
- **Different fee structures:** Alpaca is commission-free for stocks but charges for options. The `estimateFees()` method returns zero fees for equity, which changes the risk engine's position sizing math.
- **Rate limits:** Alpaca allows 200 requests/minute (vs Kraken's ~15/minute for private endpoints). The adapter should expose this through `BrokerCapabilities.maxOrdersPerSecond`.

### Dependencies

- Phase 2 (adapters wired in). Without Phase 2, there is no code path for a second adapter to plug into.

---

## Phase 4: Interactive Brokers (IBKR) Adapter -- Options, Futures, Forex

**Goal:** Add Interactive Brokers support for advanced asset classes: options, futures, forex, and metals. This is the most complex adapter due to IBKR's API surface.

### What this includes

1. **`IBKRBrokerAdapter`** (`broker/adapters/ibkr.ts`)
   - Implement against IBKR's Client Portal API (REST) or TWS API (WebSocket).
   - `brokerId: 'ibkr'`, `supportedAssetClasses: ['stock', 'etf', 'option', 'future', 'forex', 'metal']`.
   - IBKR's Client Portal API requires a running gateway process; the adapter must handle session management (login, reauthentication, session keepalive).

2. **Options support**
   - Extend `OrderRequest` with optional options-specific fields: `strike`, `expiration`, `optionType` (`call` | `put`), `contractMultiplier`.
   - Options symbols follow OCC format (`AAPL230120C00150000`) -- the adapter maps to/from a human-readable format.
   - Greeks (delta, gamma, theta, vega) needed for risk management. Add an optional `getOptionChain()` method or separate interface.

3. **Futures support**
   - Futures have contract expiration, rollover dates, and margin requirements.
   - Symbol format includes contract month (e.g., `ESZ4` for S&P 500 Dec 2024).
   - Add contract specification lookup (tick size, contract value, margin requirements).

4. **Forex support**
   - Forex pairs (EUR/USD, GBP/USD) are already representable with `baseCurrency`/`quoteCurrency` in `AssetInfo`.
   - IBKR forex has specific lot sizes and leverage requirements.
   - 24/5 trading hours (Sunday 5PM - Friday 5PM ET).

5. **Complex order types**
   - IBKR supports bracket orders, OCO (one-cancels-other), trailing stops, and algorithmic order types.
   - Extend the `OrderType` union or add a `complexOrderType` field. Keep the base `OrderType` simple; IBKR-specific complexity stays in the adapter.

6. **Margin trading**
   - IBKR's margin model is more complex than crypto exchanges. The adapter must surface margin requirements, buying power, and maintenance margin.
   - Add `getMarginRequirements(symbol)` to the adapter interface (optional, gated by `BrokerCapabilities.supportsMarginTrading`).

### Key technical challenges

- **Session management:** IBKR's Client Portal API requires periodic reauthentication. The edge function (stateless by nature) must handle this -- likely by storing session tokens in the database and refreshing them.
- **API complexity:** IBKR's API is notoriously complex with hundreds of endpoints. The adapter should implement only the subset needed for the `BrokerAdapter` interface, not the full API.
- **Paper vs live:** IBKR has a separate paper trading account with different credentials. The adapter needs to route to the correct endpoint based on `BrokerCredentials.sandbox`.
- **Gateway dependency:** The Client Portal API requires a gateway process. In a Supabase Edge Function (Deno), running a local gateway is not possible. Options: (a) use IBKR's hosted gateway if available, (b) run the gateway as a separate service and proxy through it, or (c) use the newer IBKR REST API if it reaches feature parity.
- **Type system expansion:** Adding options/futures fields to `OrderRequest` without breaking existing adapters. Use optional fields and validate at the adapter level.

### Dependencies

- Phase 2 (adapters wired in).
- Phase 3 is NOT required -- IBKR can be added in parallel with Alpaca. However, the market hours work from Phase 3 benefits IBKR as well.

---

## Phase 5: Multi-Asset Risk Management

**Goal:** Evolve the risk management engine from crypto-only rules to asset-class-aware, cross-asset portfolio risk.

### What this includes

1. **Asset-class-specific risk parameters**
   - Crypto: high volatility thresholds, 24/7 monitoring, exchange-specific risks.
   - Stocks/ETFs: PDT rules, settlement risk, earnings blackout periods, sector concentration limits.
   - Options: Greeks-based risk (delta exposure, gamma risk near expiration, theta decay thresholds), max loss per contract.
   - Futures: margin monitoring, rollover risk, contract expiration alerts.
   - Forex: leverage limits, pip-based stop losses, correlation with major pairs.

2. **Per-asset-class position sizing**
   - The current position sizing logic uses a single `max_position_pct`. Replace with a configurable table:
     ```
     crypto:  max 5% per position, max 30% total
     stock:   max 10% per position, max 60% total
     option:  max 2% per position, max 10% total
     future:  max 5% per position, max 20% total
     forex:   max 5% per position, max 25% total
     ```
   - Store in `bot_config` or a new `risk_parameters` table.

3. **Cross-asset correlation**
   - Track correlation between positions across asset classes (e.g., long BTC + long MSTR is correlated exposure).
   - Implement a correlation matrix (updated daily) that the risk engine checks before approving new positions.
   - Alert when portfolio correlation exceeds a threshold (too many correlated bets).

4. **Portfolio-level risk metrics**
   - Total portfolio Value at Risk (VaR) across all brokers and asset classes.
   - Max drawdown tracking per asset class and portfolio-wide.
   - Sharpe ratio calculation per strategy and asset class.

5. **Cross-broker exposure aggregation**
   - A user might be long BTC on Kraken and short BTC futures on IBKR. The risk engine must aggregate exposure across brokers.
   - Periodic cross-broker reconciliation: sum positions from all `broker_positions` rows for the user.

6. **Enhanced circuit breakers**
   - The current kill switch is binary (on/off). Add per-asset-class circuit breakers:
     - Crypto drawdown > 15% -- pause crypto trading.
     - Options loss > 5% of portfolio -- pause options trading.
     - Portfolio-wide drawdown > 10% -- global kill switch.

### Key technical challenges

- **Data aggregation across brokers:** Different brokers report positions and balances at different frequencies and in different formats. Even with the adapter abstraction normalizing the format, timing differences mean the aggregated view may be stale.
- **Correlation computation:** Computing a live correlation matrix across asset classes requires historical price data for all positions. This is computationally expensive for an edge function. Consider precomputing daily and caching in the database.
- **Options risk:** Greeks change non-linearly. A position that looks safe at open can become dangerous near expiration (gamma risk). The risk engine needs intraday Greeks updates for options positions.
- **Configuration complexity:** More asset classes means more knobs. The UI for configuring risk parameters must remain usable.

### Dependencies

- Phase 2 (adapters wired in -- risk engine reads from `broker_positions` and `broker_balances`).
- Phase 3 or 4 (at least one non-crypto adapter active to test multi-asset risk logic).

---

## Phase 6: Multi-Asset UI

**Goal:** Evolve the React dashboard from a crypto-only view to a multi-asset, multi-broker portfolio management interface.

### What this includes

1. **Asset class selector**
   - Add a top-level filter/tab for asset class: All, Crypto, Stocks, Options, Futures, Forex.
   - The trading signal view, position list, and P&L charts all respect this filter.
   - Symbol search autocomplete that spans all connected brokers.

2. **Broker account management**
   - Settings page for connecting/disconnecting broker accounts.
   - Per-broker credential entry (reusing the existing `secure-credentials` flow, extended for Alpaca and IBKR).
   - Broker health status indicators (green/yellow/red) using `broker_health` table data.
   - Enable/disable individual brokers without deleting credentials.

3. **Cross-broker portfolio view**
   - Unified portfolio dashboard aggregating positions, balances, and P&L across all brokers.
   - Pie chart: allocation by asset class and by broker.
   - Table: all open positions with broker, asset class, entry price, current price, P&L, and risk metrics.
   - Total equity across all accounts, with currency conversion where needed.

4. **Asset-class-specific views**
   - **Options:** Options chain viewer, Greeks display, P&L diagram for strategies (spreads, straddles).
   - **Futures:** Contract expiration calendar, rollover alerts, margin utilization.
   - **Forex:** Pip calculator, currency pair correlation heatmap.

5. **Enhanced order entry**
   - Broker selector in the order form (or auto-selected based on symbol).
   - Asset-class-specific order fields (strike/expiration for options, contract month for futures).
   - Fee preview using `adapter.estimateFees()`.

6. **Risk dashboard**
   - Portfolio VaR visualization.
   - Per-asset-class drawdown charts.
   - Correlation matrix heatmap.
   - Circuit breaker status per asset class.

### Key technical challenges

- **UI complexity:** Options and futures have inherently complex UIs. Building an options chain viewer that is both functional and usable is a significant design challenge. Consider shipping a minimal version first (just position display) before building interactive order entry.
- **Real-time updates:** The current dashboard polls Supabase. With multiple brokers, the number of data sources increases. Consider Supabase Realtime subscriptions on `broker_positions` and `broker_balances` tables.
- **State management:** The current `BotStateProvider` manages a single bot config. Multi-broker requires tracking config, credentials, and connection status per broker. Extend the context or introduce a dedicated `BrokerStateProvider`.
- **Mobile responsiveness:** More data density (multiple asset classes, multiple brokers) requires careful responsive design to remain usable on smaller screens.

### Dependencies

- Phase 2 (data reads from `broker_*` tables).
- Phase 5 (risk dashboard needs multi-asset risk metrics).
- Phase 3 or 4 for asset-class-specific views (no point building an options chain UI without IBKR adapter).

---

## Phase 7: Advanced Features

**Goal:** Leverage the multi-broker, multi-asset infrastructure for sophisticated trading capabilities.

### What this includes

1. **Cross-broker arbitrage detection**
   - Monitor price discrepancies for the same asset across brokers (e.g., BTC on Kraken vs crypto futures on IBKR).
   - Alert engine for arbitrage opportunities above a configurable threshold.
   - Semi-automated execution: present the opportunity, let the user confirm, then execute both legs atomically (or as close to atomically as possible).
   - Track arbitrage P&L separately from directional trading.

2. **Smart order routing**
   - When the user places an order, automatically select the best broker based on: price, fees, available balance, latency, and fill probability.
   - For assets available on multiple brokers (e.g., stocks on Alpaca and IBKR), compare bid/ask spreads and route to the better execution venue.
   - The `BrokerRegistry.select()` method already supports priority-based selection; extend it with real-time price comparison.
   - Implement a `SmartRouter` layer that sits between the trading engine and the registry.

3. **Multi-broker failover**
   - The `BrokerRegistry.failover()` method exists but is not yet used in the trading pipeline.
   - If Kraken goes down mid-session, automatically fail over to another crypto-capable broker (if one is connected).
   - If Alpaca goes down, fail over to IBKR for stock orders (with user consent, since IBKR may have different fee structures).
   - Implement configurable failover policies: automatic, manual-approval, or disabled per broker pair.
   - Health check polling (every 60 seconds) to detect outages proactively and update `RegisteredBroker.lastHealth`.

4. **Cross-asset strategy engine**
   - Pairs trading across asset classes (e.g., long gold ETF, short gold futures).
   - Hedging strategies: automatically open a hedge position when directional exposure exceeds a threshold.
   - Macro event-driven strategies: react to Fed rate decisions across forex, bonds, and equities simultaneously.

5. **Unified reporting**
   - Consolidated tax reporting across all brokers (realized gains, wash sales, cost basis).
   - Performance attribution: which asset class, strategy, and broker contributed to returns.
   - Extend `report-engine` to pull from `broker_transactions` instead of `executed_trades`.

### Key technical challenges

- **Arbitrage execution risk:** Cross-broker arbitrage requires near-simultaneous execution on two different APIs with different latencies. Partial fills on one leg create risk. Need a state machine to manage the lifecycle of multi-leg trades and handle partial failures.
- **Smart routing latency:** Comparing prices across brokers adds latency to order placement. For market orders where speed matters, the routing decision must be cached or pre-computed, not calculated at order time.
- **Failover correctness:** Failing over mid-trade is dangerous. If Kraken goes down after an order is submitted but before confirmation, the failover must first determine whether the original order was filled (which requires Kraken to come back up). Implement a "pending verification" state for orders submitted to a broker that subsequently went down.
- **Regulatory complexity:** Cross-broker strategies may have regulatory implications (e.g., wash sale rules across accounts). The reporting engine needs to track this.
- **Configuration overload:** Each feature adds configuration surface. Build sensible defaults and progressive disclosure -- advanced features should be opt-in, not visible by default.

### Dependencies

- Phase 2 (adapters wired in).
- Phase 3 and Phase 4 (at least two live brokers for arbitrage and failover to be meaningful).
- Phase 5 (cross-asset risk management must be in place before enabling cross-asset strategies).
- Phase 6 (UI for configuring and monitoring advanced features).

---

## Implementation Order and Parallel Work

```
Phase 1 [DONE] -----> Phase 2 [NEXT] -----> Phase 3 -----> Phase 6
                           |                    |               ^
                           |                    v               |
                           +-------------> Phase 4 ------> Phase 5
                           |                                    |
                           |                                    v
                           +------------------------------> Phase 7
```

- **Phases 3 and 4** can be developed in parallel after Phase 2 (they are independent adapter implementations).
- **Phase 5** needs at least one non-crypto adapter (Phase 3 or 4) for meaningful testing.
- **Phase 6** can start UI scaffolding (broker account management, asset class tabs) during Phase 3, but asset-class-specific views need the corresponding adapters.
- **Phase 7** requires the full stack (multiple brokers live + risk management + UI).

## Key Files Reference

| Component | Path |
|---|---|
| BrokerAdapter interface | `supabase/functions/_shared/broker/adapter.ts` |
| Domain types | `supabase/functions/_shared/broker/types.ts` |
| BrokerRegistry | `supabase/functions/_shared/broker/registry.ts` |
| Kraken adapter | `supabase/functions/_shared/broker/adapters/kraken.ts` |
| Paper adapter | `supabase/functions/_shared/broker/adapters/paper.ts` |
| Audit integration | `supabase/functions/_shared/broker/audit.ts` |
| Barrel module | `supabase/functions/_shared/broker/mod.ts` |
| DB migration | `supabase/migrations/20260620000007_broker_abstraction.sql` |
| Contract tests | `src/test/security/broker-adapter.test.ts` |
| Trading bot (to refactor) | `supabase/functions/trading-bot/index.ts` |
| Live engine (to refactor) | `supabase/functions/live-trading-engine/index.ts` |
| Reconciliation (to refactor) | `supabase/functions/reconciliation-engine/index.ts` |
