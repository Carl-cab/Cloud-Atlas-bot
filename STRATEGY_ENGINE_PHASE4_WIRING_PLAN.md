# Strategy Engine — Phase 4 Wiring Plan

**Status:** NOT APPROVED — requires explicit owner approval before implementation
**Prerequisites:** Phase 3 paper trading validation complete (7/7 distinct trading days, 8/8 monitor criteria)
**Author:** Cloud Atlas Principal Architect
**Date:** 2026-06-30

---

## 1. Overview

This document describes how to wire the Strategy Engine framework into the trading-bot runtime so that multiple strategies produce signals, the Signal Aggregator combines them, and the result feeds into the existing Risk Engine → Trading Engine → BrokerAdapter pipeline.

**The wiring is additive.** The existing signal generation path (`MLEngine.generateSignal`) continues to work via a feature flag. The Strategy Engine runs alongside it (or replaces it) based on configuration.

---

## 2. Feature Flag

Add a new feature flag in `supabase/functions/_shared/featureFlags.ts`:

```typescript
export function useStrategyEngine(): boolean {
  return Deno.env.get('USE_STRATEGY_ENGINE') === 'true';
}
```

**Default:** `false` — the Strategy Engine is OFF until explicitly enabled.

This mirrors the existing `useBrokerAdapters()` pattern. Both flags are independent:
- `USE_BROKER_ADAPTERS=true` + `USE_STRATEGY_ENGINE=false` → current behavior (paper trading with broker adapters, legacy signal generation)
- `USE_BROKER_ADAPTERS=true` + `USE_STRATEGY_ENGINE=true` → multi-strategy signals, broker-abstracted execution

---

## 3. Files to Modify

| File | Change | Risk |
|------|--------|------|
| `supabase/functions/_shared/featureFlags.ts` | Add `useStrategyEngine()` | None — additive |
| `supabase/functions/trading-bot/index.ts` | Add strategy engine imports, modify `analyze_market` and `generate_signal` cases | Medium — guarded by feature flag |

| File | Change | Risk |
|------|--------|------|
| `supabase/functions/_shared/strategy/mod.ts` | No changes | None |
| `supabase/functions/_shared/broker/*` | No changes | None |
| `supabase/functions/risk-management-engine/index.ts` | No changes | None |
| `supabase/functions/live-trading-engine/index.ts` | No changes | None |
| `supabase/functions/reconciliation-engine/index.ts` | No changes | None |
| `supabase/functions/scheduler-engine/index.ts` | No changes | None |

**Only 2 files are modified.** Everything else is unchanged.

---

## 4. Import Changes (trading-bot/index.ts)

Add at the top of the file, after the existing broker imports:

```typescript
import { useStrategyEngine } from '../_shared/featureFlags.ts';
import { StrategyRegistry } from '../_shared/strategy/registry.ts';
import { StrategyPipeline } from '../_shared/strategy/pipeline.ts';
import { MomentumStrategy } from '../_shared/strategy/strategies/momentum.ts';
import { MeanReversionStrategy } from '../_shared/strategy/strategies/mean-reversion.ts';
import { BreakoutStrategy } from '../_shared/strategy/strategies/breakout.ts';
import { TrendFollowingStrategy } from '../_shared/strategy/strategies/trend-following.ts';
import { AIHybridStrategy } from '../_shared/strategy/strategies/ai-hybrid.ts';
import { emitStrategyAudit } from '../_shared/strategy/audit.ts';
import type { MarketSnapshot } from '../_shared/strategy/types.ts';
import type { StrategyContext } from '../_shared/strategy/adapter.ts';
```

---

## 5. Strategy Registry Initialization

Add a lazy initializer mirroring the existing `getBrokerRegistry()` pattern:

```typescript
let _strategyRegistry: StrategyRegistry | null = null;
let _strategyPipeline: StrategyPipeline | null = null;

function getStrategyPipeline(): StrategyPipeline {
  if (!_strategyPipeline) {
    _strategyRegistry = new StrategyRegistry();

    // Register strategies with (priority, weight)
    // Lower priority = higher precedence
    _strategyRegistry.register(new MomentumStrategy(),       10, 0.25);
    _strategyRegistry.register(new MeanReversionStrategy(),  20, 0.20);
    _strategyRegistry.register(new TrendFollowingStrategy(), 30, 0.25);
    _strategyRegistry.register(new BreakoutStrategy(),       40, 0.15);
    _strategyRegistry.register(new AIHybridStrategy(),       50, 0.15);

    _strategyPipeline = new StrategyPipeline(_strategyRegistry, {
      aggregator: {
        method: 'weighted_confidence',
        consensusThreshold: 0.5,
        minimumConfidence: 0.3,
        maximumRiskScore: 0.9,
      },
      timeoutMs: 5000,
      failOpenOnTimeout: false,
    });
  }
  return _strategyPipeline;
}
```

