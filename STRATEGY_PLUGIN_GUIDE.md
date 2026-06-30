# Strategy Plugin Guide

## Creating a New Strategy

Every strategy implements the `StrategyAdapter` interface. Follow these steps:

### 1. Create the Strategy File

```
supabase/functions/_shared/strategy/strategies/your-strategy.ts
```

### 2. Implement the Interface

```typescript
import type { StrategyAdapter, StrategyContext } from '../adapter.ts';
import type {
  MarketSnapshot, StrategySignal, StrategyMetadata,
  StrategyHealth, StrategyResult, SignalDirection,
} from '../types.ts';

export class YourStrategy implements StrategyAdapter {
  readonly strategyId = 'your-strategy';
  readonly strategyName = 'Your Strategy';

  // Implement all required methods...
}
```

### 3. Required Methods

| Method | Must Return | Notes |
|--------|-------------|-------|
| `initialize()` | `StrategyResult<void>` | Called once before first use |
| `analyzeMarket()` | `StrategyResult<Record<string, number>>` | Pure indicator computation |
| `generateSignal()` | `StrategyResult<StrategySignal>` | Main signal generation |
| `calculateConfidence()` | `StrategyResult<number>` | 0.0–1.0 range |
| `calculateRisk()` | `StrategyResult<number>` | 0.0–1.0, higher = riskier |
| `calculatePositionSize()` | `StrategyResult<number>` | Fraction of capital |
| `shouldEnterTrade()` | Entry decision | Includes direction and reason |
| `shouldExitTrade()` | Exit decision | Includes reason |
| `shouldPauseTrading()` | Pause decision | Optional duration |
| `getMetadata()` | `StrategyMetadata` | Synchronous |
| `getHealth()` | `StrategyHealth` | Synchronous |

### 4. Rules

- **Never throw**. Return `{ success: false, error: '...' }` instead.
- **Never access the database**. You receive market data, you return signals.
- **Never interact with brokers**. No order placement, no credential access.
- **No broker-specific values**. Use canonical types only.
- **Be stateless** between calls. Use `StrategyContext` for runtime state.

### 5. Register in mod.ts

Add your strategy to the barrel export:

```typescript
export { YourStrategy } from './strategies/your-strategy.ts';
```

### 6. Register at Runtime

In the trading-bot initialization:

```typescript
import { YourStrategy } from '../_shared/strategy/mod.ts';

const strategyRegistry = new StrategyRegistry();
strategyRegistry.register(new YourStrategy(), 50, 0.8);
// priority=50, weight=0.8
```

### 7. Add Tests

Create tests in `src/test/security/` following the existing pattern.

## Strategy Categories

| Category | Description | Example |
|----------|-------------|---------|
| `momentum` | Follow price momentum | RSI, ROC, volume |
| `mean_reversion` | Bet on return to mean | Bollinger Bands, Z-score |
| `breakout` | Detect range breakouts | Channel breaks, volume surge |
| `trend_following` | Follow established trends | SMA crossover, ADX |
| `ai_hybrid` | ML/AI ensemble | Multi-factor scoring |
| `statistical_arbitrage` | Statistical relationships | Pair trading |
| `custom` | User-defined | Any approach |

## Risk Levels

| Level | Max Position Size | Typical Use |
|-------|------------------|-------------|
| `low` | 2% of capital | Conservative, mean reversion |
| `medium` | 5% of capital | Balanced, momentum, trend |
| `high` | 8% of capital | Aggressive, breakout |
