// =============================================================================
// Backtest Framework Correctness Tests
//
// Every scenario here uses SYNTHETIC candles constructed by hand so expected
// values can be computed on paper. Synthetic data is used ONLY to verify
// engine math — never as evidence of strategy profitability.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  atr,
  computeMetrics,
  createTrendFollowingStrategy,
  ema,
  evaluateThresholds,
  highestHigh,
  lowestLow,
  PRODUCTION_THRESHOLDS,
  rsi,
  runBacktest,
  sma,
  walkForward,
  ZERO_COSTS,
} from '@/lib/backtest';
import type {
  BacktestConfig,
  BacktestResult,
  BacktestStrategy,
  Candle,
  StrategyDecision,
} from '@/lib/backtest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mk(o: number, h: number, l: number, c: number, v = 100): Candle {
  return { t: new Date(2020, 0, mk.day++).toISOString(), o, h, l, c, v };
}
mk.day = 1;

function flatCandles(n: number, price = 100): Candle[] {
  return Array.from({ length: n }, () => mk(price, price, price, price));
}

/** Strategy that plays back a script of index → decision. */
function scripted(script: Record<number, StrategyDecision>, warmup = 0): BacktestStrategy {
  return {
    id: 'scripted',
    params: {},
    warmup,
    decide: (_candles, index) => script[index] ?? { action: 'hold' },
  };
}

const baseConfig: BacktestConfig = {
  initialEquity: 10_000,
  riskPerTrade: 0.01,
  maxPositionFraction: 0.25,
  costs: ZERO_COSTS,
  allowShorts: false,
  candlesPerYear: 365,
};

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

