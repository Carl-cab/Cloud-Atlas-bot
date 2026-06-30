// =============================================================================
// Signal Aggregator
//
// Combines outputs from multiple strategies into a single aggregated signal.
// Supports multiple aggregation methods:
//   - majority_vote:        Direction with the most strategies wins
//   - weighted_confidence:  Weighted average of signals by confidence * weight
//   - priority_strategy:    Highest-priority strategy's signal wins
//   - consensus_threshold:  Requires N% of strategies to agree
//
// The aggregator never places orders or contacts brokers. It produces a
// standardized AggregatedSignal that flows into the existing Risk Engine.
// =============================================================================

import type {
  StrategySignal,
  AggregatedSignal,
  AggregatorConfig,
  SignalDirection,
  SignalStrength,
} from './types.ts';

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: AggregatorConfig = {
  method: 'weighted_confidence',
  consensusThreshold: 0.5,
  minimumConfidence: 0.3,
  maximumRiskScore: 0.9,
};

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

export class SignalAggregator {
  private config: AggregatorConfig;

  constructor(config: Partial<AggregatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Aggregate multiple strategy signals into one decision.
   * Returns null if no usable signals remain after filtering.
   */
  aggregate(
    signals: StrategySignal[],
    weights: Map<string, number> = new Map()
  ): AggregatedSignal | null {
    const filtered = this.filterSignals(signals);
    if (filtered.length === 0) return null;

    switch (this.config.method) {
      case 'majority_vote':
        return this.majorityVote(filtered, weights);
      case 'weighted_confidence':
        return this.weightedConfidence(filtered, weights);
      case 'priority_strategy':
        return this.priorityStrategy(filtered);
      case 'consensus_threshold':
        return this.consensusThreshold(filtered, weights);
      default:
        return this.weightedConfidence(filtered, weights);
    }
  }

  /**
   * Filter out signals below confidence threshold or above risk threshold.
   */
  filterSignals(signals: StrategySignal[]): StrategySignal[] {
    return signals.filter(s =>
      s.confidence >= this.config.minimumConfidence &&
      s.riskScore <= this.config.maximumRiskScore &&
      s.direction !== 'hold'
    );
  }

  /**
   * Majority Vote: the direction with the most signals wins.
   * Ties broken by highest average confidence.
   */
  private majorityVote(
    signals: StrategySignal[],
    weights: Map<string, number>
  ): AggregatedSignal {
    const directionCounts = new Map<SignalDirection, StrategySignal[]>();
    for (const s of signals) {
      const existing = directionCounts.get(s.direction) ?? [];
      existing.push(s);
      directionCounts.set(s.direction, existing);
    }

    let winningDirection: SignalDirection = 'hold';
    let winningSignals: StrategySignal[] = [];
    let maxCount = 0;

    for (const [direction, group] of directionCounts) {
      if (group.length > maxCount) {
        maxCount = group.length;
        winningDirection = direction;
        winningSignals = group;
      } else if (group.length === maxCount) {
        const currentAvgConf = winningSignals.reduce((s, sig) => s + sig.confidence, 0) / winningSignals.length;
        const challengerAvgConf = group.reduce((s, sig) => s + sig.confidence, 0) / group.length;
        if (challengerAvgConf > currentAvgConf) {
          winningDirection = direction;
          winningSignals = group;
        }
      }
    }

    return this.buildAggregated(
      winningDirection,
      winningSignals,
      signals,
      weights,
      maxCount >= signals.length * this.config.consensusThreshold
    );
  }

  /**
   * Weighted Confidence: weighted average of confidence * weight per direction.
   * The direction with the highest total weighted confidence wins.
   */
  private weightedConfidence(
    signals: StrategySignal[],
    weights: Map<string, number>
  ): AggregatedSignal {
    const directionScores = new Map<SignalDirection, { totalWeight: number; signals: StrategySignal[] }>();

    for (const s of signals) {
      const w = weights.get(s.strategyId) ?? (1 / signals.length);
      const existing = directionScores.get(s.direction) ?? { totalWeight: 0, signals: [] };
      existing.totalWeight += s.confidence * w;
      existing.signals.push(s);
      directionScores.set(s.direction, existing);
    }

    let winningDirection: SignalDirection = 'hold';
    let winningSignals: StrategySignal[] = [];
    let maxScore = -1;

    for (const [direction, data] of directionScores) {
      if (data.totalWeight > maxScore) {
        maxScore = data.totalWeight;
        winningDirection = direction;
        winningSignals = data.signals;
      }
    }

    return this.buildAggregated(
      winningDirection,
      winningSignals,
      signals,
      weights,
      maxScore > this.config.consensusThreshold
    );
  }

  /**
   * Priority Strategy: the first signal (assuming sorted by priority) wins.
   */
  private priorityStrategy(signals: StrategySignal[]): AggregatedSignal {
    const primary = this.config.priorityStrategyId
      ? signals.find(s => s.strategyId === this.config.priorityStrategyId) ?? signals[0]
      : signals[0];

    return this.buildAggregated(
      primary.direction,
      [primary],
      signals,
      new Map(),
      true
    );
  }

  /**
   * Consensus Threshold: requires a configurable fraction of strategies
   * to agree on the same direction. If threshold is not met, returns 'hold'.
   */
  private consensusThreshold(
    signals: StrategySignal[],
    weights: Map<string, number>
  ): AggregatedSignal {
    const directionCounts = new Map<SignalDirection, StrategySignal[]>();
    for (const s of signals) {
      const existing = directionCounts.get(s.direction) ?? [];
      existing.push(s);
      directionCounts.set(s.direction, existing);
    }

    for (const [direction, group] of directionCounts) {
      const fraction = group.length / signals.length;
      if (fraction >= this.config.consensusThreshold) {
        return this.buildAggregated(direction, group, signals, weights, true);
      }
    }

    // No consensus: return hold
    return this.buildAggregated('hold', [], signals, weights, false);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildAggregated(
    direction: SignalDirection,
    winningSignals: StrategySignal[],
    allSignals: StrategySignal[],
    weights: Map<string, number>,
    consensusReached: boolean
  ): AggregatedSignal {
    const avgConfidence = winningSignals.length > 0
      ? winningSignals.reduce((s, sig) => s + sig.confidence, 0) / winningSignals.length
      : 0;

    const avgRiskScore = winningSignals.length > 0
      ? winningSignals.reduce((s, sig) => s + sig.riskScore, 0) / winningSignals.length
      : 1;

    const avgPositionSize = winningSignals.length > 0
      ? winningSignals.reduce((s, sig) => s + sig.positionSize, 0) / winningSignals.length
      : 0;

    const stopLosses = winningSignals.map(s => s.stopLoss).filter((v): v is number => v !== null);
    const takeProfits = winningSignals.map(s => s.takeProfit).filter((v): v is number => v !== null);
    const entryPrices = winningSignals.map(s => s.entryPrice);

    const avgStopLoss = stopLosses.length > 0
      ? stopLosses.reduce((a, b) => a + b, 0) / stopLosses.length
      : null;
    const avgTakeProfit = takeProfits.length > 0
      ? takeProfits.reduce((a, b) => a + b, 0) / takeProfits.length
      : null;
    const avgEntryPrice = entryPrices.length > 0
      ? entryPrices.reduce((a, b) => a + b, 0) / entryPrices.length
      : 0;

    const reasoning = winningSignals.map(s =>
      `[${s.strategyId}] ${s.reasoning}`
    ).join('; ');

    return {
      symbol: allSignals[0]?.symbol ?? '',
      direction,
      strength: this.confidenceToStrength(avgConfidence),
      confidence: avgConfidence,
      riskScore: avgRiskScore,
      positionSize: avgPositionSize,
      stopLoss: avgStopLoss,
      takeProfit: avgTakeProfit,
      expectedHoldingTime: winningSignals[0]?.expectedHoldingTime ?? null,
      entryPrice: avgEntryPrice,
      reasoning,
      aggregationMethod: this.config.method,
      contributingStrategies: winningSignals.map(s => s.strategyId),
      individualSignals: allSignals,
      consensusReached,
      metadata: {
        totalStrategies: allSignals.length,
        filteredCount: allSignals.length - winningSignals.length,
        weights: Object.fromEntries(weights),
      },
      timestamp: new Date().toISOString(),
    };
  }

  private confidenceToStrength(confidence: number): SignalStrength {
    if (confidence >= 0.75) return 'strong';
    if (confidence >= 0.5) return 'moderate';
    return 'weak';
  }

  /**
   * Update the aggregator configuration.
   */
  updateConfig(config: Partial<AggregatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): AggregatorConfig {
    return { ...this.config };
  }
}
