// =============================================================================
// Trend Following — EMA crossover with ATR trailing stop
//
// The single highest-priority candidate strategy. Rules:
//   ENTRY (long): fast EMA crosses above slow EMA, and close > slow EMA.
//   INITIAL STOP: entry-candle close − atrStopMultiple × ATR.
//   TRAIL: stop ratchets up to close − atrStopMultiple × ATR (never loosens).
//   EXIT: fast EMA crosses below slow EMA, or the trailing stop is hit.
//
// This is the classic dual-moving-average trend system (Donchian/turtle
// lineage) — decades of published research, few parameters, hard to overfit.
// Long-only by default because the execution venue is a spot exchange.
// =============================================================================

import type {
  BacktestStrategy,
  Candle,
  OpenPositionView,
  StrategyDecision,
} from '../types';
import { atr, ema } from '../indicators';

export interface TrendFollowingParams {
  fastPeriod: number;
  slowPeriod: number;
  atrPeriod: number;
  atrStopMultiple: number;
}

export const DEFAULT_TREND_PARAMS: TrendFollowingParams = {
  fastPeriod: 20,
  slowPeriod: 50,
  atrPeriod: 14,
  atrStopMultiple: 3,
};

/**
 * Parameter grid for walk-forward optimization. Deliberately coarse —
 * a fine grid on a small dataset is curve-fitting, not research.
 */
export const TREND_PARAM_GRID: TrendFollowingParams[] = [];
for (const fastPeriod of [10, 20]) {
  for (const slowPeriod of [50, 100]) {
    for (const atrStopMultiple of [2, 3, 4]) {
      TREND_PARAM_GRID.push({ fastPeriod, slowPeriod, atrPeriod: 14, atrStopMultiple });
    }
  }
}

export function createTrendFollowingStrategy(
  params: TrendFollowingParams = DEFAULT_TREND_PARAMS
): BacktestStrategy {
  // Indicator caches keyed by candle-array identity so repeated decide()
  // calls over the same dataset stay O(1) after the first computation.
  let cachedFor: Candle[] | null = null;
  let fastEma: number[] = [];
  let slowEma: number[] = [];
  let atrValues: number[] = [];

  const ensureIndicators = (candles: Candle[]): void => {
    if (cachedFor === candles && fastEma.length === candles.length) return;
    cachedFor = candles;
    fastEma = ema(candles, params.fastPeriod);
    slowEma = ema(candles, params.slowPeriod);
    atrValues = atr(candles, params.atrPeriod);
  };

  return {
    id: 'trend-following-ema-atr',
    params: { ...params },
    warmup: Math.max(params.slowPeriod, params.atrPeriod + 1) + 1,

    decide(
      candles: Candle[],
      index: number,
      position: OpenPositionView | null
    ): StrategyDecision {
      ensureIndicators(candles);

      const fast = fastEma[index];
      const slow = slowEma[index];
      const fastPrev = fastEma[index - 1];
      const slowPrev = slowEma[index - 1];
      const currentAtr = atrValues[index];

      if (
        Number.isNaN(fast) || Number.isNaN(slow) ||
        Number.isNaN(fastPrev) || Number.isNaN(slowPrev) ||
        Number.isNaN(currentAtr)
      ) {
        return { action: 'hold' };
      }

      const close = candles[index].c;
      const crossedUp = fastPrev <= slowPrev && fast > slow;
      const crossedDown = fastPrev >= slowPrev && fast < slow;

      if (position?.side === 'long') {
        if (crossedDown) return { action: 'exit' };
        return {
          action: 'hold',
          trailingStop: close - params.atrStopMultiple * currentAtr,
        };
      }

      if (!position && crossedUp && close > slow) {
        return {
          action: 'enter_long',
          stopLoss: close - params.atrStopMultiple * currentAtr,
        };
      }

      return { action: 'hold' };
    },
  };
}
