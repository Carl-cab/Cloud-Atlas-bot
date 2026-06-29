# Phase 2: Broker Adapter Wiring Report

## Summary

Phase 2 wires the broker abstraction layer (built in Phase 1) into the runtime
edge functions behind a feature flag. When `USE_BROKER_ADAPTERS=true`, the
adapter path executes. When the flag is false or missing, all existing behavior
is preserved exactly as before.

## Files Changed

### New Files

| File | Purpose |
|---|---|
| `supabase/functions/_shared/featureFlags.ts` | Feature flag module (`useBrokerAdapters()`) |
| `src/test/security/broker-wiring.test.ts` | 29 Phase 2 integration tests |
| `PHASE2_BROKER_WIRING_REPORT.md` | This report |

### Modified Files

| File | Changes |
|---|---|
| `supabase/functions/trading-bot/index.ts` | Added adapter imports, registry init, dual-path in `analyze_market` and `generate_paper_signal`, ORDER_SIMULATED audit on paper trades |
| `supabase/functions/live-trading-engine/index.ts` | Added adapter imports, registry init, `getKrakenCredentialsBridge()`, dual-path in `get_balance`, `get_open_orders`, `get_order_history`, `get_market_price` |
| `supabase/functions/reconciliation-engine/index.ts` | Added adapter imports, registry init, dual-path in `run_reconciliation` (KrakenBrokerAdapter.getBalances), RECONCILIATION_STARTED/SKIPPED/COMPLETED audit events |
| `supabase/functions/_shared/broker/audit.ts` | Added 5 new audit actions: BROKER_ADAPTER_FALLBACK, ORDER_SIMULATED, RECONCILIATION_STARTED, RECONCILIATION_SKIPPED, RECONCILIATION_COMPLETED |

## Adapter Paths Wired

### trading-bot/index.ts

| Action | Flag OFF (Legacy) | Flag ON (Adapter) |
|---|---|---|
| `analyze_market` | Inline KrakenAPI.getOHLCData() | KrakenBrokerAdapter.getHistoricalData() |
| `generate_paper_signal` | Direct fetch to api.kraken.com | PaperBrokerAdapter.getMarketData() (delegates to Kraken public API via setMarketDataProvider) |
| `execute_trade` (paper) | Unchanged (DB insert) | Same + ORDER_SIMULATED audit event |
| `execute_trade` (live) | HTTP 501 hard block | HTTP 501 hard block (unchanged) |

### live-trading-engine/index.ts

| Action | Flag OFF (Legacy) | Flag ON (Adapter) |
|---|---|---|
| `get_balance` | LiveTradingEngine.getAccountBalance() | KrakenBrokerAdapter.getBalances() |
| `get_open_orders` | LiveTradingEngine.getOpenOrders() | KrakenBrokerAdapter.getOpenOrders() |
| `get_order_history` | LiveTradingEngine.getOrderHistory() | KrakenBrokerAdapter.getClosedOrders() |
| `get_market_price` | LiveTradingEngine.getMarketPrice() | KrakenBrokerAdapter.getMarketData() |
| `place_order` | Unchanged (live order with audit) | Unchanged (NOT wired to adapter) |

### reconciliation-engine/index.ts

| Action | Flag OFF (Legacy) | Flag ON (Adapter) |
|---|---|---|
| `run_reconciliation` | krakenPrivateRequest('Balance') + extractKrakenUsdBalance() | KrakenBrokerAdapter.getBalances().totalEquityUsd |
| Paper mode skip | Logs to reconciliation_log | Same + RECONCILIATION_SKIPPED audit event |
| Successful reconciliation | Logs RECONCILIATION_OK | Same + RECONCILIATION_COMPLETED audit event |

## Feature Flag Behavior

- **Flag name**: `USE_BROKER_ADAPTERS`
- **Source**: Environment variable, read via `useBrokerAdapters()` from `_shared/featureFlags.ts`
- **Default**: `false` (OFF) -- all existing behavior preserved
- **Activation**: Set `USE_BROKER_ADAPTERS=true` in the Supabase Edge Functions environment
- **Scope**: Per-request (checked at runtime, not cached across requests)

