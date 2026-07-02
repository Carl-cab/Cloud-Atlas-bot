// =============================================================================
// Backtesting Framework — Core Types
//
// Deterministic, event-driven historical replay with realistic cost modeling.
// The framework answers exactly one question: "Does a strategy produce
// positive risk-adjusted returns after fees, slippage, and spread?"
//
// No lookahead: a strategy decides on the CLOSE of candle i and the engine
// fills at the OPEN of candle i+1. Stops are evaluated intrabar against
// high/low with pessimistic ordering (stop-loss before take-profit).
// =============================================================================

export interface Candle {
  /** ISO timestamp of candle open */
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface HistoricalDataset {
  pair: string;
  /** Candle interval in minutes */
  interval: number;
  source: string;
  fetchedAt: string;
  candles: Candle[];
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export interface CostModel {
  /** Exchange fee per side as a fraction of notional (Kraken taker: 0.0026) */
  feeRate: number;
  /** Slippage per side in basis points of fill price */
  slippageBps: number;
  /** Full bid-ask spread in basis points; half is paid per side */
  spreadBps: number;
}

/** Kraken spot taker profile — the default cost assumption for validation. */
export const KRAKEN_TAKER_COSTS: CostModel = {
  feeRate: 0.0026,
  slippageBps: 5,
  spreadBps: 4,
};

/** Zero-cost profile — ONLY for engine correctness tests, never for validation. */
export const ZERO_COSTS: CostModel = {
  feeRate: 0,
  slippageBps: 0,
  spreadBps: 0,
};

// ---------------------------------------------------------------------------
// Engine configuration
// ---------------------------------------------------------------------------

export interface BacktestConfig {
  initialEquity: number;
  /** Fraction of current equity risked per trade (distance to stop) */
  riskPerTrade: number;
  /** Hard cap on position notional as a fraction of equity */
  maxPositionFraction: number;
  costs: CostModel;
  /** Spot exchange default: long-only */
  allowShorts: boolean;
  /** Candles per year for annualization (365 for 1d crypto, 2190 for 4h, 8760 for 1h) */
  candlesPerYear: number;
  /**
   * First candle index at which entries are allowed and equity tracking
   * begins. Used by walk-forward so indicators warm up on earlier data
   * without granting the test window extra trades.
   */
  startIndex?: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialEquity: 10_000,
  riskPerTrade: 0.01,
  maxPositionFraction: 0.25,
  costs: KRAKEN_TAKER_COSTS,
  allowShorts: false,
  candlesPerYear: 365,
};

// ---------------------------------------------------------------------------
// Strategy interface (backtest-side; intentionally minimal and pure)
// ---------------------------------------------------------------------------

export type StrategyAction = 'enter_long' | 'enter_short' | 'exit' | 'hold';

export interface StrategyDecision {
  action: StrategyAction;
  /** Absolute stop-loss price (required for entries — sizing derives from it) */
  stopLoss?: number;
  /** Absolute take-profit price (optional) */
  takeProfit?: number;
  /** For open positions: updated (trailing) stop. Engine never loosens a stop. */
  trailingStop?: number;
}

export interface OpenPositionView {
  side: 'long' | 'short';
  entryPrice: number;
  entryIndex: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
}

export interface BacktestStrategy {
  id: string;
  params: Record<string, number | boolean>;
  /** Number of candles required before the first decision */
  warmup: number;
  /**
   * Decide on the close of `candles[index]`. MUST NOT read past `index`.
   * The engine executes the decision at the open of `candles[index + 1]`.
   */
  decide(
    candles: Candle[],
    index: number,
    position: OpenPositionView | null
  ): StrategyDecision;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type ExitReason = 'signal' | 'stop_loss' | 'take_profit' | 'end_of_data';

export interface TradeRecord {
  side: 'long' | 'short';
  entryTime: string;
  exitTime: string;
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  feesPaid: number;
  pnl: number;
  returnPct: number;
  holdingCandles: number;
  exitReason: ExitReason;
}

export interface EquityPoint {
  t: string;
  equity: number;
}

export interface BacktestResult {
  strategyId: string;
  params: Record<string, number | boolean>;
  config: BacktestConfig;
  trades: TradeRecord[];
  equityCurve: EquityPoint[];
  finalEquity: number;
  totalFeesPaid: number;
  candlesTested: number;
  candlesInPosition: number;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface PerformanceMetrics {
  netReturnPct: number;
  annualizedReturnPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  profitFactor: number;
  winRatePct: number;
  /** Average P&L per trade in currency units */
  expectancy: number;
  /** Expectancy as a fraction of risk (R-multiple) is not computed — currency-based */
  maxDrawdownPct: number;
  recoveryFactor: number;
  avgHoldingCandles: number;
  /** Fraction of candles with an open position */
  exposurePct: number;
  totalTrades: number;
  /** Trades per year, from candlesPerYear */
  tradesPerYear: number;
  totalFeesPaid: number;
  grossProfit: number;
  grossLoss: number;
}

/** Production-readiness thresholds. A strategy must satisfy ALL of them. */
export interface StrategyThresholds {
  minProfitFactor: number;
  minSharpe: number;
  maxDrawdownPct: number;
  minTrades: number;
  minNetReturnPct: number;
}

export const PRODUCTION_THRESHOLDS: StrategyThresholds = {
  minProfitFactor: 1.5,
  minSharpe: 1.5,
  maxDrawdownPct: 25,
  minTrades: 30,
  minNetReturnPct: 0,
};

export interface ThresholdEvaluation {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; actual: number; required: number }>;
}