---

## 6. Signal Flow — Before and After

### Before (current)

```
analyze_market → Kraken OHLC → MLEngine.generateSignal() → TradingSignal
                                                               ↓
generate_paper_signal → synthetic price → random buy/sell → strategy_signals table
                                                               ↓
execute_trade → read strategy_signals → RiskManager → BrokerAdapter → paper position
```

### After (with USE_STRATEGY_ENGINE=true)

```
analyze_market → Kraken OHLC → MarketSnapshot
                                    ↓
                           StrategyPipeline.execute()
                           ├── MomentumStrategy.generateSignal()
                           ├── MeanReversionStrategy.generateSignal()
                           ├── TrendFollowingStrategy.generateSignal()
                           ├── BreakoutStrategy.generateSignal()
                           └── AIHybridStrategy.generateSignal()
                                    ↓
                           SignalAggregator.aggregate()
                                    ↓
                           AggregatedSignal → convert to TradingSignal
                                    ↓
                           strategy_signals table (existing)
                                    ↓
execute_trade → read strategy_signals → RiskManager → BrokerAdapter → paper position
```

**Key point:** The Strategy Engine's output is converted to the existing `TradingSignal` format and written to the existing `strategy_signals` table. The `execute_trade` action sees no difference.

---

## 7. Conversion: AggregatedSignal → TradingSignal

The Strategy Engine uses `SignalDirection` (`long`/`short`/`close`/`hold`) while the existing trading-bot uses `signal_type` (`buy`/`sell`/`hold`). A simple mapping function bridges them:

```typescript
function aggregatedSignalToTradingSignal(
  agg: AggregatedSignal,
  price: number
): { type: 'buy' | 'sell' | 'hold'; confidence: number; price: number; indicators: Record<string, number>; mlScore: number } {
  const directionMap: Record<string, 'buy' | 'sell' | 'hold'> = {
    long: 'buy',
    short: 'sell',
    close: 'sell',
    hold: 'hold',
  };

  return {
    type: directionMap[agg.direction] ?? 'hold',
    confidence: agg.confidence,
    price,
    indicators: {},
    mlScore: agg.confidence,
  };
}
```

---

## 8. Wiring Point: `analyze_market` Case

Inside the existing `case 'analyze_market'` block, after the market data is fetched and the regime is detected, add a strategy engine branch:

