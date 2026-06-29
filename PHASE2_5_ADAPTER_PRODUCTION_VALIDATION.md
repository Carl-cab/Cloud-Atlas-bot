# Phase 2.5: Adapter Production Validation

## Status: PRODUCTION VALIDATION COMPLETE

All production validation steps have been completed with USE_BROKER_ADAPTERS=true.
63 paper trades executed (exceeding the 50-trade target), 0 HTTP 500 errors,
kill switch and cooldown both verified operational.

---

## Local Validation Results

| Check | Result |
|---|---|
| Security tests (121 total) | PASS |
| Broker adapter tests (27) | PASS |
| Broker wiring tests (29) | PASS |
| Trading safety tests (65) | PASS |
| Production build | PASS |
| Lint (no new errors) | PASS |
| Import path verification | PASS (all 6 import targets exist) |
| Brace/paren balance check | PASS (all 5 modified files) |
| Feature flag default OFF | PASS |

---

## Production Deployment Runbook

### Prerequisites

```bash
export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"
export SUPABASE_ANON_KEY="eyJhbGciOiJI..."
export SUPABASE_USER_EMAIL="cmcabrera1974@gmail.com"
export SUPABASE_USER_PASSWORD="your-password"
```

### Step 1: Set the feature flag secret

```bash
npx supabase secrets set USE_BROKER_ADAPTERS=true --project-ref ijwxlzwdysvvghmxlrnq
```

### Step 2: Deploy affected functions

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy trading-bot --project-ref ijwxlzwdysvvghmxlrnq
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy live-trading-engine --project-ref ijwxlzwdysvvghmxlrnq
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy reconciliation-engine --project-ref ijwxlzwdysvvghmxlrnq
```

### Step 3: Run health-check

```bash
bash scripts/phase3-start-paper-trading.sh
```

Expected: HTTP 200 or 403 (readiness gate), NOT 500.

### Step 4: Run batch paper trades

```bash
bash scripts/phase3-batch-paper-trades.sh 10
```

Expected: Some trades executed, some rejected by risk management. Zero HTTP 500 errors.

### Step 5: Test kill switch

```bash
bash scripts/phase3-test-kill-switch.sh
```

Expected: Kill switch activates and deactivates cleanly.

### Step 6: Test cooldown

```bash
bash scripts/phase3-test-cooldown.sh
```

Expected: COOLDOWN_ENGAGED appears in security_audit_log.

### Step 7: Run monitor

```bash
bash scripts/phase3-monitor.sh
```

Expected: Trade count increases, 0 failed reconciliations.

### Step 8: Verify adapter audit events

Query the security_audit_log for new broker audit events:

```bash
curl -s "https://ijwxlzwdysvvghmxlrnq.supabase.co/rest/v1/security_audit_log?action=in.(BROKER_SELECTED,ORDER_SIMULATED,MARKET_DATA_FETCHED,RECONCILIATION_STARTED,RECONCILIATION_SKIPPED,RECONCILIATION_COMPLETED,BROKER_ADAPTER_FALLBACK)&order=created_at.desc&limit=20" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -m json.tool
```

Expected events when USE_BROKER_ADAPTERS=true:

| Event | When |
|---|---|
| BROKER_SELECTED | Every adapter-path request |
| MARKET_DATA_FETCHED | After generate_paper_signal or analyze_market |
| ORDER_SIMULATED | After each paper trade execution |
| RECONCILIATION_SKIPPED | reconciliation in paper mode (no credentials) |
| RECONCILIATION_STARTED | reconciliation with credentials |
| RECONCILIATION_COMPLETED | After successful reconciliation |
| BROKER_ADAPTER_FALLBACK | If adapter fails (should be rare/zero) |

---

## Rollback Plan

If any issues are found during production validation:

### Immediate rollback (no code change needed)

```bash
npx supabase secrets set USE_BROKER_ADAPTERS=false --project-ref ijwxlzwdysvvghmxlrnq
```

All three functions will revert to legacy behavior on the next request.
No redeployment needed -- the flag is checked at runtime.

### Full rollback (if code changes caused issues)

```bash
# Revert to Phase 1 + docs commit
git checkout 89b4c4f -- supabase/functions/trading-bot/index.ts \
  supabase/functions/live-trading-engine/index.ts \
  supabase/functions/reconciliation-engine/index.ts

# Redeploy
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy trading-bot --project-ref ijwxlzwdysvvghmxlrnq
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy live-trading-engine --project-ref ijwxlzwdysvvghmxlrnq
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy reconciliation-engine --project-ref ijwxlzwdysvvghmxlrnq
```

---

## Production Validation Checklist

Completed during production deployment:

| Check | Expected | Actual | Status |
|---|---|---|---|
| Secret set: USE_BROKER_ADAPTERS=true | Set | Set | PASS |
| trading-bot deployed | Success | Success | PASS |
| live-trading-engine deployed | Success | Success | PASS |
| reconciliation-engine deployed | Success | Success | PASS |
| health-check HTTP status | Not 500 | HTTP 200 | PASS |
| Paper signal generation | HTTP 200 | HTTP 200 | PASS |
| Paper trade execution | Some executed | 63 trades | PASS |
| Batch trades (10) | 0 HTTP 500 | 0 HTTP 500 | PASS |
| Kill switch test | Activate + deactivate | Trade blocked when paused, unblocked when unpaused | PASS |
| Cooldown test | COOLDOWN_ENGAGED in log | Audit logged: true, bot unpaused | PASS |
| BROKER_SELECTED in audit log | Present | Present | PASS |
| ORDER_SIMULATED in audit log | Present | Present | PASS |
| MARKET_DATA_FETCHED in audit log | Present | Present | PASS |
| RECONCILIATION_SKIPPED in audit log | Present | Present | PASS |
| Trade count increasing | Yes | 63 total | PASS |
| Failed reconciliations | 0 | 0 | PASS |
| Live trading blocked | HTTP 501 | HTTP 501 | PASS |
| No HTTP 500 errors | True | True | PASS |
| No real orders placed | True | True | PASS |

---

## Confirmations

- **Live trading remains disabled**: The HTTP 501 hard block in `execute_trade` is
  unchanged. The `place_order` action in live-trading-engine is NOT wired to the
  adapter. All existing kill switch, readiness gate, and risk management controls
  are preserved.

- **Paper trading remains default**: `bot_config.mode` defaults to `'paper'`.
  The PaperBrokerAdapter is wired for market data only (price lookups). Paper
  trade execution uses the same DB path as before.

- **No real orders were placed**: All changes are behind the USE_BROKER_ADAPTERS
  feature flag. Even with the flag ON, the adapter path only handles read
  operations (balances, market data, order history) and paper trade simulation.
  Order placement is not wired to the adapter.

- **Rollback is instant**: Set USE_BROKER_ADAPTERS=false. No redeployment needed.

---

## Files in This Phase

| File | Type |
|---|---|
| `PHASE2_5_ADAPTER_PRODUCTION_VALIDATION.md` | This report |
| `scripts/phase3-monitor.sh` | Fixed cooldown and kill switch detection |

Code change: `phase3-monitor.sh` updated to check `risk_cooldowns` table as
fallback for cooldown verification (the audit log may be RLS-restricted for
user JWT reads), and to query `KILL_SWITCH_ACTIVATED` audit entries plus
current `bot_config` state for kill switch verification.
