# Deployment Workflow

The path a change takes from repo to (eventually) production, with staging as
the mandatory smoke-test gate. This document covers the Strategy Engine paper
experiment specifically, but the flow is general.

```
 build/test (local + CI)  →  deploy staging  →  smoke test staging  →
   review + Phase 3 gate  →  [owner sign-off]  →  deploy production (flag on)
```

Production `USE_STRATEGY_ENGINE` is **not** enabled by this workflow today.
The final step is gated and deliberately out of scope for the current task.

---

## Stage 1 — Build & test (local / CI)

```bash
npx vitest run src/test/backtest/ src/test/security/   # 384+ tests
npx tsc --noEmit -p tsconfig.app.json                  # types clean
npx eslint .                                            # lint clean
```

The adapter's entry/stop logic is pinned to the validated backtest by
`src/test/backtest/strategy-engine-parity.test.ts`. Do not proceed if the
parity test fails — it means the deployed strategy has drifted from what was
validated.

## Stage 2 — Deploy to staging

Prerequisites configured per `STAGING_SETUP.md` (`STAGING_PROJECT_REF`,
access token, staging keys, test user, paper `bot_config`, read-only Kraken
keys, `USE_STRATEGY_ENGINE=true` staging secret).

```bash
bash scripts/deploy-staging.sh                 # trading-bot + secure-credentials
# or, first time / after schema changes:
bash scripts/deploy-staging.sh --with-migrations
```

The script refuses to target the production ref.

## Stage 3 — Smoke test staging

```bash
bash scripts/run-smoke-tests.sh
```

Verifies, against staging only:
- `analyze_market` runs the pipeline (`strategy_results` grows)
- a `STRATEGY_PIPELINE_EXECUTED` audit entry is written
- `execute_trade` yields a paper outcome (simulated order or "no signal")
- zero live orders (`ORDER_PLACED = 0`)

The live-mode guard is verified by code review + unit tests; the smoke test
never sets `mode=live`.

## Stage 4 — Review & Phase 3 gate

Do **not** promote to production until, at minimum:
- Smoke tests pass on staging (Stage 3)
- **Phase 3 is complete** (7 distinct trading days, monitor criteria met)
- The known time-exit deviation is resolved or explicitly accepted
  (see `STRATEGY_ENGINE_PAPER_EXPERIMENT.md`)
- Owner sign-off recorded

See `RELEASE_CHECKLIST.md` for the full gate.

## Stage 5 — Production enablement (gated; not this task)

Only after Stage 4 fully passes, and as a separate, explicitly approved action:

1. Deploy `trading-bot` to production **with the flag still off**; confirm
   `phase3-monitor.sh` is unchanged (byte-identical behavior).
2. In a maintenance window, set production `USE_STRATEGY_ENGINE=true`
   (mode stays `paper`).
3. Watch `strategy_results` / audit for one cycle; be ready to roll back
   (`ROLLBACK_PROCEDURE.md`).

Until every prior stage is satisfied, production stays exactly as it is.

## If a stage fails

Stop. Fix in the repo, re-run Stage 1, redeploy staging, re-smoke-test. Never
"try it in production to see." Production is the Phase 3 environment.