```typescript
case 'analyze_market': {
  // ... existing OHLC fetch logic (unchanged) ...

  const regime = regimeDetector.detectRegime(analyzeMarketData);
  // ... existing regime insert (unchanged) ...

  if (useStrategyEngine()) {
    // STRATEGY ENGINE PATH
    const snapshot: MarketSnapshot = buildMarketSnapshot(symbol, analyzeMarketData);
    const context: StrategyContext = await buildStrategyContext(userId, symbol);
    const pipeline = getStrategyPipeline();
    const pipelineResult = await pipeline.execute(snapshot, context);

    await emitStrategyAudit(supabase, {
      userId,
      action: 'STRATEGY_PIPELINE_EXECUTED',
      details: {
        symbol,
        totalStrategies: pipelineResult.totalStrategies,
        succeeded: pipelineResult.succeededCount,
        failed: pipelineResult.failedCount,
        direction: pipelineResult.aggregatedSignal?.direction,
        latencyMs: pipelineResult.latencyMs,
      },
    });

    // Store individual strategy results in strategy_results table
    for (const sig of pipelineResult.individualSignals) {
      await supabase.from('strategy_results').insert({
        user_id: userId,
        strategy_id: sig.strategyId,
        symbol: sig.symbol,
        direction: sig.direction,
        strength: sig.strength,
        confidence: sig.confidence,
        risk_score: sig.riskScore,
        indicators: sig.indicators,
        reasoning: sig.reasoning,
      });
    }

    // Convert aggregated signal to existing TradingSignal format
    if (pipelineResult.aggregatedSignal) {
      const tradingSignal = aggregatedSignalToTradingSignal(
        pipelineResult.aggregatedSignal,
        snapshot.currentPrice
      );

      // Write to existing strategy_signals table (execute_trade reads from here)
      await supabase.from('strategy_signals').insert({
        symbol,
        signal_type: tradingSignal.type,
        strategy_type: 'multi_strategy',
        confidence: tradingSignal.confidence,
        price: tradingSignal.price,
        timestamp: new Date().toISOString(),
        indicators: tradingSignal.indicators,
        ml_score: tradingSignal.mlScore,
      });
    }

    return new Response(JSON.stringify({
      regime,
      pipelineResult: {
        direction: pipelineResult.aggregatedSignal?.direction,
        confidence: pipelineResult.aggregatedSignal?.confidence,
        strategies: pipelineResult.succeededCount,
        errors: pipelineResult.failedCount,
      },
      marketData: formattedData.slice(-20),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // LEGACY PATH (existing code, unchanged)
  const signal = await mlEngine.generateSignal(symbol, analyzeMarketData, regime);
  return new Response(JSON.stringify({ regime, signal, marketData: formattedData.slice(-20) }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

---

## 9. Helper Functions

### buildMarketSnapshot

Converts the existing OHLC array into the `MarketSnapshot` format the strategy pipeline expects:

```typescript
function buildMarketSnapshot(symbol: string, ohlcData: any[]): MarketSnapshot {
  const latest = ohlcData[ohlcData.length - 1];
  const price = parseFloat(latest.close ?? latest.price ?? 0);
  return {
    symbol,
    currentPrice: price,
    bidPrice: price * 0.999,
    askPrice: price * 1.001,
    volume24h: ohlcData.reduce((sum: number, c: any) => sum + parseFloat(c.volume ?? 0), 0),
    change24h: ohlcData.length > 1
      ? ((price - parseFloat(ohlcData[0].close ?? ohlcData[0].open ?? price)) / parseFloat(ohlcData[0].close ?? ohlcData[0].open ?? price)) * 100
      : 0,
    high24h: Math.max(...ohlcData.map((c: any) => parseFloat(c.high ?? 0))),
    low24h: Math.min(...ohlcData.filter((c: any) => parseFloat(c.low ?? 0) > 0).map((c: any) => parseFloat(c.low ?? 0))),
    ohlcv: ohlcData.map((c: any) => ({
      timestamp: c.timestamp ?? new Date().toISOString(),
      open: parseFloat(c.open ?? 0),
      high: parseFloat(c.high ?? 0),
      low: parseFloat(c.low ?? 0),
      close: parseFloat(c.close ?? 0),
      volume: parseFloat(c.volume ?? 0),
    })),
    timestamp: new Date().toISOString(),
  };
}
```

### buildStrategyContext

Builds the `StrategyContext` from the user's current state:

```typescript
async function buildStrategyContext(userId: string, symbol: string): Promise<StrategyContext> {
  const { data: config } = await supabase
    .from('bot_config')
    .select('capital_cad')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: positions } = await supabase
    .from('trading_positions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'open');

  return {
    symbol,
    accountEquity: config?.capital_cad ?? 10000,
    openPositions: positions?.length ?? 0,
    maxPositions: 5,
    riskBudgetRemaining: 1.0,
    currentRegime: 'unknown',
    previousSignals: [],
  };
}
```

---

## 10. What Does NOT Change

| Component | Status |
|-----------|--------|
| `execute_trade` action | Unchanged — reads from `strategy_signals` as before |
| `generate_paper_signal` action | Unchanged — still generates paper signals |
| `start_strategies` action | Unchanged — still uses legacy `generateStrategySignal()` |
| `test_kill_switch` action | Unchanged |
| `test_cooldown` action | Unchanged |
| Risk Engine (`risk-management-engine`) | Unchanged |
| Trading Engine (`live-trading-engine`) | Unchanged |
| Reconciliation Engine | Unchanged |
| Scheduler Engine | Unchanged |
| BrokerAdapter layer | Unchanged |
| Paper trading mode | Unchanged |
| Kill switch, circuit breaker, drawdown limits | Unchanged |
| Phase 3 monitor/test scripts | Unchanged |

---

## 11. Testing Plan

### Pre-Deployment

1. **Unit tests** — Run existing 331 tests, verify all pass
2. **New integration tests** — Add tests in `src/test/security/`:
   - Verify `aggregatedSignalToTradingSignal()` conversion correctness
   - Verify `buildMarketSnapshot()` handles edge cases (empty data, missing fields)
   - Verify `buildStrategyContext()` returns valid defaults
   - Verify feature flag `useStrategyEngine()` defaults to `false`
   - Verify `getStrategyPipeline()` initializes correctly
3. **Feature flag OFF test** — Deploy with `USE_STRATEGY_ENGINE=false`, verify existing behavior unchanged

### Post-Deployment (Paper Mode Only)

1. **Enable flag** — Set `USE_STRATEGY_ENGINE=true` in Supabase edge function environment
2. **Run `analyze_market`** — Verify pipeline executes, signals written to `strategy_signals`
3. **Run `execute_trade`** — Verify paper trade executes from strategy engine signals
4. **Check `strategy_results` table** — Verify individual strategy signals are persisted
5. **Check `security_audit_log`** — Verify `STRATEGY_PIPELINE_EXECUTED` events appear
6. **Compare with legacy** — Run 10+ cycles with flag ON and OFF, compare signal quality
7. **Monitor latency** — Ensure pipeline execution stays under 5 seconds

### Acceptance Criteria

- [ ] All 331+ existing tests pass
- [ ] Feature flag OFF = zero behavior change (byte-for-byte identical responses)
- [ ] Feature flag ON = pipeline executes, signals written correctly
- [ ] No broker-specific values in strategy signals
- [ ] Risk Engine receives signals in the same format as before
- [ ] Paper trading continues to work correctly
- [ ] Kill switch still halts trading immediately
- [ ] Drawdown limits still trigger correctly
- [ ] Cooldown system still pauses after consecutive losses

---

## 12. Rollback Plan

### Immediate Rollback (< 1 minute)

Set `USE_STRATEGY_ENGINE=false` in Supabase edge function environment. The feature flag gates all strategy engine code. No redeployment needed.

### Full Rollback (< 5 minutes)

1. Set `USE_STRATEGY_ENGINE=false`
2. Redeploy the previous version of `trading-bot` from git
3. The strategy engine framework files remain on disk but are not imported (tree-shaken out of the bundle since the feature flag short-circuits before import)

### Data Rollback

Strategy results in `strategy_results`, `strategy_performance`, and `strategy_metrics` tables are isolated. They can be truncated without affecting any other table:

```sql
TRUNCATE strategy_results, strategy_performance, strategy_metrics;
```

The `strategy_signals` table is the existing table — signals written by the strategy engine are indistinguishable from legacy signals (same schema). No cleanup needed.

---

## 13. Deployment Sequence

1. **Verify Phase 3 is 8/8** — Do not proceed otherwise
2. **Run migration** — `20260630000008_strategy_engine.sql` (already written, additive)
3. **Deploy trading-bot** — With `USE_STRATEGY_ENGINE=false` (flag OFF)
4. **Verify existing behavior** — Run monitor, verify 8/8 still passing
5. **Enable flag** — Set `USE_STRATEGY_ENGINE=true`
6. **Run 3 paper trading cycles** — Verify signals, trades, audit log
7. **Monitor for 24 hours** — Check latency, error rates, signal quality
8. **If issues** — Set `USE_STRATEGY_ENGINE=false` (instant rollback)

---

## 14. Constraints

- **Do NOT enable live trading** — paper mode only
- **Do NOT modify Risk Engine** — it receives signals in the same format
- **Do NOT modify BrokerAdapter** — it executes orders as before
- **Do NOT bypass the feature flag** — all strategy engine code must be gated
- **Do NOT remove the legacy signal path** — it remains as fallback
- **Do NOT deploy without Phase 3 completion** — 7/7 distinct trading days required
- **Do NOT approve this plan without owner review**

---

## 15. Estimated Effort

| Task | Estimate |
|------|----------|
| Feature flag addition | 5 minutes |
| Import additions | 5 minutes |
| Registry initializer | 15 minutes |
| Helper functions | 30 minutes |
| `analyze_market` wiring | 30 minutes |
| Integration tests | 1–2 hours |
| Testing and validation | 2–4 hours |
| **Total** | **4–7 hours** |

---

## Approval

This plan must be reviewed and approved before any implementation begins.

- [ ] Owner approval
- [ ] Phase 3 complete (7/7 trading days)
- [ ] Phase 3 monitor 8/8 passing
- [ ] No open risk events or incidents
