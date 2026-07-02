// =============================================================================
// Performance Metrics
//
// Computed from the equity curve (per-candle mark-to-market) and the trade
// list. Annualization uses config.candlesPerYear so the same math works for
// 1d, 4h, and 1h data. Ratios that would divide by zero return 0 (not
// Infinity) so a strategy with no losses and 2 trades cannot masquerade as
// having an infinite Sharpe.
// =============================================================================

import type {
  BacktestResult,
  PerformanceMetrics,
  StrategyThresholds,
  ThresholdEvaluation,
} from './types';

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function computeMetrics(result: BacktestResult): PerformanceMetrics {
  const { trades, equityCurve, config, finalEquity } = result;
  const initial = config.initialEquity;

  // Per-candle simple returns from the equity curve
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) returns.push(equityCurve[i].equity / prev - 1);
  }

  const netReturnPct = ((finalEquity - initial) / initial) * 100;
  const years = equityCurve.length / config.candlesPerYear;
  const annualizedReturnPct = years > 0 && finalEquity > 0
    ? (Math.pow(finalEquity / initial, 1 / years) - 1) * 100
    : 0;

  // Sharpe (risk-free rate assumed 0) and Sortino, annualized
  const mu = mean(returns);
  const sigma = stddev(returns);
  const sharpeRatio = sigma > 0 ? (mu / sigma) * Math.sqrt(config.candlesPerYear) : 0;

  const downside = returns.filter((r) => r < 0);
  const downsideDev = downside.length > 0
    ? Math.sqrt(downside.reduce((a, r) => a + r ** 2, 0) / returns.length)
    : 0;
  const sortinoRatio = downsideDev > 0 ? (mu / downsideDev) * Math.sqrt(config.candlesPerYear) : 0;

  // Max drawdown from equity curve
  let peak = initial;
  let maxDrawdownPct = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = ((peak - point.equity) / peak) * 100;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  const calmarRatio = maxDrawdownPct > 0 ? annualizedReturnPct / maxDrawdownPct : 0;

  // Trade statistics
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;
  const winRatePct = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const expectancy = trades.length > 0
    ? trades.reduce((a, t) => a + t.pnl, 0) / trades.length
    : 0;

  const netProfit = finalEquity - initial;
  const maxDrawdownAbs = (maxDrawdownPct / 100) * peak;
  const recoveryFactor = maxDrawdownAbs > 0 ? netProfit / maxDrawdownAbs : 0;

  const avgHoldingCandles = trades.length > 0
    ? trades.reduce((a, t) => a + t.holdingCandles, 0) / trades.length
    : 0;

  const exposurePct = result.candlesTested > 0
    ? (result.candlesInPosition / result.candlesTested) * 100
    : 0;

  const tradesPerYear = years > 0 ? trades.length / years : 0;

  return {
    netReturnPct,
    annualizedReturnPct,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    profitFactor,
    winRatePct,
    expectancy,
    maxDrawdownPct,
    recoveryFactor,
    avgHoldingCandles,
    exposurePct,
    totalTrades: trades.length,
    tradesPerYear,
    totalFeesPaid: result.totalFeesPaid,
    grossProfit,
    grossLoss,
  };
}

export function evaluateThresholds(
  metrics: PerformanceMetrics,
  thresholds: StrategyThresholds
): ThresholdEvaluation {
  const checks = [
    {
      name: 'Profit Factor',
      passed: metrics.profitFactor > thresholds.minProfitFactor,
      actual: metrics.profitFactor,
      required: thresholds.minProfitFactor,
    },
    {
      name: 'Sharpe Ratio',
      passed: metrics.sharpeRatio > thresholds.minSharpe,
      actual: metrics.sharpeRatio,
      required: thresholds.minSharpe,
    },
    {
      name: 'Max Drawdown (≤)',
      passed: metrics.maxDrawdownPct <= thresholds.maxDrawdownPct,
      actual: metrics.maxDrawdownPct,
      required: thresholds.maxDrawdownPct,
    },
    {
      name: 'Trade Count (≥)',
      passed: metrics.totalTrades >= thresholds.minTrades,
      actual: metrics.totalTrades,
      required: thresholds.minTrades,
    },
    {
      name: 'Net Return After Costs (>)',
      passed: metrics.netReturnPct > thresholds.minNetReturnPct,
      actual: metrics.netReturnPct,
      required: thresholds.minNetReturnPct,
    },
    {
      name: 'Positive Expectancy (>)',
      passed: metrics.expectancy > 0,
      actual: metrics.expectancy,
      required: 0,
    },
  ];

  return { passed: checks.every((c) => c.passed), checks };
}
