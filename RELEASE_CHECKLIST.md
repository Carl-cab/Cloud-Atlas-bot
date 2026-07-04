# Release Checklist — Strategy Engine Paper Experiment

Work top to bottom. Do not skip. A box may only be checked when literally true.

## A. Pre-deploy (repo)

- [ ] `npx vitest run src/test/backtest/ src/test/security/` — all pass
- [ ] `src/test/backtest/strategy-engine-parity.test.ts` passes (adapter ==
      validated backtest logic)
- [ ] `npx tsc --noEmit -p tsconfig.app.json` — clean
- [ ] `npx eslint .` — clean
- [ ] `USE_STRATEGY_ENGINE` defaults to **false** in `_shared/featureFlags.ts`
- [ ] Wiring is paper-guarded (`seMode !== 'paper'` skips) and wrapped in
      try/catch in `trading-bot/index.ts`

## B. Staging exists and is isolated

- [ ] `STAGING_PROJECT_REF` is set and is **not** `ijwxlzwdysvvghmxlrnq`
- [ ] Staging schema applied (`deploy-staging.sh --with-migrations`)
- [ ] Staging test user created; paper `bot_config` seeded (`mode=paper`)
- [ ] Read-only Kraken keys stored for the staging test user
- [ ] Staging secrets: `USE_BROKER_ADAPTERS=true`, `USE_STRATEGY_ENGINE=true`

## C. Staging smoke test

- [ ] `bash scripts/deploy-staging.sh` succeeded (targeted staging ref)
- [ ] `bash scripts/run-smoke-tests.sh` → **PASS, 0 failed**
  - [ ] `analyze_market` returned 200
  - [ ] `strategy_results` grew (pipeline ran)
  - [ ] `STRATEGY_PIPELINE_EXECUTED` audit written
  - [ ] `execute_trade` produced a paper outcome
  - [ ] `ORDER_PLACED` (live) count == 0

## D. Production safety preconditions (all must be true)

- [ ] **Phase 3 complete** — 7 distinct trading days, monitor criteria met
- [ ] Production `phase3-monitor.sh` shows the Phase 3 record intact and
      uncontaminated (no `volatility-expansion` signals present)
- [ ] Known deviation resolved **or** explicitly accepted in writing:
      time-based exit not yet honored (entry+stop only) — see
      `STRATEGY_ENGINE_PAPER_EXPERIMENT.md`
- [ ] Rollback rehearsed on staging (flag off → behavior reverts) —
      `ROLLBACK_PROCEDURE.md`
- [ ] **Owner sign-off** recorded (name + date)

## E. Production enablement (only if A–D all checked; separate approval)

- [ ] Deploy `trading-bot` to production with flag **off**; confirm
      `phase3-monitor.sh` unchanged (byte-identical)
- [ ] Set production `USE_STRATEGY_ENGINE=true` (mode stays `paper`)
- [ ] Observe one `analyze_market` → `execute_trade` cycle; `strategy_results`
      + audit present; no live orders
- [ ] Rollback trigger documented and on-hand

## Global invariants (true at every step)

- [ ] Live trading disabled everywhere
- [ ] No real orders placed
- [ ] Production project only ever runs the scheduled paper validation until
      step E is deliberately approved

---

### Sign-off

| Gate | Name | Date |
|------|------|------|
| Staging smoke test passed | | |
| Phase 3 complete | | |
| Owner approval for production enablement | | |
