// =============================================================================
// RSI Mean Reversion Strategy — Correctness Tests
//
// Synthetic candles verify strategy LOGIC only — never profitability.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  createRsiMeanReversionStrategy,
  RSI_MR_PARAM_GRID,
  runBacktest,
  rsi,
  ZERO_COSTS,
} from '@/lib/backtest';
import type { BacktestConfig, Candle } from '@/lib/backtest';

let day = 1;
function mk(o: number, h: number, l: number, c: number, v = 100): Candle {
  return { t: new Date(2020, 0, day++).toISOString(), o, h, l, c, v };
}

const config: BacktestConfig = {
  initialEquity: 10_000,
  riskPerTrade: 0.01,
  maxPositionFraction: 0.25,
  costs: ZERO_COSTS,
  allowShorts: false,
  candlesPerYear: 365,
};

const NO_FILTER_PARAMS = {
  rsiPeriod: 2,
  oversoldLevel: 15,
  exitLevel: 65,
  atrPeriod: 3,
  atrStopMultiple: 2,
  trendFilterPeriod: 0,
};

/** Rising base with a sharp 2-candle dip at `dipAt`, recovering after. */
function dipSeries(n: number, dipAt: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < n; i++) {
    let p = 100 + i * 0.5;
    if (i === dipAt) p -= 8;
    if (i === dipAt + 1) p -= 12;
    candles.push(mk(p, p + 1, p - 1, p));
  }
  return candles;
}

describe('rsi mean reversion strategy', () => {
  it('holds during warmup (NaN indicators)', () => {
    const strategy = createRsiMeanReversionStrategy(NO_FILTER_PARAMS);
    const candles = dipSeries(30, 15);
    expect(strategy.decide(candles, 1, null).action).toBe('hold');
  });

  it('enters long when RSI drops below the oversold level, with a stop below the close', () => {
    const candles = dipSeries(30, 15);
    const strategy = createRsiMeanReversionStrategy(NO_FILTER_PARAMS);
    const rsiValues = rsi(candles, NO_FILTER_PARAMS.rsiPeriod);

    let entry: { index: number; stopLoss?: number } | null = null;
    for (let i = strategy.warmup; i < candles.length; i++) {
      const d = strategy.decide(candles, i, null);
      if (d.action === 'enter_long') {
        entry = { index: i, stopLoss: d.stopLoss };
        break;
      }
    }
    expect(entry).not.toBeNull();
    expect(rsiValues[entry!.index]).toBeLessThan(NO_FILTER_PARAMS.oversoldLevel);
    expect(entry!.stopLoss).toBeLessThan(candles[entry!.index].c);
  });

  it('exits when RSI recovers above the exit level', () => {
    const candles = dipSeries(30, 15);
    const strategy = createRsiMeanReversionStrategy(NO_FILTER_PARAMS);
    const rsiValues = rsi(candles, NO_FILTER_PARAMS.rsiPeriod);
    const position = {
      side: 'long' as const,
      entryPrice: 95,
      entryIndex: 17,
      quantity: 1,
      stopLoss: 80,
      takeProfit: null,
    };
    // Find a post-dip candle where RSI has recovered and confirm the exit
    let sawExit = false;
    for (let i = 18; i < candles.length; i++) {
      const d = strategy.decide(candles, i, position);
      if (d.action === 'exit') {
        expect(rsiValues[i]).toBeGreaterThan(NO_FILTER_PARAMS.exitLevel);
        sawExit = true;
        break;
      }
    }
    expect(sawExit).toBe(true);
  });

  it('suppresses entries below the trend filter SMA', () => {
    // Downtrend: dips happen but price is always below the trailing SMA
    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      const p = 200 - i * 2;
      candles.push(mk(p, p + 1, p - 1, p));
    }
    const strategy = createRsiMeanReversionStrategy({
      ...NO_FILTER_PARAMS,
      trendFilterPeriod: 20,
    });
    for (let i = strategy.warmup; i < candles.length; i++) {
      expect(strategy.decide(candles, i, null).action).toBe('hold');
    }
  });

  it('runs end-to-end through the engine with exact P&L accounting', () => {
    // Several dips in a rising market to force multiple round trips
    const candles: Candle[] = [];
    for (let i = 0; i < 120; i++) {
      let p = 100 + i * 0.5;
      if (i % 25 === 10) p -= 8;
      if (i % 25 === 11) p -= 12;
      candles.push(mk(p, p + 1, p - 1, p));
    }
    const strategy = createRsiMeanReversionStrategy(NO_FILTER_PARAMS);
    const result = runBacktest(strategy, candles, config);

    expect(result.trades.length).toBeGreaterThan(0);
    const totalPnl = result.trades.reduce((a, t) => a + t.pnl, 0);
    expect(result.finalEquity - config.initialEquity).toBeCloseTo(totalPnl, 6);
  });

  it('has a coarse parameter grid (overfitting guard)', () => {
    expect(RSI_MR_PARAM_GRID.length).toBeLessThanOrEqual(24);
    for (const p of RSI_MR_PARAM_GRID) {
      expect(p.rsiPeriod).toBeGreaterThan(0);
      expect(p.oversoldLevel).toBeLessThan(p.exitLevel);
    }
  });
});
