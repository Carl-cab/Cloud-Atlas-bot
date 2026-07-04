// =============================================================================
// Portfolio Math — pure, testable functions for multi-asset analysis
//
// These functions turn per-asset out-of-sample equity curves into
// portfolio-level metrics. Kept separate from the runner script so the math
// is unit-tested independently of any I/O or strategy code.
//
// Diversification benefit is driven by return correlation: combining assets
// whose returns are less than perfectly correlated reduces portfolio
// volatility more than it reduces return, lifting Sharpe. This module
// measures that effect honestly — no assumption that it will be large.
// =============================================================================

import type { EquityPoint } from './types';

/** Per-candle simple returns from an equity curve. */
export function curveReturns(curve: EquityPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    out.push(prev > 0 ? curve[i].equity / prev - 1 : 0);
  }
  return out;
}

/** Pearson correlation of two equal-length return series. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

/** Full symmetric correlation matrix across N return series. */
export function correlationMatrix(returnsByAsset: number[][]): number[][] {
  const n = returnsByAsset.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = i === j ? 1 : pearson(returnsByAsset[i], returnsByAsset[j]);
      m[i][j] = c;
      m[j][i] = c;
    }
  }
  return m;
}

/**
 * Restrict each curve to the timestamps common to ALL curves, preserving
 * order. Returns curves of equal length aligned candle-for-candle. If there
 * is no common timestamp, returns empty curves.
 */
export function alignByTimestamp(curves: EquityPoint[][]): EquityPoint[][] {
  if (curves.length === 0) return [];
  const common = curves
    .map((c) => new Set(c.map((p) => p.t)))
    .reduce((acc, s) => new Set([...acc].filter((t) => s.has(t))));
  return curves.map((c) => c.filter((p) => common.has(p.t)));
}

/**
 * Equal-weight, per-candle-rebalanced portfolio curve. Portfolio return at
 * each step is the mean of the aligned assets' returns. Idealized (perfect
 * rebalancing, no rebalance cost) — treat the resulting Sharpe as an upper
 * bound for this allocation scheme.
 */
export function equalWeightPortfolio(
  alignedCurves: EquityPoint[][],
  initialEquity: number
): EquityPoint[] {
  if (alignedCurves.length === 0 || alignedCurves[0].length === 0) return [];
  const assetReturns = alignedCurves.map(curveReturns);
  const steps = assetReturns[0].length;
  const curve: EquityPoint[] = [{ t: alignedCurves[0][0].t, equity: initialEquity }];
  for (let i = 0; i < steps; i++) {
    const r = assetReturns.reduce((sum, rets) => sum + rets[i], 0) / assetReturns.length;
    curve.push({ t: alignedCurves[0][i + 1].t, equity: curve[i].equity * (1 + r) });
  }
  return curve;
}
