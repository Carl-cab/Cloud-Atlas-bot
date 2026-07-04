#!/usr/bin/env -S npx vite-node
// =============================================================================
// Multi-Edge Combination Analysis
//
// Tests the last diversification lever: combining genuinely DIFFERENT return
// streams (a trend-following asset portfolio + a volatility-expansion stream)
// rather than more same-strategy assets. Combining uncorrelated *edges* is
// what actually lifts Sharpe once single-strategy asset diversification has
// hit its ceiling.
//
// ⚠️ SELECTION-BIAS WARNING: this analysis selects the positive-OOS-Sharpe
// assets and the best strategy AFTER observing their out-of-sample results.
// That is in-sample selection on OOS data — the reported Sharpe is therefore
// OPTIMISTIC. Treat it as evidence of DIRECTION (does combining edges help?),
// NOT as an unbiased forward estimate. A gate decision needs pre-committed
// selection rules validated on a fresh holdout.
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  alignByTimestamp, computeMetrics, createTrendFollowingStrategy,
  createVolatilityExpansionStrategy, curveReturns, DEFAULT_BACKTEST_CONFIG,
  equalWeightPortfolio, pearson, TREND_PARAM_GRID, VOL_EXP_PARAM_GRID, walkForward,
  type BacktestConfig, type EquityPoint, type HistoricalDataset,
} from '../src/lib/backtest';

const INTERVAL = parseInt(process.argv[2] ?? '1440', 10);
const CANDLES_PER_YEAR: Record<number, number> = { 1440: 365, 240: 2190, 60: 8760 };
const config: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, candlesPerYear: CANDLES_PER_YEAR[INTERVAL] ?? 365 };
const DATA_DIR = path.join(process.cwd(), 'data', 'historical');
const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');

function oosCurve(candles: HistoricalDataset['candles'], grid: unknown[], make: (p: never) => ReturnType<typeof createTrendFollowingStrategy>) {
  const wf = walkForward(candles, grid as never[], make as never, config,
    { trainSize: Math.floor(candles.length * 0.4), testSize: Math.floor(candles.length * 0.15), minTrainTrades: 5 });
  return wf;
}

function metricsOf(curve: EquityPoint[]) {
  return computeMetrics({ strategyId: 'x', params: {}, config, trades: [], equityCurve: curve,
    finalEquity: curve[curve.length - 1].equity, totalFeesPaid: 0, candlesTested: curve.length, candlesInPosition: 0 });
}

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(`_${INTERVAL}m.json`)).sort();

// 1. Trend OOS per asset; keep only positive-Sharpe assets (BIASED selection).
const trend: Array<{ pair: string; curve: EquityPoint[]; sharpe: number }> = [];
for (const f of files) {
  const ds: HistoricalDataset = JSON.parse(readFileSync(path.join(DATA_DIR, f), 'utf-8'));
  const wf = oosCurve(ds.candles, TREND_PARAM_GRID, (p) => createTrendFollowingStrategy(p));
  if (wf.outOfSample && wf.outOfSampleEquityCurve.length) {
    trend.push({ pair: ds.pair, curve: wf.outOfSampleEquityCurve, sharpe: wf.outOfSample.sharpeRatio });
  }
}
const positive = trend.filter((t) => t.sharpe > 0).sort((a, b) => b.sharpe - a.sharpe);
console.log(`Positive-edge trend assets (biased selection): ${positive.map((p) => `${p.pair}(${fmt(p.sharpe)})`).join(', ')}`);

const trendPortfolio = equalWeightPortfolio(alignByTimestamp(positive.map((p) => p.curve)), config.initialEquity);
const trendM = metricsOf(trendPortfolio);
console.log(`\nTrend portfolio (top positive-edge assets): Sharpe=${fmt(trendM.sharpeRatio)}  net=${fmt(trendM.netReturnPct)}%  DD=${fmt(trendM.maxDrawdownPct)}%`);

// 2. Vol-expansion stream on BTC (the validated strategy's home turf).
const btcFile = files.find((f) => f.startsWith('BTC'));
if (!btcFile) { console.error('No BTC dataset; cannot build vol-expansion stream.'); process.exit(1); }
const btc: HistoricalDataset = JSON.parse(readFileSync(path.join(DATA_DIR, btcFile), 'utf-8'));
const volWf = oosCurve(btc.candles, VOL_EXP_PARAM_GRID, (p) => createVolatilityExpansionStrategy(p));
const volCurve = volWf.outOfSampleEquityCurve;
console.log(`Vol-expansion stream (BTC): Sharpe=${fmt(volWf.outOfSample!.sharpeRatio)}  net=${fmt(volWf.outOfSample!.netReturnPct)}%  DD=${fmt(volWf.outOfSample!.maxDrawdownPct)}%`);

// 3. Blend the two DIFFERENT edges.
const aligned = alignByTimestamp([trendPortfolio, volCurve]);
const corr = pearson(curveReturns(aligned[0]), curveReturns(aligned[1]));
const blend = equalWeightPortfolio(aligned, config.initialEquity);
const blendM = metricsOf(blend);
console.log(`\nStream correlation (trend vs vol-expansion): ${fmt(corr, 3)}`);
console.log(`EQUAL-WEIGHT MULTI-EDGE BLEND: Sharpe=${fmt(blendM.sharpeRatio)}  net=${fmt(blendM.netReturnPct)}%  DD=${fmt(blendM.maxDrawdownPct)}%   (gate: 1.5)`);
console.log(`\n⚠️  Selection-bias warning: assets/strategy chosen after seeing OOS results.`);
console.log(`   This Sharpe is OPTIMISTIC — evidence of direction, not an unbiased forward estimate.`);
