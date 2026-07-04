# Rollback Procedure

The Strategy Engine paper experiment is designed to be reverted instantly with
zero capital exposure. This covers staging and (later) production.

## TL;DR

Set `USE_STRATEGY_ENGINE=false` and the wiring goes inert immediately. No
redeploy required. Because the flag defaults off, this is also the safe state.

---

## 1. Instant rollback (either environment)

In the affected project's Dashboard → Edge Functions → Secrets:

```
USE_STRATEGY_ENGINE=false
```

Effect: the `analyze_market` strategy block is skipped entirely on the next
invocation. `analyze_market` reverts to byte-identical legacy behavior. No
strategy signals are written. Nothing else changes.

No redeploy is needed — the flag is read at request time.

## 2. Full rollback (redeploy previous function)

If you also want to remove the wiring from the deployed bundle:

```bash
# Staging:
git checkout <previous-good-commit> -- supabase/functions/trading-bot/index.ts
SUPABASE_ACCESS_TOKEN=<pat> npx supabase functions deploy trading-bot --project-ref "$STAGING_PROJECT_REF"

# (Production only if step E was ever performed — same command with the
#  production ref, done deliberately, never as routine.)
```

## 3. Data cleanup (optional)

Experiment output lives in isolated tables and an audit type. None of it
affects Phase 3 tables. To reset:

```sql
-- staging (or production, only if the experiment ran there)
truncate public.strategy_results;
delete from public.strategy_signals where strategy_type = 'volatility-expansion';
-- audit entries are immutable history; leave them, or archive as needed
```

`strategy_signals` cleanup matters most: it removes any experiment signal so
`execute_trade` can't act on a stale vol-expansion row.

## 4. Verify rollback

- `analyze_market` returns 200 and writes **no** new `strategy_results`
- No new `STRATEGY_PIPELINE_EXECUTED` audit entries
- `execute_trade` behaves as before (legacy signal path)
- `ORDER_PLACED` (live) count still 0

## Production-specific notes

- Production rollback is only ever needed if enablement (Release Checklist
  step E) was performed. Until then, production has nothing to roll back.
- If rolling back in production, first confirm Phase 3 batch trading is not
  mid-cycle, then flip the flag off. The flag-off path is byte-identical to
  the current Phase 3 behavior, so Phase 3 continues undisturbed.
- Never respond to a production issue by experimenting in production. Reproduce
  on staging.

## What rollback cannot leave behind

- No open real positions (paper mode only; `ORDER_PLACED` must be 0)
- No lingering live-trading config (never enabled)
- No change to `bot_config.mode` (stays `paper` throughout)
