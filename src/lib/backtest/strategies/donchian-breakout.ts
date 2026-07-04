// =============================================================================
// Donchian Channel Breakout — turtle-style
//
// Candidates #4/#5 (Breakout + Donchian Channel are one family). Rules
// (long-only, spot venue):
//   ENTRY: close breaks above the previous candle's entryPeriod-high.
//   STOP:  entry close − atrStopMultiple × ATR (disaster stop).
//   EXIT:  close breaks below the previous candle's exitPeriod-low
//          (classic channel exit), or the stop is hit.
//
// The channel windows use the PREVIOUS candle's values so a candle cannot
// trigger a breakout against its own high/low.
// =============================================================================

import type {
  BacktestStrategy,
  Candle,
  OpenPositionView,
  StrategyDecision,
} from '../types';
import { atr, highestHigh, lowestLow } from '../indicators';

export interface DonchianBreakoutParams {
  entryPeriod: number;
  exitPeriod: number;
  atrPeriod: number;
  atrStopMultiple: number;
}

export const DEFAULT_DONCHIAN_PARAMS: DonchianBreakoutParams = {
  entryPeriod: 55,
  exitPeriod: 20,
  atrPeriod: 14,
  atrStopMultiple: 3,
};

/** Coarse grid — 8 combinations (turtle S1/S2 lineage). */
export const DONCHIAN_PARAM_GRID: DonchianBreakoutParams[] = [];
for (const entryPeriod of [20, 55]) {
  for (const exitPeriod of [10, 20]) {
    for (const atrStopMultiple of [2, 4]) {
      DONCHIAN_PARAM_GRID.push({ entryPeriod, exitPeriod, atrPeriod: 14, atrStopMultiple });
    }
  }
}

export function createDonchianBreakoutStrategy(
  params: DonchianBreakoutParams = DEFAULT_DONCHIAN_PARAMS
): BacktestStrategy {
  let cachedFor: Candle[] | null = null;
  let entryHigh: number[] = [];
  let exitLow: number[] = [];
  let atrValues: number[] = [];

  const ensureIndicators = (candles: Candle[]): void => {
    if (cachedFor === candles && entryHigh.length === candles.length) return;
    cachedFor = candles;
    entryHigh = highestHigh(candles, params.entryPeriod);
    exitLow = lowestLow(candles, params.exitPeriod);
    atrValues = atr(candles, params.atrPeriod);
  };

  return {
    id: 'donchian-breakout',
    params: { ...params },
    warmup: Math.max(params.entryPeriod, params.exitPeriod, params.atrPeriod + 1) + 1,

    decide(
      candles: Candle[],
      index: number,
      position: OpenPositionView | null
    ): StrategyDecision {
      ensureIndicators(candles);

      const prevEntryHigh = entryHigh[index - 1];
      const prevExitLow = exitLow[index - 1];
      const currentAtr = atrValues[index];
      if (
        Number.isNaN(prevEntryHigh) || Number.isNaN(prevExitLow) || Number.isNaN(currentAtr)
      ) {
        return { action: 'hold' };
      }

      const close = candles[index].c;

      if (position?.side === 'long') {
        if (close < prevExitLow) return { action: 'exit' };
        return { action: 'hold' };
      }

      if (!position && close > prevEntryHigh) {
        return {
          action: 'enter_long',
          stopLoss: close - params.atrStopMultiple * currentAtr,
        };
      }

      return { action: 'hold' };
    },
  };
}
