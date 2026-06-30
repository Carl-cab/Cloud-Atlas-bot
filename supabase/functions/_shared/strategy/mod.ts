// =============================================================================
// Strategy Engine — Public API
//
// Import everything from this barrel module:
//   import { StrategyAdapter, StrategyRegistry, MomentumStrategy, ... } from '../_shared/strategy/mod.ts';
// =============================================================================

// Core types
export type {
  SignalDirection,
  SignalStrength,
  MarketRegime,
  Timeframe,
  MarketSnapshot,
  OHLCVCandle,
  StrategySignal,
  AggregationMethod,
  AggregatedSignal,
  StrategyCategory,
  StrategyMetadata,
  StrategyHealthStatus,
  StrategyHealth,
  StrategyResult,
  StrategyPerformance,
  AggregatorConfig,
} from './types.ts';

// Adapter interface
export type { StrategyAdapter, StrategyContext } from './adapter.ts';

// Registry
export { StrategyRegistry, strategyRegistry } from './registry.ts';
export type { RegisteredStrategy, StrategySelectionCriteria } from './registry.ts';

// Aggregator
export { SignalAggregator } from './aggregator.ts';

// Pipeline
export { StrategyPipeline } from './pipeline.ts';
export type { PipelineConfig, PipelineResult } from './pipeline.ts';

// Built-in strategies
export { MomentumStrategy } from './strategies/momentum.ts';
export { MeanReversionStrategy } from './strategies/mean-reversion.ts';
export { BreakoutStrategy } from './strategies/breakout.ts';
export { TrendFollowingStrategy } from './strategies/trend-following.ts';
export { AIHybridStrategy } from './strategies/ai-hybrid.ts';

// Audit
export { emitStrategyAudit } from './audit.ts';
export type { StrategyAuditAction, StrategyAuditEvent } from './audit.ts';
