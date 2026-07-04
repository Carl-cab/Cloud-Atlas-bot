#!/usr/bin/env -S npx vite-node
// =============================================================================
// Portfolio Backtest — N-asset equal-weight trend following
//
// Usage:
//   npx vite-node scripts/run-portfolio-backtest.ts [interval-minutes]
//
// Runs walk-forward trend following independently per asset at the given
// interval, then measures the diversification benefit of combining their
// stitched OUT-OF-SAMPLE equity curves:
//   1. Per-asset OOS metrics (Sharpe, return, drawdown, trades)
//   2. Full return-correlation matrix
//   3. Diversification curve: portfolio Sharpe as assets are added one at a
//      time (best-Sharpe-first), so you can see whether breadth helps
//   4. Full equal-weight portfolio metrics + portfolio-level threshold checks
//
// Same signals, same costs, same walk-forward discipline as the single-asset
// runner — only capital allocation differs. Per-candle equal-weight
// rebalancing is idealized; treat portfolio Sharpe as an upper bound.
// =============================================================================

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  alignByTimestamp,
  computeMetrics,
  correlationMatrix,
  createTrendFollowingStrategy,
  curveReturns,
  DEFAULT_BACKTEST_CONFIG,
  equalWeightPortfolio,
  evaluateThresholds,
  PRODUCTION_THRESHOLDS,
  TREND_PARAM_GRID,
  walkForward,
  type BacktestConfig,
  type EquityPoint,
  type HistoricalDataset,
} from '../src/lib/backtest';

const DATA_DIR = path.join(process.cwd(), 'data', 'historical');
const REPORT_DIR = path.join(process.cwd(), 'reports', 'backtests');
const INTERVAL = parseInt(process.argv[2] ?? '1440', 10);
const CANDLES_PER_YEAR: Record<number, number> = { 1440: 365, 240: 2190, 60: 8760 };

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : 'n/a';
}

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(`_${INTERVAL}m.json`)).sort();
if (files.length < 2) {
  console.error(`Need at least 2 datasets at ${INTERVAL}m in data/historical/ (found ${files.length}).`);
  console.error('Fetch more assets first:  node scripts/fetch-historical-data.mjs --deep');
  process.exit(1);
}

const config: BacktestConfig = {
  ...DEFAULT_BACKTEST_CONFIG,
  candlesPerYear: CANDLES_PER_YEAR[INTERVAL] ?? 365,
};

interface AssetRun {
  pair: string;
  curve: EquityPoint[];
  oosTrades: number;
  sharpe: number;
  netReturnPct: number;
  maxDrawdownPct: number;
}

console.log(`\nPer-asset walk-forward trend following @ ${INTERVAL}m (full Kraken taker costs):`);
const runs: AssetRun[] = [];
for (const file of files) {
  const dataset: HistoricalDataset = JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  const trainSize = Math.floor(dataset.candles.length * 0.4);
  const testSize = Math.floor(dataset.candles.length * 0.15);
  const wf = walkForward(
    dataset.candles,
    TREND_PARAM_GRID,
    (p) => createTrendFollowingStrategy(p),
    config,
    { trainSize, testSize, minTrainTrades: 5 }
  );
  if (!wf.outOfSample || wf.outOfSampleEquityCurve.length === 0) {
    console.log(`  ${dataset.pair.padEnd(10)} — insufficient walk-forward data, skipped`);
    continue;
  }
  runs.push({
    pair: dataset.pair,
    curve: wf.outOfSampleEquityCurve,
    oosTrades: wf.totalOutOfSampleTrades,
    sharpe: wf.outOfSample.sharpeRatio,
    netReturnPct: wf.outOfSample.netReturnPct,
    maxDrawdownPct: wf.outOfSample.maxDrawdownPct,
  });
  console.log(`  ${dataset.pair.padEnd(10)} OOS: net=${fmt(wf.outOfSample.netReturnPct).padStart(7)}%  sharpe=${fmt(wf.outOfSample.sharpeRatio).padStart(6)}  DD=${fmt(wf.outOfSample.maxDrawdownPct).padStart(5)}%  trades=${wf.totalOutOfSampleTrades}`);
}

if (runs.length < 2) {
  console.error('\nFewer than 2 assets produced OOS curves — no portfolio to analyze.');
  process.exit(1);
}

// --- Correlation matrix over aligned OOS returns ---
const alignedAll = alignByTimestamp(runs.map((r) => r.curve));
const alignedReturns = alignedAll.map(curveReturns);
console.log(`\nAligned OOS candles across ${runs.length} assets: ${alignedAll[0].length}`);
const corr = correlationMatrix(alignedReturns);
console.log('\nOOS return correlation matrix:');
console.log('           ' + runs.map((r) => r.pair.slice(0, 8).padStart(9)).join(''));
for (let i = 0; i < runs.length; i++) {
  console.log('  ' + runs[i].pair.slice(0, 8).padEnd(9) + corr[i].map((c) => fmt(c, 2).padStart(9)).join(''));
}
const offDiag = corr.flatMap((row, i) => row.filter((_, j) => j > i));
const avgCorr = offDiag.reduce((a, b) => a + b, 0) / offDiag.length;
console.log(`  Average pairwise correlation: ${fmt(avgCorr, 3)}`);

