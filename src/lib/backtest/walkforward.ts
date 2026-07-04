// =============================================================================
// Walk-Forward Validation
//
// Rolling optimization: for each window, pick the best parameter set on the
// TRAIN slice (by Sharpe, requiring a minimum trade count), then evaluate it
// on the following unseen TEST slice. The strategy's verdict comes from the
// stitched out-of-sample results only — in-sample numbers are reported for
// reference but carry no weight.
//
// Indicators warm up on candles before each test slice via the engine's
// startIndex, so the test window is never granted lookahead or robbed of
// its early candles.
// =============================================================================

import { runBacktest } from './engine';
import { computeMetrics } from './metrics';
import type {
  BacktestConfig,
  BacktestStrategy,
  Candle,
  EquityPoint,
  PerformanceMetrics,
} from './types';

export interface WalkForwardConfig {
  /** Candles in each optimization (train) window */
  trainSize: number;
  /** Candles in each out-of-sample (test) window */
  testSize: number;
  /** Minimum trades a param set must produce in-sample to be selectable */
  minTrainTrades: number;
}

export interface WalkForwardWindow<P> {
  windowIndex: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  chosenParams: P;
  trainMetrics: PerformanceMetrics;
  testMetrics: PerformanceMetrics;
}

export interface SkippedWindow {
  trainStart: number;
  trainEnd: number;
  reason: string;
}

export interface WalkForwardResult<P> {
  windows: Array<WalkForwardWindow<P>>;
  /** Windows that produced no evaluation, with the reason (diagnostics) */
  skippedWindows: SkippedWindow[];
  /** Metrics over the stitched out-of-sample equity curve — the number that matters */
  outOfSample: PerformanceMetrics | null;
  /** The stitched OOS equity curve itself (for portfolio-level analysis) */
  outOfSampleEquityCurve: EquityPoint[];
  /** Fraction of windows with positive out-of-sample net return */
  windowConsistency: number;
  totalOutOfSampleTrades: number;
}

export function walkForward<P>(
  candles: Candle[],
  paramGrid: P[],
  makeStrategy: (params: P) => BacktestStrategy,
  config: BacktestConfig,
  wfConfig: WalkForwardConfig
): WalkForwardResult<P> {
  const { trainSize, testSize, minTrainTrades } = wfConfig;
  const windows: Array<WalkForwardWindow<P>> = [];
  const skippedWindows: SkippedWindow[] = [];

  // Stitched OOS equity: compound each window's return onto running equity.
  let stitchedEquity = config.initialEquity;
  const stitchedCurve: Array<{ t: string; equity: number }> = [];
  const stitchedTradePnls: Array<{ pnl: number; holdingCandles: number }> = [];
  let stitchedFees = 0;
  let stitchedCandles = 0;
  let stitchedCandlesInPosition = 0;

  for (
    let trainStart = 0;
    trainStart + trainSize + testSize <= candles.length;
    trainStart += testSize
  ) {
    const trainEnd = trainStart + trainSize;
    const testEnd = trainEnd + testSize;

    // --- Optimize on train slice ---
    let bestParams: P | null = null;
    let bestScore = -Infinity;
    let bestTrainMetrics: PerformanceMetrics | null = null;
    let maxTradesSeen = 0;

    for (const params of paramGrid) {
      const strategy = makeStrategy(params);
      const trainSlice = candles.slice(trainStart, trainEnd);
      const result = runBacktest(strategy, trainSlice, config);
      const metrics = computeMetrics(result);
      maxTradesSeen = Math.max(maxTradesSeen, metrics.totalTrades);
      if (metrics.totalTrades < minTrainTrades) continue;
      if (metrics.sharpeRatio > bestScore) {
        bestScore = metrics.sharpeRatio;
        bestParams = params;
        bestTrainMetrics = metrics;
      }
    }

    if (bestParams === null || bestTrainMetrics === null) {
      skippedWindows.push({
        trainStart,
        trainEnd,
        reason: `no param set reached minTrainTrades=${minTrainTrades} in-sample (best: ${maxTradesSeen} trades over ${trainSize} candles)`,
      });
      continue;
    }

    // --- Evaluate on unseen test slice (warmup from train candles) ---
    const strategy = makeStrategy(bestParams);
    const evalSlice = candles.slice(trainStart, testEnd);
    const testConfig: BacktestConfig = {
      ...config,
      initialEquity: stitchedEquity,
      startIndex: trainEnd - trainStart,
    };
    const testResult = runBacktest(strategy, evalSlice, testConfig);
    const testMetrics = computeMetrics(testResult);

    windows.push({
      windowIndex: windows.length,
      trainStart,
      trainEnd,
      testStart: trainEnd,
      testEnd,
      chosenParams: bestParams,
      trainMetrics: bestTrainMetrics,
      testMetrics,
    });

    stitchedCurve.push(...testResult.equityCurve);
    stitchedTradePnls.push(
      ...testResult.trades.map((t) => ({ pnl: t.pnl, holdingCandles: t.holdingCandles }))
    );
    stitchedFees += testResult.totalFeesPaid;
    stitchedCandles += testResult.candlesTested;
    stitchedCandlesInPosition += testResult.candlesInPosition;
    stitchedEquity = testResult.finalEquity;
  }

  let outOfSample: PerformanceMetrics | null = null;
  if (stitchedCurve.length > 0) {
    outOfSample = computeMetrics({
      strategyId: 'walk-forward-oos',
      params: {},
      config,
      trades: stitchedTradePnls.map((t) => ({
        side: 'long' as const,
        entryTime: '',
        exitTime: '',
        entryIndex: 0,
        exitIndex: t.holdingCandles,
        entryPrice: 1,
        exitPrice: 1,
        quantity: 1,
        feesPaid: 0,
        pnl: t.pnl,
        returnPct: 0,
        holdingCandles: t.holdingCandles,
        exitReason: 'signal' as const,
      })),
      equityCurve: stitchedCurve,
      finalEquity: stitchedEquity,
      totalFeesPaid: stitchedFees,
      candlesTested: stitchedCandles,
      candlesInPosition: stitchedCandlesInPosition,
    });
  }

  const positiveWindows = windows.filter((w) => w.testMetrics.netReturnPct > 0).length;
  return {
    windows,
    skippedWindows,
    outOfSample,
    outOfSampleEquityCurve: stitchedCurve,
    windowConsistency: windows.length > 0 ? positiveWindows / windows.length : 0,
    totalOutOfSampleTrades: stitchedTradePnls.length,
  };
}
