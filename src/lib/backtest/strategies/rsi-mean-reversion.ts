// =============================================================================
// RSI Mean Reversion — short-period RSI dip-buying (Connors-style)
//
// Candidate #3. Rules (long-only, spot venue):
//   ENTRY: RSI(rsiPeriod) < oversoldLevel, optionally gated by a trend
//          filter (close > SMA(trendFilterPeriod)) so dips are bought only
//          in uptrends. trendFilterPeriod = 0 disables the filter.
//   STOP:  entry-candle close − atrStopMultiple × ATR (risk-sized by engine).
//   EXIT:  RSI(rsiPeriod) > exitLevel (mean reverted), or the stop is hit.
//
// Rationale for this candidate: it trades an order of magnitude more often
// than trend following, so the 720-candle Kraken datasets can produce a
// statistically meaningful trade sample. The known risk is cost drag from
// short holding periods — which is exactly what the cost model measures.
// =============================================================================

import type {
  BacktestStrategy,
  Candle,
  OpenPositionView,
  StrategyDecision,
} from '../types';
import { atr, rsi, sma } from '../indicators';

export interface RsiMeanReversionParams {
  rsiPeriod: number;
  oversoldLevel: number;
  exitLevel: number;
  atrPeriod: number;
  atrStopMultiple: number;
  /** SMA period for the uptrend gate; 0 disables the filter */
  trendFilterPeriod: number;
}

export const DEFAULT_RSI_MR_PARAMS: RsiMeanReversionParams = {
  rsiPeriod: 2,
  oversoldLevel: 10,
  exitLevel: 65,
  atrPeriod: 14,
  atrStopMultiple: 2,
  trendFilterPeriod: 100,
};

/** Coarse grid — 24 combinations, deliberately small to limit overfitting. */
export const RSI_MR_PARAM_GRID: RsiMeanReversionParams[] = [];
for (const rsiPeriod of [2, 4]) {
  for (const oversoldLevel of [10, 20, 30]) {
    for (const atrStopMultiple of [2, 3]) {
      for (const trendFilterPeriod of [0, 100]) {
        RSI_MR_PARAM_GRID.push({
          rsiPeriod,
          oversoldLevel,
          exitLevel: 65,
          atrPeriod: 14,
          atrStopMultiple,
          trendFilterPeriod,
        });
      }
    }
  }
}

export function createRsiMeanReversionStrategy(
  params: RsiMeanReversionParams = DEFAULT_RSI_MR_PARAMS
): BacktestStrategy {
  let cachedFor: Candle[] | null = null;
  let rsiValues: number[] = [];
  let atrValues: number[] = [];
  let filterSma: number[] = [];

  const ensureIndicators = (candles: Candle[]): void => {
    if (cachedFor === candles && rsiValues.length === candles.length) return;
    cachedFor = candles;
    rsiValues = rsi(candles, params.rsiPeriod);
    atrValues = atr(candles, params.atrPeriod);
    filterSma = params.trendFilterPeriod > 0
      ? sma(candles, params.trendFilterPeriod)
      : [];
  };

  return {
    id: 'rsi-mean-reversion',
    params: { ...params },
    warmup:
      Math.max(params.rsiPeriod + 1, params.atrPeriod + 1, params.trendFilterPeriod) + 1,

    decide(
      candles: Candle[],
      index: number,
      position: OpenPositionView | null
    ): StrategyDecision {
      ensureIndicators(candles);

      const currentRsi = rsiValues[index];
      const currentAtr = atrValues[index];
      if (Number.isNaN(currentRsi) || Number.isNaN(currentAtr)) {
        return { action: 'hold' };
      }

      if (position?.side === 'long') {
        if (currentRsi > params.exitLevel) return { action: 'exit' };
        return { action: 'hold' };
      }

      if (!position && currentRsi < params.oversoldLevel) {
        if (params.trendFilterPeriod > 0) {
          const filter = filterSma[index];
          if (Number.isNaN(filter) || candles[index].c <= filter) {
            return { action: 'hold' };
          }
        }
        return {
          action: 'enter_long',
          stopLoss: candles[index].c - params.atrStopMultiple * currentAtr,
        };
      }

      return { action: 'hold' };
    },
  };
}