// --- Diversification curve: add assets best-Sharpe-first ---
console.log('\nDiversification curve (equal-weight, best-Sharpe-first):');
const ordered = [...runs].sort((a, b) => b.sharpe - a.sharpe);
const diversification: Array<{ n: number; assets: string[]; sharpe: number; netReturnPct: number; maxDrawdownPct: number }> = [];
for (let n = 1; n <= ordered.length; n++) {
  const subset = ordered.slice(0, n);
  const aligned = alignByTimestamp(subset.map((r) => r.curve));
  const pCurve = n === 1 ? subset[0].curve : equalWeightPortfolio(aligned, config.initialEquity);
  const m = computeMetrics({
    strategyId: 'portfolio', params: {}, config,
    trades: [], equityCurve: pCurve, finalEquity: pCurve[pCurve.length - 1].equity,
    totalFeesPaid: 0, candlesTested: pCurve.length, candlesInPosition: 0,
  });
  diversification.push({ n, assets: subset.map((r) => r.pair), sharpe: m.sharpeRatio, netReturnPct: m.netReturnPct, maxDrawdownPct: m.maxDrawdownPct });
  console.log(`  N=${n}  ${subset.map((r) => r.pair).join('+').padEnd(40)} sharpe=${fmt(m.sharpeRatio).padStart(6)}  net=${fmt(m.netReturnPct).padStart(7)}%  DD=${fmt(m.maxDrawdownPct).padStart(5)}%`);
}

// --- Full equal-weight portfolio ---
const fullCurve = equalWeightPortfolio(alignedAll, config.initialEquity);
const portfolioMetrics = computeMetrics({
  strategyId: 'portfolio-all', params: {}, config,
  trades: [], equityCurve: fullCurve, finalEquity: fullCurve[fullCurve.length - 1].equity,
  totalFeesPaid: 0, candlesTested: fullCurve.length, candlesInPosition: 0,
});
const totalTrades = runs.reduce((a, r) => a + r.oosTrades, 0);

console.log(`\nFULL EQUAL-WEIGHT PORTFOLIO (${runs.map((r) => r.pair).join(' + ')}) @ ${INTERVAL}m — OOS:`);
console.log(`  Net return:        ${fmt(portfolioMetrics.netReturnPct)}%`);
console.log(`  Annualized return: ${fmt(portfolioMetrics.annualizedReturnPct)}%`);
console.log(`  Sharpe:            ${fmt(portfolioMetrics.sharpeRatio)}   Sortino: ${fmt(portfolioMetrics.sortinoRatio)}   Calmar: ${fmt(portfolioMetrics.calmarRatio)}`);
console.log(`  Max drawdown:      ${fmt(portfolioMetrics.maxDrawdownPct)}%`);
console.log(`  Combined OOS trades: ${totalTrades}`);

const curveChecks = evaluateThresholds(
  { ...portfolioMetrics, profitFactor: Infinity, expectancy: 1, totalTrades },
  PRODUCTION_THRESHOLDS
).checks.filter((c) => ['Sharpe Ratio', 'Max Drawdown (≤)', 'Net Return After Costs (>)', 'Trade Count (≥)'].includes(c.name));
console.log(`\n  PORTFOLIO-LEVEL THRESHOLD CHECKS:`);
for (const c of curveChecks) {
  console.log(`    [${c.passed ? 'PASS' : 'FAIL'}] ${c.name}: ${fmt(c.actual)} (required ${fmt(c.required)})`);
}
console.log('\n  Note: per-candle rebalancing is idealized — treat the portfolio Sharpe as an upper bound for this allocation scheme.');

mkdirSync(REPORT_DIR, { recursive: true });
const reportFile = path.join(REPORT_DIR, `portfolio-${INTERVAL}m-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(reportFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  interval: INTERVAL,
  strategy: 'trend-following-ema-atr',
  thresholds: PRODUCTION_THRESHOLDS,
  perAsset: runs.map((r) => ({ pair: r.pair, sharpe: r.sharpe, netReturnPct: r.netReturnPct, maxDrawdownPct: r.maxDrawdownPct, oosTrades: r.oosTrades })),
  correlationMatrix: corr,
  averagePairwiseCorrelation: avgCorr,
  diversificationCurve: diversification,
  fullPortfolio: portfolioMetrics,
}, null, 2));
console.log(`\nReport written: ${reportFile}`);
