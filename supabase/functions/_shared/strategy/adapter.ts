// =============================================================================
// Strategy Adapter Interface
//
// Every trading strategy implements this interface. The Strategy Engine never
// knows the internal logic of a strategy — only its standardized interface.
//
// Rules:
//   - Strategies MUST NOT throw. Return StrategyResult with success=false.
//   - Strategies MUST NOT access the database directly.
//   - Strategies MUST NOT interact with brokers or place orders.
//   - Strategies MUST return broker-independent signals using canonical types.
//   - Strategies MUST be stateless between calls (state via initialize/context).
// =============================================================================

import type {
  MarketSnapshot,
  StrategySignal,
  StrategyMetadata,
  StrategyHealth,
  StrategyResult,
  MarketRegime,
  SignalDirection,
} from './types.ts';

export interface StrategyContext {
  symbol: string;
  accountEquity: number;
  openPositions: number;
  maxPositions: number;
  riskBudgetRemaining: number;  // fraction of capital still available for new positions
  currentRegime?: MarketRegime;
  previousSignals?: StrategySignal[];
}

export interface StrategyAdapter {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Unique strategy identifier (e.g., 'momentum', 'mean-reversion') */
  readonly strategyId: string;

  /** Human-readable strategy name */
  readonly strategyName: string;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Initialize the strategy (load parameters, warm up indicators) */
  initialize(config?: Record<string, unknown>): Promise<StrategyResult<void>>;

  // ---------------------------------------------------------------------------
  // Analysis Pipeline
  // ---------------------------------------------------------------------------

  /** Analyze current market conditions and produce indicator values */
  analyzeMarket(snapshot: MarketSnapshot): Promise<StrategyResult<Record<string, number>>>;

  /** Generate a trading signal based on market analysis */
  generateSignal(
    snapshot: MarketSnapshot,
    context: StrategyContext
  ): Promise<StrategyResult<StrategySignal>>;

  /** Calculate confidence level for the current signal (0.0 – 1.0) */
  calculateConfidence(
    snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>>;

  /** Calculate risk score for the current opportunity (0.0 – 1.0) */
  calculateRisk(
    snapshot: MarketSnapshot,
    indicators: Record<string, number>
  ): Promise<StrategyResult<number>>;

  /** Calculate position size as a fraction of available capital (0.0 – 1.0) */
  calculatePositionSize(
    snapshot: MarketSnapshot,
    confidence: number,
    riskScore: number,
    accountEquity: number
  ): Promise<StrategyResult<number>>;

  // ---------------------------------------------------------------------------
  // Trade Decisions
  // ---------------------------------------------------------------------------

  /** Whether conditions warrant entering a new position */
  shouldEnterTrade(
    snapshot: MarketSnapshot,
    context: StrategyContext
  ): Promise<StrategyResult<{ enter: boolean; direction: SignalDirection; reason: string }>>;

  /** Whether an existing position should be exited */
  shouldExitTrade(
    snapshot: MarketSnapshot,
    context: StrategyContext,
    entryPrice: number,
    currentPnl: number
  ): Promise<StrategyResult<{ exit: boolean; reason: string }>>;

  /** Whether the strategy recommends pausing trading entirely */
  shouldPauseTrading(
    snapshot: MarketSnapshot,
    context: StrategyContext
  ): Promise<StrategyResult<{ pause: boolean; reason: string; durationMs?: number }>>;

  // ---------------------------------------------------------------------------
  // Metadata & Health
  // ---------------------------------------------------------------------------

  /** Return strategy metadata for registration and display */
  getMetadata(): StrategyMetadata;

  /** Return current health status */
  getHealth(): StrategyHealth;
}
