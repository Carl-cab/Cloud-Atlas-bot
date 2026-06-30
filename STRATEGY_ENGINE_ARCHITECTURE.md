# Strategy Engine Architecture

## Overview

The Strategy Engine is a broker-independent, AI-ready framework that allows multiple trading strategies to operate simultaneously. It sits above the BrokerAdapter layer and below the Risk Engine in the trading pipeline.

## Pipeline Flow

```
Market Data (OHLCV, Ticker)
       ↓
Strategy Registry (selects enabled strategies)
       ↓
Multiple Strategies (run in parallel)
  ├── MomentumStrategy
  ├── MeanReversionStrategy
  ├── BreakoutStrategy
  ├── TrendFollowingStrategy
  └── AIHybridStrategy
       ↓
Signal Aggregator (combines signals)
  ├── Majority Vote
  ├── Weighted Confidence
  ├── Priority Strategy
  └── Consensus Threshold
       ↓
AggregatedSignal (standardized output)
       ↓
Risk Engine (existing — unchanged)
       ↓
Trading Engine (existing — unchanged)
       ↓
BrokerAdapter (existing — unchanged)
       ↓
Broker (Kraken, Paper, future brokers)
```

## Core Interfaces

### StrategyAdapter

Every strategy implements this interface. Located at `supabase/functions/_shared/strategy/adapter.ts`.

| Method | Purpose |
|--------|---------|
| `initialize()` | Load parameters, warm up indicators |
| `analyzeMarket()` | Produce indicator values from market snapshot |
| `generateSignal()` | Generate a trading signal |
| `calculateConfidence()` | Confidence level (0.0–1.0) |
| `calculateRisk()` | Risk score (0.0–1.0) |
| `calculatePositionSize()` | Position size as fraction of capital |
| `shouldEnterTrade()` | Whether to enter a new position |
| `shouldExitTrade()` | Whether to exit an existing position |
| `shouldPauseTrading()` | Whether to pause all trading |
| `getMetadata()` | Strategy metadata for registration |
| `getHealth()` | Current health status |

### StrategySignal

Every strategy returns this standardized object:

```typescript
{
  strategyId, symbol, direction, strength,
  confidence, riskScore, positionSize,
  stopLoss, takeProfit, expectedHoldingTime,
  entryPrice, reasoning, indicators, metadata,
  timestamp
}
```

No broker-specific values ever appear in a signal.

### StrategyRegistry

Central registry mirroring BrokerRegistry. Located at `supabase/functions/_shared/strategy/registry.ts`.

- Register/unregister strategies
- Enable/disable strategies
- Priority ordering (lower = higher priority)
- Weight management for aggregation
- Health tracking
- Category and risk-level filtering
- Singleton instance: `strategyRegistry`

### SignalAggregator

Combines multiple strategy outputs. Located at `supabase/functions/_shared/strategy/aggregator.ts`.

| Method | Description |
|--------|-------------|
| Majority Vote | Direction with most strategies wins |
| Weighted Confidence | Weighted average of confidence × weight |
| Priority Strategy | Highest-priority strategy wins |
| Consensus Threshold | Requires N% agreement |

### StrategyPipeline

Orchestrates execution. Located at `supabase/functions/_shared/strategy/pipeline.ts`.

- Runs all enabled strategies against a MarketSnapshot
- Aggregates signals into a single AggregatedSignal
- Checks pause conditions across all strategies
- Timeout protection per strategy

## File Structure

```
supabase/functions/_shared/strategy/
├── mod.ts              # Barrel export (public API)
├── types.ts            # Domain types (broker-independent)
├── adapter.ts          # StrategyAdapter interface
├── registry.ts         # StrategyRegistry class
├── aggregator.ts       # SignalAggregator class
├── pipeline.ts         # StrategyPipeline orchestrator
├── audit.ts            # Audit event emitter
└── strategies/
    ├── momentum.ts         # MomentumStrategy
    ├── mean-reversion.ts   # MeanReversionStrategy
    ├── breakout.ts         # BreakoutStrategy
    ├── trend-following.ts  # TrendFollowingStrategy
    └── ai-hybrid.ts        # AIHybridStrategy
```

## Database Tables

Migration: `supabase/migrations/20260630000008_strategy_engine.sql`

| Table | Purpose |
|-------|---------|
| `strategies` | Registered strategy definitions per user |
| `strategy_versions` | Version history |
| `strategy_results` | Individual signal outputs |
| `strategy_performance` | Aggregated performance metrics |
| `strategy_metrics` | Per-execution timing and health |

All tables have RLS enabled. Users can read their own data. Service role manages all writes.

## Safety Constraints

- Strategies MUST NOT throw (return `StrategyResult` with `success: false`)
- Strategies MUST NOT access the database directly
- Strategies MUST NOT interact with brokers or place orders
- Strategies MUST return broker-independent signals
- Existing Risk Engine, Trading Engine, and BrokerAdapter are unchanged
- Live trading remains disabled
- Paper trading remains the active mode

## Design Decisions

1. **Mirrors BrokerAdapter pattern**: Same interface-registry-adapter architecture for consistency
2. **Stateless strategies**: No state between calls; context provided via `StrategyContext`
3. **Sequential execution in Deno**: Edge functions have limited concurrency
4. **Additive-only migration**: No existing tables modified
5. **Skeleton implementations**: Strategies compile and integrate but don't have sophisticated trading logic yet