describe('indicators', () => {
  const closes = [1, 2, 3, 4, 5, 6];
  const candles = closes.map((c) => mk(c, c, c, c));

  it('SMA matches hand computation and is NaN before warmup', () => {
    const out = sma(candles, 3);
    expect(out[0]).toBeNaN();
    expect(out[1]).toBeNaN();
    expect(out[2]).toBeCloseTo(2); // (1+2+3)/3
    expect(out[5]).toBeCloseTo(5); // (4+5+6)/3
  });

  it('EMA seeds with SMA and applies smoothing factor', () => {
    const out = ema(candles, 3);
    expect(out[1]).toBeNaN();
    expect(out[2]).toBeCloseTo(2); // seed = SMA(1,2,3)
    // k = 2/(3+1) = 0.5 → ema[3] = 4*0.5 + 2*0.5 = 3
    expect(out[3]).toBeCloseTo(3);
    expect(out[4]).toBeCloseTo(4); // 5*0.5 + 3*0.5
  });

  it('ATR equals the constant true range on a uniform series', () => {
    // Each candle: high = low + 4, closes in middle → TR = 4 every bar
    const cs = Array.from({ length: 10 }, () => mk(102, 104, 100, 102));
    const out = atr(cs, 3);
    expect(out[2]).toBeNaN();
    expect(out[3]).toBeCloseTo(4);
    expect(out[9]).toBeCloseTo(4);
  });

  it('RSI is 100 on monotonic gains and ~0 on monotonic losses', () => {
    const up = [1, 2, 3, 4, 5, 6, 7].map((c) => mk(c, c, c, c));
    const down = [7, 6, 5, 4, 3, 2, 1].map((c) => mk(c, c, c, c));
    expect(rsi(up, 3)[6]).toBeCloseTo(100);
    expect(rsi(down, 3)[6]).toBeCloseTo(0);
  });

  it('Donchian highest/lowest track the trailing window', () => {
    const cs = [mk(1, 5, 1, 2), mk(2, 3, 0.5, 1), mk(1, 2, 1, 2)];
    expect(highestHigh(cs, 2)[1]).toBe(5);
    expect(highestHigh(cs, 2)[2]).toBe(3);
    expect(lowestLow(cs, 2)[2]).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Engine — execution semantics
// ---------------------------------------------------------------------------

describe('engine execution', () => {
  it('fills a decision made at candle i at the OPEN of candle i+1 (no lookahead)', () => {
    const candles = [
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(105, 105, 105, 105), // entry fill expected here at open=105
      mk(106, 106, 106, 106),
      mk(107, 107, 107, 107),
    ];
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 95 } }),
      candles,
      baseConfig
    );
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryIndex).toBe(2);
    expect(result.trades[0].entryPrice).toBe(105);
  });

  it('computes a zero-cost round trip exactly: qty × price move', () => {
    const candles = [
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100), // entry at open 100, stop 90 → qty = 100×0.01×10000/10 = 10
      mk(110, 110, 110, 110),
      mk(110, 110, 110, 110), // exit at open 110
      mk(110, 110, 110, 110),
    ];
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 90 }, 3: { action: 'exit' } }),
      candles,
      baseConfig
    );
    const t = result.trades[0];
    expect(t.quantity).toBeCloseTo(10); // (10000 × 0.01) / (100 − 90)
    expect(t.pnl).toBeCloseTo(100); // 10 × (110 − 100)
    expect(result.finalEquity).toBeCloseTo(10_100);
  });

  it('applies fees, slippage, and spread on both sides', () => {
    const config: BacktestConfig = {
      ...baseConfig,
      costs: { feeRate: 0.001, slippageBps: 10, spreadBps: 20 },
    };
    const candles = [
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(110, 110, 110, 110),
      mk(110, 110, 110, 110),
      mk(110, 110, 110, 110),
    ];
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 90 }, 3: { action: 'exit' } }),
      candles,
      config
    );
    const t = result.trades[0];
    // buy side worsened up: 100 × (1 + 0.001 + 0.001) = 100.2
    expect(t.entryPrice).toBeCloseTo(100.2);
    // sell side worsened down: 110 × (1 − 0.002) = 109.78
    expect(t.exitPrice).toBeCloseTo(109.78);
    const expectedFees = t.quantity * 100.2 * 0.001 + t.quantity * 109.78 * 0.001;
    expect(t.feesPaid).toBeCloseTo(expectedFees);
    expect(t.pnl).toBeCloseTo(t.quantity * (109.78 - 100.2) - expectedFees);
    // Accounting invariant: equity change equals summed trade P&L
    expect(result.finalEquity - config.initialEquity).toBeCloseTo(t.pnl);
  });

  it('caps position notional at maxPositionFraction of equity', () => {
    const candles = flatCandles(6, 100);
    // Stop distance 1 → risk sizing wants qty 100 (notional 10000); cap = 25% → qty 25
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 99 }, 3: { action: 'exit' } }),
      candles,
      baseConfig
    );
    expect(result.trades[0].quantity).toBeCloseTo(25);
  });

  it('rejects entries without a stop-loss', () => {
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long' } }),
      flatCandles(5),
      baseConfig
    );
    expect(result.trades).toHaveLength(0);
  });

  it('rejects entries whose stop is on the wrong side of the fill', () => {
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 120 } }),
      flatCandles(5, 100),
      baseConfig
    );
    expect(result.trades).toHaveLength(0);
  });

  it('rejects short entries when allowShorts is false', () => {
    const result = runBacktest(
      scripted({ 1: { action: 'enter_short', stopLoss: 110 } }),
      flatCandles(5, 100),
      baseConfig
    );
    expect(result.trades).toHaveLength(0);
  });

  it('triggers the stop-loss intrabar at the stop price', () => {
    const candles = [
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(100, 101, 99, 100), // entry at open 100, stop 95
      mk(98, 99, 94, 96),    // low 94 ≤ 95 → stopped at 95
      mk(96, 96, 96, 96),
    ];
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 95 } }),
      candles,
      baseConfig
    );
    const t = result.trades[0];
    expect(t.exitReason).toBe('stop_loss');
    expect(t.exitPrice).toBeCloseTo(95);
    expect(t.pnl).toBeCloseTo(t.quantity * (95 - 100));
  });

  it('is pessimistic when stop and take-profit are hit in the same candle', () => {
    const candles = [
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(100, 120, 90, 100), // both stop (95) and take (115) touched → stop wins
      mk(100, 100, 100, 100),
    ];
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 95, takeProfit: 115 } }),
      candles,
      baseConfig
    );
    expect(result.trades[0].exitReason).toBe('stop_loss');
  });

  it('ratchets the trailing stop up but never loosens it', () => {
    const candles = [
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100), // entry, stop 90
      mk(105, 105, 105, 105), // trail to 98
      mk(104, 104, 104, 104), // attempt to loosen to 96 — must stay 98
      mk(99, 99, 97, 97),     // low 97 ≤ 98 → stopped at 98
      mk(97, 97, 97, 97),
    ];
    const result = runBacktest(
      scripted({
        1: { action: 'enter_long', stopLoss: 90 },
        3: { action: 'hold', trailingStop: 98 },
        4: { action: 'hold', trailingStop: 96 },
      }),
      candles,
      baseConfig
    );
    const t = result.trades[0];
    expect(t.exitReason).toBe('stop_loss');
    expect(t.exitPrice).toBeCloseTo(98);
  });

  it('force-closes an open position at the final close as end_of_data', () => {
    const candles = [
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(100, 100, 100, 100),
      mk(108, 108, 108, 108),
    ];
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 90 } }),
      candles,
      baseConfig
    );
    expect(result.trades[0].exitReason).toBe('end_of_data');
    expect(result.trades[0].exitPrice).toBeCloseTo(108);
    expect(result.finalEquity - baseConfig.initialEquity).toBeCloseTo(result.trades[0].pnl);
  });

  it('honors startIndex: no entries and no equity tracking before it', () => {
    const candles = flatCandles(10, 100);
    const result = runBacktest(
      scripted({ 1: { action: 'enter_long', stopLoss: 90 }, 6: { action: 'enter_long', stopLoss: 90 } }),
      candles,
      { ...baseConfig, startIndex: 5 }
    );
    expect(result.equityCurve).toHaveLength(5); // candles 5..9
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryIndex).toBe(7); // decision at 6 fills at 7
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('metrics', () => {
  function makeResult(equities: number[], pnls: number[]): BacktestResult {
    return {
      strategyId: 'test',
      params: {},
      config: baseConfig,
      trades: pnls.map((pnl) => ({
        side: 'long' as const,
        entryTime: '',
        exitTime: '',
        entryIndex: 0,
        exitIndex: 4,
        entryPrice: 100,
        exitPrice: 100,
        quantity: 1,
        feesPaid: 0,
        pnl,
        returnPct: 0,
        holdingCandles: 4,
        exitReason: 'signal' as const,
      })),
      equityCurve: equities.map((equity, i) => ({ t: `t${i}`, equity })),
      finalEquity: equities[equities.length - 1],
      totalFeesPaid: 0,
      candlesTested: equities.length,
      candlesInPosition: Math.round(equities.length / 2),
    };
  }

  it('computes net return, max drawdown, profit factor, win rate, expectancy by hand', () => {
    const m = computeMetrics(makeResult([10000, 11000, 9900, 10890], [100, -50, 50]));
    expect(m.netReturnPct).toBeCloseTo(8.9);
    expect(m.maxDrawdownPct).toBeCloseTo(10); // 11000 → 9900
    expect(m.profitFactor).toBeCloseTo(3); // 150 / 50
    expect(m.winRatePct).toBeCloseTo((2 / 3) * 100);
    expect(m.expectancy).toBeCloseTo(100 / 3);
    expect(m.avgHoldingCandles).toBeCloseTo(4);
    expect(m.exposurePct).toBeCloseTo(50);
  });

  it('returns 0 (not Infinity) for Sharpe on zero variance and PF with no losses', () => {
    const m = computeMetrics(makeResult([10000, 10000, 10000], [100, 200]));
    expect(m.sharpeRatio).toBe(0);
    expect(m.profitFactor).toBe(0); // guarded: no-loss PF is not "infinite edge"
  });

  it('threshold evaluation requires ALL checks to pass', () => {
    const good = computeMetrics(makeResult([10000, 11000, 9900, 10890], [100, -50, 50]));
    const evalGood = evaluateThresholds(
      { ...good, sharpeRatio: 2, profitFactor: 2, totalTrades: 50 },
      PRODUCTION_THRESHOLDS
    );
    expect(evalGood.passed).toBe(true);

    const evalBad = evaluateThresholds(
      { ...good, sharpeRatio: 2, profitFactor: 1.2, totalTrades: 50 },
      PRODUCTION_THRESHOLDS
    );
    expect(evalBad.passed).toBe(false);
    expect(evalBad.checks.find((c) => c.name === 'Profit Factor')?.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Walk-forward
// ---------------------------------------------------------------------------

describe('walk-forward', () => {
  it('creates non-overlapping test windows stepping by testSize and compounds OOS equity', () => {
    // Rising market so an always-long strategy trades profitably in every window
    const candles = Array.from({ length: 100 }, (_, i) => {
      const p = 100 + i;
      return mk(p, p + 0.5, p - 0.5, p + 0.25);
    });
    const makeAlwaysLong = (): BacktestStrategy => ({
      id: 'always-long',
      params: {},
      warmup: 1,
      decide: (cs, i, pos) =>
        pos ? { action: 'hold' } : { action: 'enter_long', stopLoss: cs[i].c * 0.9 },
    });

    const wf = walkForward(candles, [{}], makeAlwaysLong, baseConfig, {
      trainSize: 40,
      testSize: 20,
      minTrainTrades: 0,
    });

    // Windows: train [0,40) test [40,60); train [20,60) test [60,80); train [40,80) test [80,100)
    expect(wf.windows).toHaveLength(3);
    expect(wf.windows[0].testStart).toBe(40);
    expect(wf.windows[1].testStart).toBe(60);
    expect(wf.windows[2].testStart).toBe(80);
    expect(wf.outOfSample).not.toBeNull();
    expect(wf.totalOutOfSampleTrades).toBeGreaterThan(0);
    // Rising market + long-only ⇒ every window OOS-positive
    expect(wf.windowConsistency).toBe(1);
    expect(wf.outOfSample!.netReturnPct).toBeGreaterThan(0);
  });

  it('skips windows where no param set reaches minTrainTrades', () => {
    const candles = flatCandles(100);
    const makeNeverTrade = (): BacktestStrategy => ({
      id: 'never',
      params: {},
      warmup: 1,
      decide: () => ({ action: 'hold' }),
    });
    const wf = walkForward(candles, [{}], makeNeverTrade, baseConfig, {
      trainSize: 40,
      testSize: 20,
      minTrainTrades: 1,
    });
    expect(wf.windows).toHaveLength(0);
    expect(wf.outOfSample).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Trend-following strategy behavior
// ---------------------------------------------------------------------------

describe('trend-following strategy', () => {
  it('holds during warmup (NaN indicators)', () => {
    const strategy = createTrendFollowingStrategy({
      fastPeriod: 3, slowPeriod: 5, atrPeriod: 3, atrStopMultiple: 2,
    });
    const candles = flatCandles(20, 100);
    expect(strategy.decide(candles, 2, null).action).toBe('hold');
  });

  it('enters long on a fast/slow EMA cross up with a stop below the close', () => {
    // Downtrend then sharp reversal forces fast EMA across slow EMA
    const prices = [
      ...Array.from({ length: 10 }, (_, i) => 100 - i), // 100 → 91
      ...Array.from({ length: 10 }, (_, i) => 92 + i * 4), // sharp rally
    ];
    const candles = prices.map((p) => mk(p, p + 1, p - 1, p));
    const strategy = createTrendFollowingStrategy({
      fastPeriod: 3, slowPeriod: 8, atrPeriod: 3, atrStopMultiple: 2,
    });

    let entryDecision = null;
    for (let i = strategy.warmup; i < candles.length; i++) {
      const d = strategy.decide(candles, i, null);
      if (d.action === 'enter_long') {
        entryDecision = { index: i, decision: d };
        break;
      }
    }
    expect(entryDecision).not.toBeNull();
    expect(entryDecision!.decision.stopLoss).toBeLessThan(candles[entryDecision!.index].c);
  });

  it('exits an open long when the fast EMA crosses back below the slow EMA', () => {
    const prices = [
      ...Array.from({ length: 15 }, (_, i) => 100 + i * 3), // rally
      ...Array.from({ length: 15 }, (_, i) => 145 - i * 4), // collapse
    ];
    const candles = prices.map((p) => mk(p, p + 1, p - 1, p));
    const strategy = createTrendFollowingStrategy({
      fastPeriod: 3, slowPeriod: 8, atrPeriod: 3, atrStopMultiple: 10, // huge stop so only signal exits
    });
    const position = {
      side: 'long' as const,
      entryPrice: 110,
      entryIndex: 10,
      quantity: 1,
      stopLoss: 1,
      takeProfit: null,
    };
    let sawExit = false;
    for (let i = strategy.warmup; i < candles.length; i++) {
      if (strategy.decide(candles, i, position).action === 'exit') {
        sawExit = true;
        break;
      }
    }
    expect(sawExit).toBe(true);
  });

  it('runs end-to-end through the engine with exact P&L accounting', () => {
    // Trend up, chop, trend down — enough structure to produce trades
    const prices: number[] = [];
    for (let i = 0; i < 60; i++) prices.push(100 + i * 2);
    for (let i = 0; i < 30; i++) prices.push(220 + (i % 2 === 0 ? 3 : -3));
    for (let i = 0; i < 60; i++) prices.push(220 - i * 2);
    const candles = prices.map((p) => mk(p, p + 2, p - 2, p));

    const strategy = createTrendFollowingStrategy({
      fastPeriod: 5, slowPeriod: 15, atrPeriod: 5, atrStopMultiple: 3,
    });
    const result = runBacktest(strategy, candles, baseConfig);

    expect(result.trades.length).toBeGreaterThan(0);
    const totalPnl = result.trades.reduce((a, t) => a + t.pnl, 0);
    expect(result.finalEquity - baseConfig.initialEquity).toBeCloseTo(totalPnl, 6);
    for (const t of result.trades) {
      expect(t.entryIndex).toBeGreaterThan(strategy.warmup);
      expect(t.exitIndex).toBeGreaterThanOrEqual(t.entryIndex);
    }
  });
});
