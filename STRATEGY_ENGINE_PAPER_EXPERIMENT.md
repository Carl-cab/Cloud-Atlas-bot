# Strategy Engine — Paper Experiment Runbook

**Status:** Built, unit-tested, **not runtime-verified in this sandbox.**
**Approval:** Owner approved the paper-trading exception (zero capital).
**Gate decision:** The Sharpe > 1.5 production gate **remains held** for any
real-money/live decision. This experiment is forward-evidence gathering that
sits *below* the promotion bar — running it does not amend the gate.

---

## What this is

A zero-capital, PAPER-mode forward test of the one backtest-validated
strategy — **volatility expansion on BTC daily** (OOS +23.1%, Sharpe 1.07,
PF 2.35, max DD 3.2% over 2017–2026). It still fails the Sharpe gate and is
BTC-daily-specific; the point is to see how it behaves on live-forward data
in the current regime, where its record is weakest.

## What was built (this session)

| File | Change | Risk when flag OFF |
|------|--------|--------------------|
| `_shared/strategy/strategies/volatility-expansion.ts` | New validated adapter (entry/stop logic pinned to the backtest by a parity test) | None — not imported at runtime unless flag on |
| `_shared/strategy/mod.ts` | Export the adapter | None |
| `_shared/featureFlags.ts` | `useStrategyEngine()` — **default OFF** | None |
| `trading-bot/index.ts` | `analyze_market` runs the pipeline **only if `USE_STRATEGY_ENGINE=true` AND bot mode is `paper`**; wrapped in try/catch | **None — byte-identical behavior when flag is off** |

Tests: `src/test/backtest/strategy-engine-parity.test.ts` proves the deployed
adapter's entry/stop decisions match the validated backtest candle-for-candle.
Full suite: 384 passing, `tsc` clean.

## Safety guarantees

1. **Default OFF.** Deploying this changes nothing until you set the env var.
2. **Paper-mode hard guard.** If `bot_config.mode !== 'paper'`, the block does
   nothing but write a "skipped" audit row. It can never act in live mode.
3. **Long-only.** Only a `long` aggregate becomes a paper `buy`. No shorts/sells.
4. **Non-breaking.** The whole block is wrapped in try/catch; any error emits a
   `STRATEGY_ERROR` audit row and the normal `analyze_market` response proceeds.
5. **Live trading stays disabled.** This flag is independent of and does not
   touch live-trading configuration.

## ⚠️ Known deviation from the validated strategy (must read)

The validated strategy exits **after 20 candles (time-based)**. The current
wiring feeds only the **entry + ATR stop** into the existing paper position
manager, which exits on **stop-loss / take-profit / safety-stop** — not on
elapsed time. So the paper experiment faithfully tests *entry timing and the
ATR stop*, but **not** the full validated system.

**Before treating the paper results as a faithful replica**, add a max-hold
exit in `execute_trade`'s paper position management: close any position whose
age (in candles of the traded timeframe) ≥ 20. This was intentionally left
out to keep the change surface minimal and reviewable; it should be added and
tested in preview. Until then, read paper results as "entry+stop only."

## Verification status — READ

This sandbox cannot compile or run Deno edge functions, reach Supabase, or
place paper trades. The adapter logic is verified by the vitest parity test,
but **the wiring has not been executed end-to-end.** You must test it in a
Supabase preview/staging project before enabling it anywhere real.

## Runbook (run on your machine)

```bash
# 0. Ensure strategy tables exist (additive migration, already in repo)
SUPABASE_ACCESS_TOKEN=<pat> npx supabase db push --project-ref <preview-ref>

# 1. Deploy trading-bot with the flag OFF (byte-identical behavior)
SUPABASE_ACCESS_TOKEN=<pat> npx supabase functions deploy trading-bot --project-ref <ref>
#    Confirm Phase 3 is undisturbed:
bash scripts/phase3-monitor.sh

# 2. In a PREVIEW/STAGING project only, enable the flag and smoke-test:
#    set USE_STRATEGY_ENGINE=true, USE_BROKER_ADAPTERS=true, mode=paper
#    then exercise the flow:
#      POST trading-bot { action: 'analyze_market', symbol: 'XBTUSD' }
#      POST trading-bot { action: 'execute_trade',  symbol: 'XBTUSD' }
#    Verify:
#      - strategy_results rows for strategy_id='volatility-expansion'
#      - strategy_signals rows with strategy_type='volatility-expansion' (only on long)
#      - security_audit_log: STRATEGY_PIPELINE_EXECUTED
#      - a PAPER position opened; NO real order on Kraken
#      - with mode flipped to 'live', the block writes a 'skipped' audit and does NOTHING

# 3. Only after a clean preview run, enable USE_STRATEGY_ENGINE=true in the
#    paper validation environment. Keep mode=paper. Monitor daily.
```

## Rollback

- **Instant:** set `USE_STRATEGY_ENGINE=false`. No redeploy needed.
- **Full:** redeploy the previous `trading-bot`. Strategy tables can be left in
  place (isolated) or truncated: `TRUNCATE strategy_results;`

## What "success" of the experiment means

Not "profit." Success = we gather clean, durable forward signals/results in
`strategy_results` + `strategy_signals` with a full audit trail, so we can
later compare live-forward behavior against the backtest and decide — with
the Sharpe gate still held — whether this strategy is worth more work.
