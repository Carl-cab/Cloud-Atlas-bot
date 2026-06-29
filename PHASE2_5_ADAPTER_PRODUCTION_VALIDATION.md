# Phase 2.5: Adapter Production Validation

## Status: LOCAL VALIDATION COMPLETE -- PRODUCTION DEPLOYMENT PENDING

Production deployment requires `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ANON_KEY`,
`SUPABASE_USER_EMAIL`, and `SUPABASE_USER_PASSWORD` environment variables
which are not available in this CI environment. All local validation has
passed. Follow the runbook below to complete production validation.

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

Fill in during production deployment:

| Check | Expected | Actual | Status |
|---|---|---|---|
| Secret set: USE_BROKER_ADAPTERS=true | Set | _pending_ | _pending_ |
| trading-bot deployed | Success | _pending_ | _pending_ |
| live-trading-engine deployed | Success | _pending_ | _pending_ |
| reconciliation-engine deployed | Success | _pending_ | _pending_ |
| health-check HTTP status | Not 500 | _pending_ | _pending_ |
| Paper signal generation | HTTP 200 | _pending_ | _pending_ |
| Paper trade execution | Some executed | _pending_ | _pending_ |
| Batch trades (10) | 0 HTTP 500 | _pending_ | _pending_ |
| Kill switch test | Activate + deactivate | _pending_ | _pending_ |
| Cooldown test | COOLDOWN_ENGAGED in log | _pending_ | _pending_ |
| BROKER_SELECTED in audit log | Present | _pending_ | _pending_ |
| ORDER_SIMULATED in audit log | Present | _pending_ | _pending_ |
| MARKET_DATA_FETCHED in audit log | Present | _pending_ | _pending_ |
| RECONCILIATION_SKIPPED in audit log | Present | _pending_ | _pending_ |
| Trade count increasing | Yes | _pending_ | _pending_ |
| Failed reconciliations | 0 | _pending_ | _pending_ |
| Live trading blocked | HTTP 501 | _pending_ | _pending_ |
| No HTTP 500 errors | True | _pending_ | _pending_ |
| No real orders placed | True | _pending_ | _pending_ |

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

No code changes in Phase 2.5. All code changes were in Phase 2 (commit `8cf9607`).
