# Signal Aggregation

## Overview

The Signal Aggregator combines outputs from multiple strategies into a single trading decision. It is the core conflict resolution mechanism when strategies disagree.

## Aggregation Methods

### 1. Majority Vote

The direction with the most strategies wins. Ties broken by highest average confidence.

```
Strategy A: LONG  (conf=0.7)
Strategy B: LONG  (conf=0.8)
Strategy C: SHORT (conf=0.9)
→ Result: LONG (2 vs 1)
```

Best for: Equal-weight strategy ensembles where each strategy has proven accuracy.

### 2. Weighted Confidence

Direction is chosen by the highest total of `confidence × weight` across strategies. Allows a single high-confidence, high-weight strategy to override multiple weak ones.

```
Strategy A: LONG  (conf=0.5, weight=0.2) → 0.10
Strategy B: LONG  (conf=0.5, weight=0.2) → 0.10
Strategy C: SHORT (conf=0.9, weight=0.6) → 0.54
→ Result: SHORT (0.54 > 0.20)
```

Best for: When some strategies have higher track records than others.

### 3. Priority Strategy

The highest-priority strategy's signal wins unconditionally. Other strategies are logged for audit but do not affect the decision.

Best for: Testing a new primary strategy while keeping backups registered.

### 4. Consensus Threshold

Requires a configurable fraction (e.g., 60%) of strategies to agree on the same direction. If no direction reaches the threshold, the result is `hold` (no action).

```
Threshold: 60%
Strategy A: LONG
Strategy B: LONG
Strategy C: LONG
Strategy D: SHORT
Strategy E: SHORT
→ 3/5 = 60% → LONG (consensus reached)
```

Best for: Conservative approaches that only trade when strategies broadly agree.

## Signal Filtering

Before aggregation, signals are filtered:

| Filter | Default | Effect |
|--------|---------|--------|
| Minimum confidence | 0.3 | Drops low-confidence signals |
| Maximum risk score | 0.9 | Drops high-risk signals |
| Hold direction | Always filtered | Hold signals don't participate |

## Aggregated Signal Output

The aggregated signal includes:
- Winning direction, strength, confidence (averaged from winning signals)
- Average risk score, position size, stop loss, take profit
- List of contributing strategy IDs
- All individual signals (for audit)
- Whether consensus was reached
- Which aggregation method was used

## Configuration

```typescript
const config: AggregatorConfig = {
  method: 'weighted_confidence',
  consensusThreshold: 0.5,
  minimumConfidence: 0.3,
  maximumRiskScore: 0.9,
  priorityStrategyId: 'ai-hybrid',    // for priority_strategy method
  weightOverrides: { 'momentum': 0.8 }, // per-strategy weight overrides
};
```

## Integration with Risk Engine

The aggregated signal feeds into the existing Risk Engine unchanged:
1. Aggregated confidence maps to signal confidence
2. Aggregated risk score is informational (Risk Engine has its own evaluation)
3. Position size is a suggestion (Risk Engine applies hard limits)
4. Stop loss and take profit are used by the Risk Engine's existing logic
