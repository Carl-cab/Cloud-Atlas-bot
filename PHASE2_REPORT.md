# Phase 2: Health Check Validation Report

**Date**: 2026-06-28
**Status**: Offline validation COMPLETE — schema mismatches found and fixed
**Blocking**: Live Supabase credentials required for online health-check run

---

## Summary

Phase 2 performed a thorough offline validation of the health-check function against the actual database schema defined in migrations. This uncovered **4 schema mismatches** that would have caused the health-check to fail at runtime. All 4 have been fixed.

A ready-to-run script (`scripts/run-health-check.sh`) has been created for the user to execute the live health-check once credentials are available.

---

## Schema Mismatches Found and Fixed

### Fix 1: health-check queried non-existent bot_config columns

**Problem**: `health-check/index.ts` queried `bot_config` for columns `paper_trading_mode` and `max_daily_loss_pct` — neither exists in any migration.

**Actual columns**:
- `mode` (TEXT, default 'paper') — from original migration
- `daily_stop_loss` (DECIMAL) — from original migration
- `is_paused` (BOOLEAN) — from Phase 2 migration

**Fix**: Changed the health-check SELECT to use `is_paused, mode, daily_stop_loss`. Changed the live trading check to query `mode = 'live'` instead of `paper_trading_mode = false`.

### Fix 2: health-check inserted wrong column names into security_audit_log

**Problem**: The audit log writability test inserted `category`, `severity`, and `details` — none of which exist.

**Actual columns**:
- `event_category` (TEXT, default 'security') — from Phase 2 migration
- `severity_level` (TEXT, default 'info') — from Phase 2 migration
- `metadata` (JSONB) — from original migration

**Fix**: Changed insert to use `event_category`, `severity_level`, and `metadata`.

### Fix 3: Phase 4 migration indexed non-existent column on rate_limit_entries

**Problem**: Migration `20260620000004` created an index on `rate_limit_entries(window_start)` — this column doesn't exist. The actual column is `timestamp` (BIGINT).

**Fix**: Removed the redundant index creation (an index on `timestamp` already exists from the original migration).

### Fix 4: scheduler-engine used wrong column name for rate_limit_entries cleanup

**Problem**: `scheduler-engine/index.ts` deleted rate limit entries using `.lt('window_start', cutoff)` with an ISO date string cutoff. The actual column is `timestamp` (BIGINT, Unix ms).

**Fix**: Changed to `.lt('timestamp', cutoff)` with `cutoff = Date.now() - 60 * 60 * 1000`.

---

## Offline Validation Results

### Environment Variables (would run at deploy time)
| Check | Expected |
|-------|----------|
| SUPABASE_URL | Must be set (auto-provided by Supabase) |
| SUPABASE_SERVICE_ROLE_KEY | Must be set (auto-provided by Supabase) |
| SUPABASE_ANON_KEY | Must be set (auto-provided by Supabase) |
| ENCRYPTION_KEY | Must be set, >= 32 chars, not a placeholder |
| RESEND_API_KEY | Recommended (warning if absent) |
| TELEGRAM_BOT_TOKEN | Recommended (warning if absent) |

### Required Tables (verified in migrations)
| Table | Migration | Status |
|-------|-----------|--------|
| user_wallets | 20260620000003_phase3_money_flow.sql | PASS |
| transactions | 20260620000003_phase3_money_flow.sql | PASS |
| withdrawal_requests | 20260620000003_phase3_money_flow.sql | PASS |
| pnl_snapshots | 20260620000003_phase3_money_flow.sql | PASS |
| reconciliation_log | 20260620000003_phase3_money_flow.sql | PASS |
| bot_config | 20250730180354 (original) | PASS |
| risk_settings | 20250802161451 | PASS |
| trading_positions | 20250730180354 (original) | PASS |
| executed_trades | 20250730180354 (original) | PASS |
| security_audit_log | 20250806233801 | PASS |
| deployment_checks | 20260620000004_phase4 | PASS |
| app_settings | 20260620000004_phase4 | PASS |

### RLS Enabled (verified in migrations)
All 11 sensitive tables have `ENABLE ROW LEVEL SECURITY`: PASS

### Bot Config Schema (verified)
| Column | Source | Status |
|--------|--------|--------|
| is_paused | Phase 2 migration | PASS |
| mode | Original migration (default 'paper') | PASS |
| daily_stop_loss | Original migration | PASS |
| paused_at | Phase 2 migration | PASS |
| paused_reason | Phase 2 migration | PASS |

### App Settings Seeded (verified in Phase 4 migration)
All 10 system settings present including `paper_trading_default = 'true'`: PASS

### Edge Functions (verified)
All 15 required functions exist with index.ts and verify_jwt=true: PASS

### Wallet Schema (verified in Phase 3 migration)
All 4 required columns present (available_balance, locked_in_trades, total_realized_pnl, total_fees_paid): PASS

---

## How to Run the Live Health Check

```bash
# 1. Set credentials
export SUPABASE_URL="https://asxcbnkpflgecqreegdd.supabase.co"
export USER_JWT="<your-jwt-token>"
export SUPABASE_ANON_KEY="<your-anon-key>"

# 2. Run
bash scripts/run-health-check.sh
```

The script will:
- Call the health-check edge function
- Display pass/fail/warn for each check
- Report `deployment_ready: true/false`

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/health-check/index.ts` | Fixed bot_config column names (paper_trading_mode → mode, max_daily_loss_pct → daily_stop_loss) |
| `supabase/functions/health-check/index.ts` | Fixed audit log column names (category → event_category, severity → severity_level, details → metadata) |
| `supabase/functions/scheduler-engine/index.ts` | Fixed rate_limit_entries cleanup (window_start → timestamp, ISO string → Unix ms) |
| `supabase/migrations/20260620000004_phase4_production_config.sql` | Removed index on non-existent window_start column |
| `scripts/run-health-check.sh` | New: ready-to-run health check script |

---

## Remaining for Phase 2 Completion

1. **Deploy edge functions** to Supabase (requires SUPABASE_ACCESS_TOKEN)
2. **Run migrations** via Supabase Dashboard
3. **Execute live health-check** using `scripts/run-health-check.sh`
4. **Confirm `deployment_ready: true`**

Live trading remains disabled. Paper trading remains the default.
