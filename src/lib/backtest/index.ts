// Backtesting framework — public API
export * from './types';
export * from './indicators';
export { runBacktest } from './engine';
export { computeMetrics, evaluateThresholds } from './metrics';
export { walkForward } from './walkforward';
export type { SkippedWindow, WalkForwardConfig, WalkForwardResult, WalkForwardWindow } from './walkforward';
export {
  createTrendFollowingStrategy,
  DEFAULT_TREND_PARAMS,
  TREND_PARAM_GRID,
} from './strategies/trend-following';
export type { TrendFollowingParams } from './strategies/trend-following';
export {
  createRsiMeanReversionStrategy,
  DEFAULT_RSI_MR_PARAMS,
  RSI_MR_PARAM_GRID,
} from './strategies/rsi-mean-reversion';
export type { RsiMeanReversionParams } from './strategies/rsi-mean-reversion';
