// Backtesting framework — public API
export * from './types';
export * from './indicators';
export { runBacktest } from './engine';
export { computeMetrics, evaluateThresholds } from './metrics';
export { walkForward } from './walkforward';
export type { WalkForwardConfig, WalkForwardResult, WalkForwardWindow } from './walkforward';
export {
  createTrendFollowingStrategy,
  DEFAULT_TREND_PARAMS,
  TREND_PARAM_GRID,
} from './strategies/trend-following';
export type { TrendFollowingParams } from './strategies/trend-following';
