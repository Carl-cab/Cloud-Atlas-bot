// =============================================================================
// Strategy Engine ↔ Backtest Parity
//
// The volatility-expansion strategy exists in two places:
//   - src/lib/backtest/strategies/volatility-expansion.ts  (validated by
//     walk-forward; the source of truth for the edge)
//   - supabase/functions/_shared/strategy/strategies/volatility-expansion.ts
//     (the deployed Deno adapter used in the paper experiment)
//
// If the deployed adapter's ENTRY/STOP logic ever drifts from the validated
// implementation, the paper experiment stops being evidence about the thing
// we validated. This test pins them together on identical synthetic candles.
//
// The adapter is a Deno edge module, but its only runtime dependencies are
// type-only imports (erased at compile time), so vitest can import it.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { createVolatilityExpansionStrategy } from '@/lib/backtest';
import type { Candle } from '@/lib/backtest';
import { VolatilityExpansionStrategy } from '../../../supabase/functions/_shared/strategy/strategies/volatility-expansion.ts';
import type { MarketSnapshot } from '../../../supabase/functions/_shared/strategy/types.ts';

// Deterministic pseudo-random candles with periodic bullish expansion bars.
function syntheticCandles(n: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    // Smooth drift with a deterministic wobble
    const drift = Math.sin(i / 7) * 0.6 + 0.15;
    const isExpansionBar = i % 13 === 0 && i > 0;
    const open = price;
    const close = price + drift + (isExpansionBar ? 9 : 0);
    const high = Math.max(open, close) + (isExpansionBar ? 3 : 0.8);
    const low = Math.min(open, close) - (isExpansionBar ? 1 : 0.8);
    candles.push({
      t: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString(),
      o: open, h: high, l: low, c: close, v: 1000 + (i % 5) * 100,
    });
    price = close;
  }
  return candles;
}

function toSnapshot(candles: Candle[]): MarketSnapshot {
  const last = candles[candles.length - 1];
  return {
    symbol: 'BTCUSD',
    currentPrice: last.c,
    bidPrice: last.c * 0.999,
    askPrice: last.c * 1.001,
    volume24h: candles.reduce((s, c) => s + c.v, 0),
    change24h: 0,
    high24h: Math.max(...candles.map((c) => c.h)),
    low24h: Math.min(...candles.map((c) => c.l)),
    ohlcv: candles.map((c) => ({ timestamp: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v })),
    timestamp: last.t,
  };
}

describe('strategy engine ↔ backtest parity (volatility expansion)', () => {
  const DEFAULTS = { atrPeriod: 14, expansionMultiple: 2, atrStopMultiple: 2, maxHoldCandles: 20 };

  it('deployed adapter and validated backtest agree on entries and stops', async () => {
    const candles = syntheticCandles(120);
    const backtest = createVolatilityExpansionStrategy(DEFAULTS);
    const adapter = new VolatilityExpansionStrategy(DEFAULTS);
    await adapter.initialize();

    let comparedEntries = 0;
    const warmup = DEFAULTS.atrPeriod + 2;
    for (let i = warmup; i < candles.length; i++) {
      // Backtest decides on close of candle i, flat position
      const btDecision = backtest.decide(candles, i, null);

      // Adapter sees a snapshot whose last candle IS candle i
      const snapshot = toSnapshot(candles.slice(0, i + 1));
      const result = await adapter.generateSignal(snapshot, {
        symbol: 'BTCUSD', accountEquity: 10_000, openPositions: 0,
        maxPositions: 5, riskBudgetRemaining: 1,
      });
      expect(result.success).toBe(true);
      const adDirection = result.data!.direction;

      const btWantsLong = btDecision.action === 'enter_long';
      const adWantsLong = adDirection === 'long';
      expect(adWantsLong).toBe(btWantsLong);

      if (btWantsLong) {
        comparedEntries++;
        // Stop-loss prices must match to floating tolerance
        expect(result.data!.stopLoss).not.toBeNull();
        expect(result.data!.stopLoss!).toBeCloseTo(btDecision.stopLoss!, 6);
      }
    }

    // The synthetic series must actually produce entries, or the test is vacuous
    expect(comparedEntries).toBeGreaterThan(0);
  });

  it('adapter never emits short/sell (long-only spot invariant)', async () => {
    const candles = syntheticCandles(80);
    const adapter = new VolatilityExpansionStrategy(DEFAULTS);
    await adapter.initialize();
    for (let i = DEFAULTS.atrPeriod + 2; i < candles.length; i++) {
      const snapshot = toSnapshot(candles.slice(0, i + 1));
      const result = await adapter.generateSignal(snapshot, {
        symbol: 'BTCUSD', accountEquity: 10_000, openPositions: 0,
        maxPositions: 5, riskBudgetRemaining: 1,
      });
      expect(['long', 'hold']).toContain(result.data!.direction);
    }
  });

  it('adapter refuses to signal before warmup and never throws', async () => {
    const adapter = new VolatilityExpansionStrategy(DEFAULTS);
    await adapter.initialize();
    const shortSnap = toSnapshot(syntheticCandles(5));
    const result = await adapter.generateSignal(shortSnap, {
      symbol: 'BTCUSD', accountEquity: 10_000, openPositions: 0, maxPositions: 5, riskBudgetRemaining: 1,
    });
    expect(result.success).toBe(false); // insufficient data, but no throw
  });
});
