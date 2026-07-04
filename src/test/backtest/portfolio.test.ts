// =============================================================================
// Portfolio Math — Correctness Tests
//
// Hand-verifiable synthetic curves. Portfolio math is where a
// diversification claim could be silently wrong, so every function is pinned.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  alignByTimestamp,
  correlationMatrix,
  curveReturns,
  equalWeightPortfolio,
  pearson,
} from '@/lib/backtest';
import type { EquityPoint } from '@/lib/backtest';

function curve(...pairs: Array<[string, number]>): EquityPoint[] {
  return pairs.map(([t, equity]) => ({ t, equity }));
}

describe('portfolio math', () => {
  it('curveReturns computes per-step simple returns', () => {
    const r = curveReturns(curve(['a', 100], ['b', 110], ['c', 99]));
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(0.1);
    expect(r[1]).toBeCloseTo(-0.1);
  });

  it('pearson is +1 for identical series and -1 for mirrored series', () => {
    const a = [0.01, -0.02, 0.03, -0.01];
    const b = a.map((x) => x * 2 + 0.005); // perfectly linear ⇒ corr 1
    const c = a.map((x) => -x); // mirror ⇒ corr -1
    expect(pearson(a, b)).toBeCloseTo(1);
    expect(pearson(a, c)).toBeCloseTo(-1);
  });

  it('pearson returns 0 for a flat (zero-variance) series', () => {
    expect(pearson([0.01, -0.01, 0.02], [0, 0, 0])).toBe(0);
  });

  it('correlationMatrix is symmetric with a unit diagonal', () => {
    const a = [0.01, 0.02, -0.01, 0.03];
    const b = [-0.01, 0.01, 0.02, -0.02];
    const m = correlationMatrix([a, b]);
    expect(m[0][0]).toBeCloseTo(1);
    expect(m[1][1]).toBeCloseTo(1);
    expect(m[0][1]).toBeCloseTo(m[1][0]);
    expect(m[0][1]).toBeCloseTo(pearson(a, b));
  });

  it('alignByTimestamp keeps only common timestamps in order', () => {
    const a = curve(['t1', 100], ['t2', 101], ['t3', 102], ['t4', 103]);
    const b = curve(['t2', 200], ['t3', 202], ['t5', 205]);
    const [aa, bb] = alignByTimestamp([a, b]);
    expect(aa.map((p) => p.t)).toEqual(['t2', 't3']);
    expect(bb.map((p) => p.t)).toEqual(['t2', 't3']);
    expect(aa).toHaveLength(bb.length);
  });

  it('equalWeightPortfolio averages per-candle returns of aligned curves', () => {
    // Asset A: +10% then +10%.  Asset B: 0% then -10%.
    // Portfolio (equal weight): +5% then 0%.  1000 → 1050 → 1050.
    const a = curve(['t1', 100], ['t2', 110], ['t3', 121]);
    const b = curve(['t1', 100], ['t2', 100], ['t3', 90]);
    const p = equalWeightPortfolio([a, b], 1000);
    expect(p).toHaveLength(3);
    expect(p[0].equity).toBeCloseTo(1000);
    expect(p[1].equity).toBeCloseTo(1050); // mean(+10%, 0%) = +5%
    expect(p[2].equity).toBeCloseTo(1050); // mean(+10%, -10%) = 0%
  });

  it('diversification reduces volatility: a two-asset anti-correlated blend is smoother than either leg', () => {
    // Construct two anti-correlated curves and show the blend's return stddev
    // is below each leg's — the mechanism behind any Sharpe lift.
    const ups: EquityPoint[] = [{ t: 't0', equity: 1000 }];
    const downs: EquityPoint[] = [{ t: 't0', equity: 1000 }];
    for (let i = 1; i <= 20; i++) {
      const wobble = i % 2 === 0 ? 0.04 : -0.04;
      ups.push({ t: `t${i}`, equity: ups[i - 1].equity * (1 + wobble) });
      downs.push({ t: `t${i}`, equity: downs[i - 1].equity * (1 - wobble) });
    }
    const std = (xs: number[]) => {
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    };
    const blend = equalWeightPortfolio([ups, downs], 1000);
    const blendStd = std(curveReturns(blend));
    const legStd = std(curveReturns(ups));
    expect(pearson(curveReturns(ups), curveReturns(downs))).toBeCloseTo(-1);
    expect(blendStd).toBeLessThan(legStd);
  });
});
