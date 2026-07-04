#!/usr/bin/env -S npx vite-node
// =============================================================================
// Portfolio Backtest — equal-weight multi-asset trend following
//
// Usage:
//   npx vite-node scripts/run-portfolio-backtest.ts [interval-minutes]
//
// Runs walk-forward trend following independently per asset, then combines
// the stitched OUT-OF-SAMPLE equity curves into an equal-weight portfolio
// (per-candle rebalanced: portfolio return = mean of asset returns).
//
// This measures the diversification benefit honestly: same signals, same
// costs, same walk-forward discipline — only the capital allocation differs.
// Assumption to note: per-candle equal-weight rebalancing is idealized; a
// live implementation rebalances less often, so treat the portfolio Sharpe
// as an upper bound on this particular benefit.
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  computeMetrics,
  createTrendFollowingStrategy,
  DEFAULT_BACKTEST_CONFIG,
  evaluateThresholds,
  PRODUCTION_THRESHOLDS,
  TREND_PARAM_GRID,
  walkForward,
  type BacktestConfig,
  type EquityPoint,
  type HistoricalDataset,
} from '../src/lib/backtest';

const DATA_DIR = path.join(process.cwd(), 'data', 'historical');
const INTERVAL = parseInt(process.argv[2] ?? '240', 10);
const CANDLES_PER_YEAR: Record<number, number> = { 1440: 365, 240: 2190, 60: 8760 };

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : 'n/a';
}

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(`_${INTERVAL}m.json`));
if (files.length < 2) {
  console.error(`Need at least 2 datasets at ${INTERVAL}m in data/historical/ (found ${files.length}).`);
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
    console.error(`Skipping ${dataset.pair}: insufficient walk-forward data`);
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
  console.log(`${dataset.pair}@${INTERVAL}m OOS: net=${fmt(wf.outOfSample.netReturnPct)}%  sharpe=${fmt(wf.outOfSample.sharpeRatio)}  DD=${fmt(wf.outOfSample.maxDrawdownPct)}%  trades=${wf.totalOutOfSampleTrades}`);
}

if (runs.length < 2) {
  console.error('Fewer than 2 assets produced OOS curves — no portfolio to analyze.');
  process.exit(1);
}

// --- Align curves by timestamp intersection ---
const common = runs
  .map((r) => new Set(r.curve.map((p) => p.t)))
  .reduce((a, b) => new Set([...a].filter((t) => b.has(t))));
const aligned = runs.map((r) => r.curve.filter((p) => common.has(p.t)));
const n = aligned[0].length;
console.log(`\nAligned OOS candles across ${runs.length} assets: ${n}`);

// --- Per-candle returns per asset, then equal-weight portfolio returns ---
const assetReturns = aligned.map((curve) => {
  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    rets.push(curve[i - 1].equity > 0 ? curve[i].equity / curve[i - 1].equity - 1 : 0);
  }
  return rets;
});

// Pairwise return correlation (diversification driver)
if (runs.length === 2) {
  const [a, b] = assetReturns;
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  const corr = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
  console.log(`OOS return correlation ${runs[0].pair} vs ${runs[1].pair}: ${fmt(corr, 3)}`);
}

const portfolioCurve: EquityPoint[] = [{ t: aligned[0][0].t, equity: config.initialEquity }];
for (let i = 0; i < assetReturns[0].length; i++) {
  const r = assetReturns.reduce((sum, rets) => sum + rets[i], 0) / assetReturns.length;
  portfolioCurve.push({
    t: aligned[0][i + 1].t,
    equity: portfolioCurve[i].equity * (1 + r),
  });
}

const totalTrades = runs.reduce((a, r) => a + r.oosTrades, 0);
const portfolioMetrics = computeMetrics({
  strategyId: 'portfolio-trend-following',
  params: {},
  config,
  trades: [],
  equityCurve: portfolioCurve,
  finalEquity: portfolioCurve[portfolioCurve.length - 1].equity,
  totalFeesPaid: 0,
  candlesTested: portfolioCurve.length,
  candlesInPosition: 0,
});

console.log(`\nEQUAL-WEIGHT PORTFOLIO (${runs.map((r) => r.pair).join(' + ')}) @ ${INTERVAL}m — OOS:`);
console.log(`  Net return:        ${fmt(portfolioMetrics.netReturnPct)}%`);
console.log(`  Annualized return: ${fmt(portfolioMetrics.annualizedReturnPct)}%`);
console.log(`  Sharpe:            ${fmt(portfolioMetrics.sharpeRatio)}   Sortino: ${fmt(portfolioMetrics.sortinoRatio)}   Calmar: ${fmt(portfolioMetrics.calmarRatio)}`);
console.log(`  Max drawdown:      ${fmt(portfolioMetrics.maxDrawdownPct)}%`);
console.log(`  Combined OOS trades: ${totalTrades}`);

// Curve-level thresholds (trade-level stats like PF are per-asset, reported above)
const curveChecks = evaluateThresholds(
  { ...portfolioMetrics, profitFactor: Infinity, expectancy: 1, totalTrades },
  PRODUCTION_THRESHOLDS
).checks.filter((c) => ['Sharpe Ratio', 'Max Drawdown (≤)', 'Net Return After Costs (>)', 'Trade Count (≥)'].includes(c.name));
console.log(`\n  PORTFOLIO-LEVEL THRESHOLD CHECKS:`);
for (const c of curveChecks) {
  console.log(`    [${c.passed ? 'PASS' : 'FAIL'}] ${c.name}: ${fmt(c.actual)} (required ${fmt(c.required)})`);
}
console.log('\n  Note: per-candle rebalancing is idealized — treat the portfolio Sharpe as an upper bound for this allocation scheme.');
