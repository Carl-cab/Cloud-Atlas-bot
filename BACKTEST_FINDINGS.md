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

## Next steps (in order)

1. Fetch deep daily/4h history: `node scripts/fetch-historical-data.mjs --deep`
   (Binance public klines back to 2017 — data source only, no trading
   integration; final candidates must be re-validated on Kraken data).
2. Re-run candidates #1/#2 (trend family) on 8+ years of daily data.
3. If trend family fails there too, proceed to candidates #4–#6 (Breakout,
   Donchian, Volatility Expansion) on the same deep data.
4. Any strategy that passes all thresholds on deep data graduates to paper
   trading via the Strategy Engine (Phase 4 wiring — requires owner approval).
