// =============================================================================
// Strategy Engine — Domain Types
//
// All types are broker-independent and strategy-agnostic. The Strategy Engine
// produces standardized signals that flow into the Risk Engine and then into
// the Trading Engine via BrokerAdapters.
//
// No broker-specific values (Kraken order IDs, Alpaca account numbers, etc.)
// should ever appear in these types.
// =============================================================================

// ---------------------------------------------------------------------------
// Signal Direction & Strength
// ---------------------------------------------------------------------------

export type SignalDirection = 'long' | 'short' | 'close' | 'hold';

export type SignalStrength = 'strong' | 'moderate' | 'weak';

export type MarketRegime =
  | 'trending_up'
  | 'trending_down'
  | 'ranging'
  | 'volatile'
  | 'breakout'
  | 'mean_reverting'
  | 'unknown';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

// ---------------------------------------------------------------------------
// Market Data Snapshot (input to strategies)
// ---------------------------------------------------------------------------

export interface MarketSnapshot {
  symbol: string;
  currentPrice: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  change24h: number;
  high24h: number;
  low24h: number;
  ohlcv: OHLCVCandle[];
  timestamp: string;
}

export interface OHLCVCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Strategy Signal (output from a single strategy)
// ---------------------------------------------------------------------------

export interface StrategySignal {
  strategyId: string;
  symbol: string;
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number;      // 0.0 – 1.0
  riskScore: number;       // 0.0 – 1.0 (higher = riskier)
  positionSize: number;    // fraction of capital, 0.0 – 1.0
  stopLoss: number | null;
  takeProfit: number | null;
  expectedHoldingTime: string | null; // ISO 8601 duration (e.g., "PT4H", "P1D")
  entryPrice: number;
  reasoning: string;
  indicators: Record<string, number>;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Aggregated Signal (output from the Signal Aggregator)
// ---------------------------------------------------------------------------

export type AggregationMethod =
  | 'majority_vote'
  | 'weighted_confidence'
  | 'priority_strategy'
  | 'consensus_threshold';

export interface AggregatedSignal {
  symbol: string;
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number;
  riskScore: number;
  positionSize: number;
  stopLoss: number | null;
  takeProfit: number | null;
  expectedHoldingTime: string | null;
  entryPrice: number;
  reasoning: string;
  aggregationMethod: AggregationMethod;
  contributingStrategies: string[];
  individualSignals: StrategySignal[];
  consensusReached: boolean;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Strategy Metadata
// ---------------------------------------------------------------------------

export type StrategyCategory =
  | 'momentum'
  | 'mean_reversion'
  | 'breakout'
  | 'trend_following'
  | 'ai_hybrid'
  | 'statistical_arbitrage'
  | 'custom';

export interface StrategyMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: StrategyCategory;
  supportedTimeframes: Timeframe[];
  supportedSymbols: string[];  // empty = all symbols
  minDataPoints: number;
  riskLevel: 'low' | 'medium' | 'high';
  tags: string[];
}

// ---------------------------------------------------------------------------
// Strategy Health
// ---------------------------------------------------------------------------

export type StrategyHealthStatus = 'healthy' | 'degraded' | 'stale' | 'error';

export interface StrategyHealth {
  status: StrategyHealthStatus;
  lastSignalAt: string | null;
  signalCount: number;
  errorCount: number;
  averageLatencyMs: number;
  message?: string;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Strategy Result Wrapper
// ---------------------------------------------------------------------------

export interface StrategyResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Strategy Performance (for tracking and evaluation)
// ---------------------------------------------------------------------------

export interface StrategyPerformance {
  strategyId: string;
  totalSignals: number;
  profitableSignals: number;
  unprofitableSignals: number;
  winRate: number;
  averageReturn: number;
  sharpeRatio: number | null;
  maxDrawdown: number;
  averageHoldingTime: string | null;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Aggregator Configuration
// ---------------------------------------------------------------------------

export interface AggregatorConfig {
  method: AggregationMethod;
  consensusThreshold: number;       // 0.0 – 1.0, fraction of strategies that must agree
  minimumConfidence: number;        // signals below this are filtered out
  maximumRiskScore: number;         // signals above this are filtered out
  priorityStrategyId?: string;      // for 'priority_strategy' method
  weightOverrides?: Record<string, number>; // strategyId -> weight
}
