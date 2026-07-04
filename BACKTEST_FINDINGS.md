# Backtest Findings Log

Chronological record of strategy validation results. Every entry is backed by
a JSON report in `reports/backtests/` generated from real market data in
`data/historical/`. Verdicts come from walk-forward OUT-OF-SAMPLE metrics
with full Kraken taker costs (0.26%/side + 5bps slippage + half-spread).

Production thresholds: PF > 1.5, Sharpe > 1.5, max DD ≤ 25%, ≥ 30 trades,
positive net return after costs, positive expectancy — ALL required.

---

## 2026-07-03 — Candidate #1: Trend Following (EMA 20/50 + ATR trail)

**Data:** Kraken public OHLC, XBTUSD + ETHUSD at 1d/4h/1h, 721 candles each
(1d ≈ 2 years, 4h ≈ 4 months, 1h ≈ 30 days — Kraken caps at 720 candles).
**Report:** `reports/backtests/trend-following-2026-07-02T23-59-15-891Z.json`

**Verdict: UNVALIDATABLE on available data.**
- Walk-forward: 0 of 4 windows evaluated on every dataset — no parameter set
  produced the 5 minimum in-sample trades per 288-candle train window. The
  strategy trades ~2–4×/year on daily data; 720 candles cannot produce a
  statistically meaningful sample.
- Full-sample reference (4–9 trades, no statistical power): negative on all
  six datasets, net −0.06% to −6.11%.
- Candidate #2 (MA Crossover) is the same system family and was covered by
  the 12-combination parameter grid — jointly considered unvalidatable.

**Blocker:** data depth, not strategy logic. Needs multi-year history.

## 2026-07-03 — Candidate #3: RSI Mean Reversion (Connors-style RSI-2/4)

**Data:** same six Kraken datasets.
**Report:** `reports/backtests/candidates-2026-07-03T00-07-04-735Z.json`

**Verdict: FAIL — out-of-sample negative on all six datasets.**
- Walk-forward: 4 of 4 windows evaluated everywhere (14–30 OOS trades).
- OOS net return: −1.23% to −8.06%; PF 0.24–0.74; window consistency 25–50%.
- Cost sensitivity (diagnostic): even at ZERO cost the strategy is
  OOS-negative on 4 of 6 datasets. The only gross-positive datasets are the
  two 1h sets covering just 30 days (single regime — not evidence).
- Conclusion: no robust edge. Lower fees would NOT rescue this strategy.
  Eliminated on merit, not on data depth.

## Measured cost reality (informs all future candidates)

Round-trip execution cost at Kraken retail taker tier ≈ 0.62% of notional
(0.26% × 2 fees + slippage + spread). Consequences:
- Short-holding-period strategies need > 0.62% average gross edge per trade
  just to break even. None of the tested intraday configurations cleared it.
- Slow strategies amortize costs well (trend following on daily data paid
  ~$16–38 fees per 2 years on a $10k account) — the trend family remains the
  most promising candidate class IF deep history can validate it.

## 2026-07-04 — Deep-history validation (Binance klines 2017-08 → 2026-07)

**Data:** BTCUSDT + ETHUSDT at 1d (3,243 candles) and 4h (19,436 candles),
fetched via `--deep`. Walk-forward: 40% train / 15% test rolling windows;
OOS covers ~2021-03 → 2026-07. Full Kraken taker costs applied.
**Reports:** `trend-following-2026-07-03T00-31-35-529Z.json`,
`candidates-2026-07-04T01-20-20-061Z.json`

### Candidate #1/#2 — Trend Following (EMA + ATR trail): FAIL (Sharpe)
| Dataset | OOS net | Sharpe | PF | Trades | Consistency |
|---|---|---|---|---|---|
| BTC 1d | +6.3% | 0.46 | 2.05 | 18 | 100% |
| BTC 4h | +14.4% | 0.56 | 1.43 | 85 | 50% |
| ETH 1d | −1.6% | −0.11 | 0.84 | 22 | 50% |
| ETH 4h | +15.4% | 0.48 | 1.29 | 127 | 75% |

Real but weak edge: positive after costs on 3 of 4 datasets over ~5y OOS.
Fails Sharpe (0.46–0.56 vs 1.5 required) and BTC-1d trade count.

### Candidates #4/#5 — Donchian Breakout: FAIL (Sharpe)
OOS: BTC 1d +12.3% (Sharpe 0.47, PF 1.75), ETH 1d +10.8% (0.37, PF 1.90),
4h variants ≈ flat (PF 1.04–1.09). Same profile as trend following.

