// =============================================================================
// Donchian Breakout & Volatility Expansion — Correctness Tests
//
// Synthetic candles verify strategy LOGIC only — never profitability.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  createDonchianBreakoutStrategy,
  createVolatilityExpansionStrategy,
  DONCHIAN_PARAM_GRID,
  runBacktest,
  VOL_EXP_PARAM_GRID,
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

describe('donchian breakout strategy', () => {
  const params = { entryPeriod: 5, exitPeriod: 3, atrPeriod: 3, atrStopMultiple: 2 };

  it('enters long when close breaks the previous N-candle high', () => {
    // Flat range 100±2, then a candle closing above the 5-candle high
    const candles: Candle[] = [];
    for (let i = 0; i < 10; i++) candles.push(mk(100, 102, 98, 100));
    candles.push(mk(101, 106, 101, 105)); // close 105 > prior 5-high 102
    candles.push(mk(105, 106, 104, 105));

    const strategy = createDonchianBreakoutStrategy(params);
    const d = strategy.decide(candles, 10, null);
    expect(d.action).toBe('enter_long');
    expect(d.stopLoss).toBeLessThan(105);
  });

  it('does not trigger a breakout against its own high', () => {
    // A candle with a huge high but closing inside the prior range
    const candles: Candle[] = [];
    for (let i = 0; i < 10; i++) candles.push(mk(100, 102, 98, 100));
    candles.push(mk(100, 110, 99, 101)); // close 101 < prior 5-high 102
    const strategy = createDonchianBreakoutStrategy(params);
    expect(strategy.decide(candles, 10, null).action).toBe('hold');
  });

  it('exits when close breaks the previous exit-period low', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 10; i++) candles.push(mk(110, 112, 108, 110));
    candles.push(mk(108, 108, 104, 105)); // close 105 < prior 3-low 108
    const strategy = createDonchianBreakoutStrategy(params);
    const position = {
      side: 'long' as const, entryPrice: 110, entryIndex: 5,
      quantity: 1, stopLoss: 90, takeProfit: null,
    };
    expect(strategy.decide(candles, 10, position).action).toBe('exit');
  });

  it('runs end-to-end with exact P&L accounting', () => {
    // Wicks (±1) are smaller than trend steps (4) so closes strictly clear
    // the previous candle's high during the trend phase.
    const prices: number[] = [];
    for (let i = 0; i < 40; i++) prices.push(100 + (i % 5)); // range
    for (let i = 0; i < 40; i++) prices.push(110 + i * 4);   // breakout trend
    for (let i = 0; i < 40; i++) prices.push(266 - i * 4);   // collapse
    const candles = prices.map((p) => mk(p, p + 1, p - 1, p));
    const strategy = createDonchianBreakoutStrategy({ ...params, entryPeriod: 20, exitPeriod: 10 });
    const result = runBacktest(strategy, candles, config);
    expect(result.trades.length).toBeGreaterThan(0);
    const totalPnl = result.trades.reduce((a, t) => a + t.pnl, 0);
    expect(result.finalEquity - config.initialEquity).toBeCloseTo(totalPnl, 6);
  });

  it('has a coarse parameter grid (overfitting guard)', () => {
    expect(DONCHIAN_PARAM_GRID.length).toBeLessThanOrEqual(8);
  });
});

describe('volatility expansion strategy', () => {
  const params = { atrPeriod: 3, expansionMultiple: 2, atrStopMultiple: 2, maxHoldCandles: 5 };

  it('enters long on a bullish range-expansion bar', () => {
    // Quiet market (TR = 2), then a bullish bar with TR = 10 (5× baseline)
    const candles: Candle[] = [];
    for (let i = 0; i < 8; i++) candles.push(mk(100, 101, 99, 100));
    candles.push(mk(100, 110, 100, 109)); // TR 10 > 2×2, close > open
    const strategy = createVolatilityExpansionStrategy(params);
    const d = strategy.decide(candles, 8, null);
    expect(d.action).toBe('enter_long');
    expect(d.stopLoss).toBeLessThan(109);
  });

  it('ignores bearish expansion bars', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 8; i++) candles.push(mk(100, 101, 99, 100));
    candles.push(mk(100, 100, 90, 91)); // big range but closes down
    const strategy = createVolatilityExpansionStrategy(params);
    expect(strategy.decide(candles, 8, null).action).toBe('hold');
  });

  it('ignores normal-range bars', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 9; i++) candles.push(mk(100, 101, 99, 100.5));
    const strategy = createVolatilityExpansionStrategy(params);
    expect(strategy.decide(candles, 8, null).action).toBe('hold');
  });

  it('exits after maxHoldCandles', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) candles.push(mk(100, 101, 99, 100));
    const strategy = createVolatilityExpansionStrategy(params);
    const position = {
      side: 'long' as const, entryPrice: 100, entryIndex: 10,
      quantity: 1, stopLoss: 90, takeProfit: null,
    };
    expect(strategy.decide(candles, 14, position).action).toBe('hold'); // held 4
    expect(strategy.decide(candles, 15, position).action).toBe('exit'); // held 5
  });

  it('runs end-to-end with exact P&L accounting', () => {
    const candles: Candle[] = [];
    for (let block = 0; block < 6; block++) {
      for (let i = 0; i < 15; i++) candles.push(mk(100 + block * 5, 101 + block * 5, 99 + block * 5, 100 + block * 5));
      const base = 100 + block * 5;
      candles.push(mk(base, base + 12, base, base + 11)); // expansion bar
    }
    const strategy = createVolatilityExpansionStrategy(params);
    const result = runBacktest(strategy, candles, config);
    expect(result.trades.length).toBeGreaterThan(0);
    const totalPnl = result.trades.reduce((a, t) => a + t.pnl, 0);
    expect(result.finalEquity - config.initialEquity).toBeCloseTo(totalPnl, 6);
  });

  it('has a coarse parameter grid (overfitting guard)', () => {
    expect(VOL_EXP_PARAM_GRID.length).toBeLessThanOrEqual(8);
  });
});