## Tests Added

29 tests in `src/test/security/broker-wiring.test.ts`:

1. **Feature Flag Behavior** (3 tests): flag OFF preserves legacy, flag ON activates adapter, default is OFF
2. **PaperBrokerAdapter in Paper Mode** (4 tests): market data without Kraken calls, unknown symbols, paper order isolation, multi-asset support
3. **KrakenBrokerAdapter Symbol Mapping** (3 tests): BTCUSD to XBTUSD mapping, reverse mapping, canonical symbol in responses
4. **Missing Broker Credentials** (2 tests): clean error response, no internal detail exposure
5. **Reconciliation Paper Mode** (3 tests): skip on no wallet, skip on no credentials, audit event emission
6. **Live Order Placement Remains Blocked** (2 tests): readiness gate enforced, HTTP 501 hard block
7. **Audit Events** (6 tests): BROKER_SELECTED, MARKET_DATA_FETCHED, ORDER_SIMULATED, BROKER_ADAPTER_FALLBACK, RECONCILIATION_COMPLETED, no events when flag OFF
8. **Fallback Path** (3 tests): legacy works when adapter fails, adapter failure handled gracefully, dual-path routes correctly
9. **Security Invariants** (3 tests): no credentials in responses, paper adapter credential-free, bridge doesn't leak secrets

## Commands Run

```bash
npx vitest run src/test/security/     # 121 tests passed (29 new + 92 existing)
npm run build                          # Production build successful
npm run lint                           # No new lint errors introduced
```

## Known Risks

1. **Adapter market data differences**: The KrakenBrokerAdapter's `getHistoricalData()` returns OHLCV objects while the legacy path returns raw Kraken arrays. The MLEngine and RegimeDetector access `.close`, `.volume` etc. which works correctly with OHLCV objects but was unreliable with raw arrays. The adapter path is actually more correct.

2. **Credential bridge**: The `getKrakenCredentialsBridge()` method in live-trading-engine transforms credentials from the legacy format (`api_key`/`private_key`) to the adapter format (`apiKey`/`apiSecret`). Credential handling remains per-user via secure-credentials.

3. **place_order NOT wired**: Intentionally not wired to the adapter. Live order placement remains exactly as before with all existing safety controls (kill switch, idempotency, audit logging). This will be addressed in a future phase after the adapter path is proven stable for read operations.

## Rollback Plan

1. **Immediate rollback**: Remove or unset `USE_BROKER_ADAPTERS` environment variable. All code paths fall back to the legacy implementation.
2. **No deployment needed for rollback**: The feature flag is checked at runtime per-request.
3. **Code rollback**: Revert to commit `89b4c4f` (the Phase 1 + docs commit) -- all adapter wiring changes are in a single commit.

## Confirmations

- **Live trading remains disabled**: The HTTP 501 hard block in `execute_trade` is unchanged. The `place_order` action in live-trading-engine is NOT wired to the adapter. All existing kill switch, readiness gate, and risk management controls are preserved.

- **Paper trading remains default**: `bot_config.mode` defaults to `'paper'`. The PaperBrokerAdapter is wired for market data only (price lookups). Paper trade execution (position insert, executed_trades insert) uses the same DB path as before.

- **No real orders were placed**: All changes are behind a feature flag that defaults to OFF. Even with the flag ON, the adapter path only handles read operations (balances, market data, order history). Order placement is not wired.

- **No risk controls weakened**: All 7 risk evaluation layers remain active (kill switch, daily loss limit, max drawdown, circuit breaker, max positions, mandatory stop-loss, position sizing). The cooldown system, audit logging, and Telegram notifications are unchanged.

- **No audit logging weakened**: All existing audit events (TRADE_REJECTED, PAPER_TRADE_EXECUTED, RECONCILIATION_OK, etc.) remain. 5 new broker-specific audit events added.