### Candidate #6 — Volatility Expansion: FAIL (Sharpe only) — best result
| Dataset | OOS net | Sharpe | PF | Trades | DD | Consistency |
|---|---|---|---|---|---|---|
| **BTC 1d** | **+23.1%** | **1.07** | **2.35** | **34** | **3.2%** | **100%** |
| BTC 4h | −23.5% | −0.71 | 0.77 | 278 | 24.6% | 25% |
| ETH 1d | −0.6% | −0.01 | 0.98 | 54 | 9.9% | 50% |
| ETH 4h | +0.6% | 0.05 | 1.01 | 218 | 41% | 25% |

BTC-daily passes 5 of 6 gates (fails Sharpe 1.07 < 1.5). Parameters stable
across walk-forward windows (expansion=2, stop=2×ATR, hold=20 in 3/4).
**Robustness caveats:** (a) edge is BTC-daily-specific — negative/flat on
ETH and 4h; (b) cross-venue check on Kraken XBTUSD daily 2024–2026 with the
same fixed params: only +1.0% net, Sharpe 0.17, PF 1.14 — the strong OOS
years were 2021–2024, recent regime is marginal; (c) best-of-14 dataset ×
strategy results carries selection bias.

### Diversification measured (equal-weight, per-candle rebalanced, OOS)
- BTC+ETH 4h trend portfolio: return corr 0.536 → Sharpe 0.56 → **0.59**,
  DD 8.3% → 6.3%. Two correlated crypto assets barely move Sharpe.
- Strategy blends on BTC 1d (trend/donchian/vol-exp, corr 0.44–0.65):
  best blend Sharpe 0.96 < vol-exp alone 1.07. Blending averages down when
  components are weaker and correlated.

## Program verdict after all 6 mandated candidates

**No strategy meets the production gate (Sharpe > 1.5 is the binding
constraint everywhere).** The trend/breakout family shows a real, repeatable
but weak edge on deep OOS data (PF 1.4–2.35, positive expectancy, tiny
drawdowns at 1% risk-per-trade). Per the mandate ("Only strategies meeting
minimum thresholds move to paper trading"), nothing graduates to paper
trading without owner approval.

## 2026-07-04 — Owner decision & execution

**Decision:** Gate **held** (Sharpe > 1.5 stays required for real money) AND
paper-trading exception **approved** for vol-expansion BTC-daily (zero
capital). Both tracks below are now in motion.

### Track A — Multi-asset diversification (research)
Built N-asset portfolio tooling: correlation matrix, best-Sharpe-first
diversification curve, full equal-weight portfolio metrics
(`scripts/run-portfolio-backtest.ts`, pure math in `src/lib/backtest/portfolio.ts`,
7 unit tests). Fetcher `--deep` default expanded to 8 majors
(BTC/ETH/SOL/XRP/ADA/LTC/LINK/DOT).

Early finding on the existing 2-asset (BTC+ETH) daily data: naive
diversification **hurts** here — BTC alone OOS Sharpe 0.46; adding ETH (Sharpe
−0.11, correlation 0.56) drags the equal-weight portfolio to 0.20. Breadth
only helps with *low-correlation, positive-edge* assets — which is exactly
what the wider basket will test. **Needs the user to run the deep fetch for
the 8-asset basket, then `run-portfolio-backtest.ts`.**

### Track B — Vol-expansion paper experiment (built, not yet deployed)
Wired the validated strategy into `trading-bot` behind `USE_STRATEGY_ENGINE`
(default OFF, paper-mode hard-guarded). Deployed adapter's entry/stop logic is
pinned to the backtest by a parity test. Known deviation: time-based exit not
yet honored (documented). See `STRATEGY_ENGINE_PAPER_EXPERIMENT.md` for the
deploy/preview/enable runbook and safety guarantees. **Not runtime-verified in
sandbox — user must preview-test before enabling.**

## Remaining next steps

1. **User runs the deep 8-asset fetch + portfolio measurement** (Track A) and
   pushes the data; I analyze whether breadth lifts Sharpe toward the gate.
2. **User preview-tests + enables the paper experiment** (Track B runbook).
3. **Add the max-hold time-exit** to `execute_trade` to make the paper
   experiment a faithful replica (currently entry+stop only).
4. **Regime/vol filters** on the trend family — tested walk-forward.
5. Re-validate any graduating strategy on Kraken data before go-live.
