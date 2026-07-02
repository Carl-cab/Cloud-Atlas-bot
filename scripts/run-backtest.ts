#!/usr/bin/env -S npx vite-node
// =============================================================================
// Backtest Runner — Trend Following validation over real Kraken data
//
// Usage:
//   npx vite-node scripts/run-backtest.ts
//
// Reads datasets from data/historical/ (produced by fetch-historical-data.mjs),
// runs the trend-following strategy with default parameters, then runs
// walk-forward validation over the parameter grid. Prints the full metric
// table and the production-threshold verdict, and writes a JSON report to
// reports/backtests/.
//
// The go/no-go verdict is based on WALK-FORWARD OUT-OF-SAMPLE metrics with
// full Kraken taker costs — never on in-sample numbers.
// =============================================================================

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  computeMetrics,
  createTrendFollowingStrategy,
  DEFAULT_BACKTEST_CONFIG,
  DEFAULT_TREND_PARAMS,
  evaluateThresholds,
  PRODUCTION_THRESHOLDS,
  runBacktest,
  TREND_PARAM_GRID,
  walkForward,
  type BacktestConfig,
  type HistoricalDataset,
  type PerformanceMetrics,
} from '../src/lib/backtest';

const DATA_DIR = path.join(process.cwd(), 'data', 'historical');
const REPORT_DIR = path.join(process.cwd(), 'reports', 'backtests');

const CANDLES_PER_YEAR: Record<number, number> = {
  1440: 365,
  240: 2190,
  60: 8760,
};

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'n/a';
}

function printMetrics(label: string, m: PerformanceMetrics): void {
  console.log(`\n  ${label}`);
  console.log(`    Net return:        ${fmt(m.netReturnPct)}%`);
  console.log(`    Annualized return: ${fmt(m.annualizedReturnPct)}%`);
  console.log(`    Sharpe:            ${fmt(m.sharpeRatio)}   Sortino: ${fmt(m.sortinoRatio)}   Calmar: ${fmt(m.calmarRatio)}`);
  console.log(`    Profit factor:     ${fmt(m.profitFactor)}   Win rate: ${fmt(m.winRatePct, 1)}%   Expectancy: $${fmt(m.expectancy)}`);
  console.log(`    Max drawdown:      ${fmt(m.maxDrawdownPct)}%   Recovery factor: ${fmt(m.recoveryFactor)}`);
  console.log(`    Trades:            ${m.totalTrades} (${fmt(m.tradesPerYear, 1)}/yr)   Avg hold: ${fmt(m.avgHoldingCandles, 1)} candles   Exposure: ${fmt(m.exposurePct, 1)}%`);
  console.log(`    Fees paid:         $${fmt(m.totalFeesPaid)}   Gross P: $${fmt(m.grossProfit)}   Gross L: $${fmt(m.grossLoss)}`);
}

let datasets: string[] = [];
try {
  datasets = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
} catch {
  // handled below
}

if (datasets.length === 0) {
  console.error('No historical data found in data/historical/.');
  console.error('Fetch real data first:  node scripts/fetch-historical-data.mjs');
  console.error('Backtests are only meaningful on real market data — this runner will not generate synthetic candles.');
  process.exit(1);
}

const report: Record<string, unknown>[] = [];

for (const file of datasets) {
  const dataset: HistoricalDataset = JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  const candlesPerYear = CANDLES_PER_YEAR[dataset.interval] ?? 365;
  const config: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, candlesPerYear };

  console.log('\n' + '='.repeat(78));
  console.log(`DATASET: ${dataset.pair} @ ${dataset.interval}m — ${dataset.candles.length} candles`);
  console.log(`  ${dataset.candles[0]?.t} → ${dataset.candles[dataset.candles.length - 1]?.t}`);
  console.log(`  Source: ${dataset.source} (fetched ${dataset.fetchedAt})`);
  console.log(`  Costs: fee ${config.costs.feeRate * 100}%/side, slippage ${config.costs.slippageBps}bps, spread ${config.costs.spreadBps}bps`);

  // --- Full-sample run with default params (reference only) ---
  const strategy = createTrendFollowingStrategy(DEFAULT_TREND_PARAMS);
  const result = runBacktest(strategy, dataset.candles, config);
  const metrics = computeMetrics(result);
  printMetrics(`FULL SAMPLE (default params ${JSON.stringify(DEFAULT_TREND_PARAMS)}) — reference only`, metrics);

  // --- Walk-forward validation (the verdict) ---
  const trainSize = Math.floor(dataset.candles.length * 0.4);
  const testSize = Math.floor(dataset.candles.length * 0.15);
  const wf = walkForward(
    dataset.candles,
    TREND_PARAM_GRID,
    (p) => createTrendFollowingStrategy(p),
    config,
    { trainSize, testSize, minTrainTrades: 5 }
  );

  console.log(`\n  WALK-FORWARD: ${wf.windows.length} windows (train ${trainSize} / test ${testSize} candles)`);
  for (const w of wf.windows) {
    console.log(`    window ${w.windowIndex}: params=${JSON.stringify(w.chosenParams)}  IS Sharpe=${fmt(w.trainMetrics.sharpeRatio)}  OOS return=${fmt(w.testMetrics.netReturnPct)}%  OOS trades=${w.testMetrics.totalTrades}`);
  }
  console.log(`    Window consistency: ${fmt(wf.windowConsistency * 100, 0)}% of windows OOS-positive`);

  let verdictLine = 'INSUFFICIENT DATA for walk-forward';
  let evaluation = null;
  if (wf.outOfSample) {
    printMetrics('OUT-OF-SAMPLE (stitched walk-forward) — THE NUMBER THAT MATTERS', wf.outOfSample);
    evaluation = evaluateThresholds(wf.outOfSample, PRODUCTION_THRESHOLDS);
    console.log(`\n  PRODUCTION THRESHOLDS (${dataset.pair} @ ${dataset.interval}m):`);
    for (const c of evaluation.checks) {
      console.log(`    [${c.passed ? 'PASS' : 'FAIL'}] ${c.name}: ${fmt(c.actual)} (required ${fmt(c.required)})`);
    }
    verdictLine = evaluation.passed ? 'PASSES all production thresholds' : 'DOES NOT PASS production thresholds';
  }
  console.log(`\n  VERDICT: ${verdictLine}`);

  report.push({
    dataset: { pair: dataset.pair, interval: dataset.interval, candles: dataset.candles.length, from: dataset.candles[0]?.t, to: dataset.candles[dataset.candles.length - 1]?.t },
    strategy: 'trend-following-ema-atr',
    costs: config.costs,
    fullSample: metrics,
    walkForward: {
      windows: wf.windows.map((w) => ({ params: w.chosenParams, inSampleSharpe: w.trainMetrics.sharpeRatio, oosReturnPct: w.testMetrics.netReturnPct, oosTrades: w.testMetrics.totalTrades })),
      outOfSample: wf.outOfSample,
      windowConsistency: wf.windowConsistency,
    },
    thresholdEvaluation: evaluation,
  });
}

mkdirSync(REPORT_DIR, { recursive: true });
const reportFile = path.join(REPORT_DIR, `trend-following-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(reportFile, JSON.stringify({ generatedAt: new Date().toISOString(), thresholds: PRODUCTION_THRESHOLDS, results: report }, null, 2));
console.log(`\nReport written: ${reportFile}`);
