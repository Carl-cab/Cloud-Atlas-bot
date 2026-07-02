// =============================================================================
// Technical Indicators
//
// Pure functions over candle arrays. Every function returns an array aligned
// with the input (index i = indicator value at candle i), with NaN for
// indices where the indicator is not yet defined. NaN alignment (rather than
// shorter arrays) makes off-by-one lookahead bugs structurally impossible.
// =============================================================================

import type { Candle } from './types';

/** Simple moving average of closes. */
export function sma(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].c;
    if (i >= period) sum -= candles[i - period].c;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average of closes, seeded with SMA of the first `period`. */
export function ema(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (period <= 0 || candles.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += candles[i].c;
  out[period - 1] = seed / period;
  for (let i = period; i < candles.length; i++) {
    out[i] = candles[i].c * k + out[i - 1] * (1 - k);
  }
  return out;
}

/** Wilder's Average True Range. */
export function atr(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (period <= 0 || candles.length < period + 1) return out;
  const tr = new Array<number>(candles.length).fill(NaN);
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].h - candles[i].l;
    const hc = Math.abs(candles[i].h - candles[i - 1].c);
    const lc = Math.abs(candles[i].l - candles[i - 1].c);
    tr[i] = Math.max(hl, hc, lc);
  }
  let seed = 0;
  for (let i = 1; i <= period; i++) seed += tr[i];
  out[period] = seed / period;
  for (let i = period + 1; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

/** Wilder's RSI (0–100). */
export function rsi(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (period <= 0 || candles.length < period + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].c - candles[i - 1].c;
    if (change > 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].c - candles[i - 1].c;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Highest high over the trailing `period` candles (inclusive of current). */
export function highestHigh(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    for (let j = i - period + 1; j <= i; j++) hi = Math.max(hi, candles[j].h);
    out[i] = hi;
  }
  return out;
}

/** Lowest low over the trailing `period` candles (inclusive of current). */
export function lowestLow(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  for (let i = period - 1; i < candles.length; i++) {
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) lo = Math.min(lo, candles[j].l);
    out[i] = lo;
  }
  return out;
}
