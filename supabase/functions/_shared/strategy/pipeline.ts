// =============================================================================
// Strategy Pipeline
//
// Orchestrates the full execution flow:
//   Market Data → Strategy Registry → Multiple Strategies → Signal Aggregator
//     → Standardized Signal (ready for Risk Engine → Trading Engine → Broker)
//
// The pipeline does NOT interact with brokers or the database. It takes
// a MarketSnapshot and returns an AggregatedSignal. The caller (trading-bot)
// handles persistence, risk evaluation, and order execution.
// =============================================================================

import type { StrategyRegistry } from './registry.ts';
import { SignalAggregator } from './aggregator.ts';
import type {
  MarketSnapshot,
  StrategySignal,
  AggregatedSignal,
  AggregatorConfig,
  StrategyResult,
} from './types.ts';
import type { StrategyContext } from './adapter.ts';

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  aggregator: Partial<AggregatorConfig>;
  maxConcurrentStrategies: number;
  timeoutMs: number;
  failOpenOnTimeout: boolean;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  aggregator: {},
  maxConcurrentStrategies: 10,
  timeoutMs: 5000,
  failOpenOnTimeout: false,
};

// ---------------------------------------------------------------------------
// Pipeline Result
// ---------------------------------------------------------------------------

export interface PipelineResult {
  aggregatedSignal: AggregatedSignal | null;
  individualSignals: StrategySignal[];
  errors: Array<{ strategyId: string; error: string }>;
  totalStrategies: number;
  succeededCount: number;
  failedCount: number;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Strategy Pipeline
// ---------------------------------------------------------------------------

export class StrategyPipeline {
  private readonly registry: StrategyRegistry;
  private readonly aggregator: SignalAggregator;
  private readonly config: PipelineConfig;

  constructor(
    registry: StrategyRegistry,
    config: Partial<PipelineConfig> = {}
  ) {
    this.registry = registry;
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.aggregator = new SignalAggregator(this.config.aggregator);
  }

  /**
   * Run all enabled strategies against the given market snapshot and
   * aggregate their signals into a single decision.
   */
  async execute(
    snapshot: MarketSnapshot,
    context: StrategyContext
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const enabled = this.registry.getEnabled();
    const weights = this.registry.weightMap();

    const signals: StrategySignal[] = [];
    const errors: Array<{ strategyId: string; error: string }> = [];

    // Run strategies (sequentially to stay within Deno edge function limits)
    for (const registered of enabled.slice(0, this.config.maxConcurrentStrategies)) {
      try {
        const result = await this.runWithTimeout(
          registered.adapter.generateSignal(snapshot, context),
          this.config.timeoutMs
        );

        if (result.success && result.data) {
          signals.push(result.data);
        } else {
          errors.push({
            strategyId: registered.adapter.strategyId,
            error: result.error ?? 'Unknown error',
          });
        }
      } catch (err) {
        errors.push({
          strategyId: registered.adapter.strategyId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const aggregatedSignal = signals.length > 0
      ? this.aggregator.aggregate(signals, weights)
      : null;

    return {
      aggregatedSignal,
      individualSignals: signals,
      errors,
      totalStrategies: enabled.length,
      succeededCount: signals.length,
      failedCount: errors.length,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Initialize all enabled strategies.
   */
  async initializeAll(config?: Record<string, unknown>): Promise<Map<string, StrategyResult<void>>> {
    const results = new Map<string, StrategyResult<void>>();
    for (const registered of this.registry.getEnabled()) {
      const result = await registered.adapter.initialize(config);
      results.set(registered.adapter.strategyId, result);
    }
    return results;
  }

  /**
   * Check if any strategy recommends pausing trading.
   */
  async checkPauseConditions(
    snapshot: MarketSnapshot,
    context: StrategyContext
  ): Promise<{ shouldPause: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    for (const registered of this.registry.getEnabled()) {
      try {
        const result = await registered.adapter.shouldPauseTrading(snapshot, context);
        if (result.success && result.data?.pause) {
          reasons.push(`[${registered.adapter.strategyId}] ${result.data.reason}`);
        }
      } catch {
        // Ignore errors in pause checks
      }
    }
    return { shouldPause: reasons.length > 0, reasons };
  }

  /**
   * Update the aggregator configuration.
   */
  updateAggregatorConfig(config: Partial<AggregatorConfig>): void {
    this.aggregator.updateConfig(config);
  }

  /**
   * Get current aggregator configuration.
   */
  getAggregatorConfig(): AggregatorConfig {
    return this.aggregator.getConfig();
  }

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Strategy timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
}
