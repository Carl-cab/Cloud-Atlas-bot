// =============================================================================
// Volatility Expansion — range-expansion breakout with time-based exit
//
// Candidate #6. Rules (long-only, spot venue):
//   ENTRY: the candle's true range exceeds expansionMultiple × ATR AND the
//          candle closes up (bullish expansion bar).
//   STOP:  entry close − atrStopMultiple × ATR.
//   EXIT:  after maxHoldCandles (volatility bursts decay quickly), or the
//          stop is hit.
// =============================================================================

import type {
  BacktestStrategy,
  Candle,
  OpenPositionView,
  StrategyDecision,
} from '../types';
import { atr } from '../indicators';

export interface VolatilityExpansionParams {
  atrPeriod: number;
  expansionMultiple: number;
  atrStopMultiple: number;
  maxHoldCandles: number;
}

export const DEFAULT_VOL_EXP_PARAMS: VolatilityExpansionParams = {
  atrPeriod: 14,
  expansionMultiple: 2,
  atrStopMultiple: 2,
  maxHoldCandles: 10,
};

/** Coarse grid — 8 combinations. */
export const VOL_EXP_PARAM_GRID: VolatilityExpansionParams[] = [];
for (const expansionMultiple of [1.5, 2]) {
  for (const atrStopMultiple of [2, 3]) {
    for (const maxHoldCandles of [10, 20]) {
      VOL_EXP_PARAM_GRID.push({ atrPeriod: 14, expansionMultiple, atrStopMultiple, maxHoldCandles });
    }
  }
}

export function createVolatilityExpansionStrategy(
  params: VolatilityExpansionParams = DEFAULT_VOL_EXP_PARAMS
): BacktestStrategy {
  let cachedFor: Candle[] | null = null;
  let atrValues: number[] = [];

  const ensureIndicators = (candles: Candle[]): void => {
    if (cachedFor === candles && atrValues.length === candles.length) return;
    cachedFor = candles;
    atrValues = atr(candles, params.atrPeriod);
  };

  return {
    id: 'volatility-expansion',
    params: { ...params },
    warmup: params.atrPeriod + 2,

    decide(
      candles: Candle[],
      index: number,
      position: OpenPositionView | null
    ): StrategyDecision {
      ensureIndicators(candles);

      // ATR of the PREVIOUS candle: the expansion is measured against the
      // volatility baseline that existed before the expansion bar itself.
      const baselineAtr = atrValues[index - 1];
      const currentAtr = atrValues[index];
      if (Number.isNaN(baselineAtr) || Number.isNaN(currentAtr)) {
        return { action: 'hold' };
      }

      const candle = candles[index];

      if (position?.side === 'long') {
        if (index - position.entryIndex >= params.maxHoldCandles) {
          return { action: 'exit' };
        }
        return { action: 'hold' };
      }

      const prevClose = candles[index - 1].c;
      const trueRange = Math.max(
        candle.h - candle.l,
        Math.abs(candle.h - prevClose),
        Math.abs(candle.l - prevClose)
      );
      const isExpansion = trueRange > params.expansionMultiple * baselineAtr;
      const isBullish = candle.c > candle.o;

      if (!position && isExpansion && isBullish) {
        return {
          action: 'enter_long',
          stopLoss: candle.c - params.atrStopMultiple * currentAtr,
        };
      }

      return { action: 'hold' };
    },
  };
}
