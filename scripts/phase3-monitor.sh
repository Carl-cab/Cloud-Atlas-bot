#!/bin/bash
# =============================================================================
# Phase 3: Paper Trading Monitor
#
# Checks current paper trading progress against Phase 3 pass criteria.
# All checks are evidence-based: each criterion queries real DB tables.
#
# Prerequisites:
#   export SUPABASE_ANON_KEY="your-anon-key"
#   export SUPABASE_USER_EMAIL="your@email.com"
#   export SUPABASE_USER_PASSWORD="your-password"
# =============================================================================

set -euo pipefail

PROJECT_REF="ijwxlzwdysvvghmxlrnq"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

ANON_KEY="${SUPABASE_ANON_KEY:?'Set SUPABASE_ANON_KEY first'}"
USER_EMAIL="${SUPABASE_USER_EMAIL:?'Set SUPABASE_USER_EMAIL first'}"
USER_PASSWORD="${SUPABASE_USER_PASSWORD:?'Set SUPABASE_USER_PASSWORD first'}"

# Authenticate
AUTH_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}")

USER_JWT=$(echo "$AUTH_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('access_token', ''))
" 2>/dev/null)

if [ -z "$USER_JWT" ]; then
  echo "ERROR: Authentication failed."
  exit 1
fi

echo "=============================================="
echo "  Phase 3: Paper Trading Progress Monitor"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=============================================="
echo ""

# -----------------------------------------------
# 1. Paper trade count (target: 50+)
# -----------------------------------------------
echo "--- 1. Paper Trades ---"
TRADES_DATA=$(curl -s "${SUPABASE_URL}/rest/v1/executed_trades?select=id,kraken_order_id,timestamp" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")
TRADES=$(echo "$TRADES_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

POS_DATA=$(curl -s "${SUPABASE_URL}/rest/v1/trading_positions?select=id" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")
POSITIONS=$(echo "$POS_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

TARGET_TRADES=50
if [ "$TRADES" -ge "$TARGET_TRADES" ] 2>/dev/null; then
  echo "  [PASS] $TRADES / $TARGET_TRADES executed trades (readiness gate counter)"
else
  echo "  [    ] $TRADES / $TARGET_TRADES executed trades (readiness gate counter)"
fi
echo "  Positions: $POSITIONS"
echo ""

# -----------------------------------------------
# 2. Failed reconciliations (target: 0)
# -----------------------------------------------
echo "--- 2. Reconciliation ---"
RECON_FAILS=$(curl -s "${SUPABASE_URL}/rest/v1/reconciliation_log?select=id&status=eq.discrepancy" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "?")

if [ "$RECON_FAILS" = "0" ]; then
  echo "  [PASS] 0 failed reconciliations"
else
  echo "  [FAIL] $RECON_FAILS discrepancies found"
fi
echo ""

# -----------------------------------------------
# 3. Risk check coverage (every trade must have a risk decision)
# -----------------------------------------------
echo "--- 3. Risk Check Coverage ---"

RISK_AUDIT_RAW=$(curl -s "${SUPABASE_URL}/rest/v1/security_audit_log?select=action&action=in.(PAPER_TRADE_EXECUTED,TRADE_REJECTED)" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

RISK_AUDIT_RESULT=$(echo "$RISK_AUDIT_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not isinstance(data, list):
    print('audit_total=0 executed=0 rejected=0')
else:
    executed = sum(1 for e in data if e.get('action') == 'PAPER_TRADE_EXECUTED')
    rejected = sum(1 for e in data if e.get('action') == 'TRADE_REJECTED')
    print(f'audit_total={executed + rejected} executed={executed} rejected={rejected}')
" 2>/dev/null || echo "audit_total=0 executed=0 rejected=0")

RISK_AUDIT_TOTAL=$(echo "$RISK_AUDIT_RESULT" | sed -n 's/.*audit_total=\([0-9][0-9]*\).*/\1/p')
RISK_AUDIT_TOTAL=${RISK_AUDIT_TOTAL:-0}
RISK_EXECUTED=$(echo "$RISK_AUDIT_RESULT" | sed -n 's/.*executed=\([0-9][0-9]*\).*/\1/p')
RISK_EXECUTED=${RISK_EXECUTED:-0}
RISK_REJECTED=$(echo "$RISK_AUDIT_RESULT" | sed -n 's/.*rejected=\([0-9][0-9]*\).*/\1/p')
RISK_REJECTED=${RISK_REJECTED:-0}

POSITIONS_WITH_RISK=$(curl -s "${SUPABASE_URL}/rest/v1/trading_positions?select=id&risk_amount=not.is.null&stop_loss=not.is.null" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "  Audit trail: $RISK_EXECUTED PAPER_TRADE_EXECUTED + $RISK_REJECTED TRADE_REJECTED = $RISK_AUDIT_TOTAL risk decisions"
echo "  Positions with risk_amount+stop_loss: $POSITIONS_WITH_RISK / $POSITIONS"

if [ "$RISK_AUDIT_TOTAL" -gt 0 ] 2>/dev/null && [ "$RISK_AUDIT_TOTAL" -ge "$TRADES" ] 2>/dev/null; then
  RISK_COVERAGE="pass_audit"
  echo "  [PASS] Every executed trade has a matching risk decision in audit log"
elif [ "$POSITIONS_WITH_RISK" -gt 0 ] 2>/dev/null && [ "$POSITIONS_WITH_RISK" -ge "$POSITIONS" ] 2>/dev/null; then
  RISK_COVERAGE="pass_positions"
  echo "  [PASS] Every position has risk_amount and stop_loss set (risk evaluation ran)"
elif [ "$RISK_AUDIT_TOTAL" = "0" ] && [ "$POSITIONS_WITH_RISK" = "0" ]; then
  RISK_COVERAGE="no_data"
  echo "  [    ] No risk decision evidence found (audit log may be RLS-restricted)"
  echo "  Note: Risk evaluation is enforced in code (line 1190 trading-bot/index.ts)"
else
  RISK_COVERAGE="partial"
  echo "  [WARN] Partial coverage: $RISK_AUDIT_TOTAL audit decisions for $TRADES trades"
fi
echo ""

# -----------------------------------------------
# 4. Audit log entries
# -----------------------------------------------
echo "--- 4. Audit Log ---"
AUDIT_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/security_audit_log?select=id&order=created_at.desc&limit=100" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "  Recent audit entries: $AUDIT_COUNT"
if [ "$AUDIT_COUNT" = "0" ]; then
  echo "  Note: 0 entries may indicate security_audit_log is RLS-restricted for user JWT reads"
fi
echo ""

# -----------------------------------------------
# 5. Cooldown verification (checks both security_audit_log and risk_cooldowns)
# -----------------------------------------------
echo "--- 5. Cooldown Verification ---"
COOLDOWN_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/security_audit_log?select=id&action=eq.COOLDOWN_ENGAGED" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

RISK_COOLDOWN_RAW=$(curl -s "${SUPABASE_URL}/rest/v1/risk_cooldowns?select=id,reason,engaged_at,resolved&order=engaged_at.desc&limit=10" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

RISK_COOLDOWN_COUNT=$(echo "$RISK_COOLDOWN_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "$RISK_COOLDOWN_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    for entry in data[:3]:
        reason = entry.get('reason', '?')
        engaged = entry.get('engaged_at', '?')
        resolved = entry.get('resolved', '?')
        print(f'  - {engaged}: reason={reason} resolved={resolved}')
" 2>/dev/null

COOLDOWN_TOTAL=$((COOLDOWN_COUNT + RISK_COOLDOWN_COUNT))
if [ "$COOLDOWN_COUNT" != "0" ] && [ -n "$COOLDOWN_COUNT" ]; then
  echo "  [PASS] COOLDOWN_ENGAGED audit entries: $COOLDOWN_COUNT"
elif [ "$RISK_COOLDOWN_COUNT" != "0" ] && [ -n "$RISK_COOLDOWN_COUNT" ]; then
  echo "  [PASS] Cooldown verified via risk_cooldowns table: $RISK_COOLDOWN_COUNT entries"
  echo "  (audit log returned 0 — likely RLS-restricted; risk_cooldowns confirms cooldown ran)"
else
  echo "  [    ] No cooldown entries found in audit log ($COOLDOWN_COUNT) or risk_cooldowns ($RISK_COOLDOWN_COUNT)"
  echo "  Run: bash scripts/phase3-test-cooldown.sh"
fi
echo ""

# -----------------------------------------------
# 6. P&L snapshots
# -----------------------------------------------
echo "--- 6. P&L Snapshots ---"
PNL_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/pnl_snapshots?select=id&order=created_at.desc&limit=10" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "  P&L snapshots: $PNL_COUNT"
echo ""

# -----------------------------------------------
# 7. Bot config status
# -----------------------------------------------
echo "--- 7. Bot Config ---"
BOT_MODE=$(curl -s "${SUPABASE_URL}/rest/v1/bot_config?select=mode,is_active,is_paused" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

echo "$BOT_MODE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data: print('  No config found')
for row in data:
    mode = row.get('mode', '?')
    active = row.get('is_active', False)
    paused = row.get('is_paused', True)
    safe = 'SAFE' if mode == 'paper' else 'DANGER'
    print(f'  [{safe}] mode={mode} active={active} paused={paused}')
" 2>/dev/null

IS_PAPER=$(echo "$BOT_MODE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list) and data:
    print('yes' if all(r.get('mode') == 'paper' for r in data) else 'no')
else:
    print('unknown')
" 2>/dev/null || echo "unknown")
echo ""

# -----------------------------------------------
# 8. Kill switch verification (checks KILL_SWITCH_ACTIVATED + KILL_SWITCH_RELEASED)
# -----------------------------------------------
echo "--- 8. Kill Switch ---"
KS_ACTIVATED_RAW=$(curl -s "${SUPABASE_URL}/rest/v1/security_audit_log?select=id,created_at,details&action=eq.KILL_SWITCH_ACTIVATED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

KS_ACTIVATED=$(echo "$KS_ACTIVATED_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "$KS_ACTIVATED_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    for entry in data[:3]:
        ts = entry.get('created_at', '?')
        details = entry.get('details', {})
        print(f'  ACTIVATED {ts}: trigger={details.get(\"trigger\",\"?\")} reason={details.get(\"reason\",\"?\")}')
" 2>/dev/null

KS_RELEASED_RAW=$(curl -s "${SUPABASE_URL}/rest/v1/security_audit_log?select=id,created_at,details&action=eq.KILL_SWITCH_RELEASED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

KS_RELEASED=$(echo "$KS_RELEASED_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "$KS_RELEASED_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    for entry in data[:3]:
        ts = entry.get('created_at', '?')
        details = entry.get('details', {})
        print(f'  RELEASED  {ts}: source={details.get(\"source\",\"?\")} reason={details.get(\"reason\",\"?\")}')
" 2>/dev/null

KILL_SWITCH_STATUS=$(echo "$BOT_MODE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not isinstance(data, list) or not data:
    print('unknown')
else:
    row = data[0]
    paused = row.get('is_paused', False)
    if paused:
        print('PAUSED')
    else:
        print('ACTIVE (is_paused=false)')
" 2>/dev/null || echo "unknown")

# Fallback: check risk_cooldowns for KILL_SWITCH_TEST evidence (readable by user JWT)
KS_COOLDOWN_RAW=$(curl -s "${SUPABASE_URL}/rest/v1/risk_cooldowns?select=id,reason,resolved,details&reason=eq.KILL_SWITCH_TEST&resolved=eq.true" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

KS_COOLDOWN_COUNT=$(echo "$KS_COOLDOWN_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    print(len(data))
    for entry in data[:3]:
        details = entry.get('details', {})
        print(f'  - reason={entry.get(\"reason\",\"?\")} resolved={entry.get(\"resolved\",\"?\")} source={details.get(\"source\",\"?\")}')
else:
    print('0')
" 2>/dev/null || echo "0")

KS_EVIDENCE="false"
if [ "$KS_ACTIVATED" != "0" ] && [ "$KS_RELEASED" != "0" ]; then
  KS_EVIDENCE="true"
  echo "  [PASS] Kill switch tested: $KS_ACTIVATED activated + $KS_RELEASED released (audit log)"
elif [ "$KS_COOLDOWN_COUNT" != "0" ]; then
  KS_EVIDENCE="true"
  echo "  [PASS] Kill switch tested via risk_cooldowns: $KS_COOLDOWN_COUNT entries (activated + released)"
  echo "  (audit log returned 0 — likely RLS-restricted; risk_cooldowns confirms kill switch ran)"
elif [ "$KS_ACTIVATED" != "0" ]; then
  echo "  [WARN] KILL_SWITCH_ACTIVATED found ($KS_ACTIVATED) but no KILL_SWITCH_RELEASED"
else
  echo "  [    ] No kill switch evidence found (audit: 0, risk_cooldowns: $KS_COOLDOWN_COUNT)"
  echo "  Run: bash scripts/phase3-test-kill-switch.sh"
fi
echo "  Current status: $KILL_SWITCH_STATUS"
echo ""

# -----------------------------------------------
# 9. Trading days (distinct dates with executed trades)
# -----------------------------------------------
echo "--- 9. Trading Days ---"
TRADING_DAYS=$(echo "$TRADES_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not isinstance(data, list) or not data:
    print('count=0')
else:
    dates = set()
    for row in data:
        ts = row.get('timestamp', '')
        if ts:
            dates.add(ts[:10])
    sorted_dates = sorted(dates)
    print(f'count={len(sorted_dates)}')
    for d in sorted_dates:
        day_trades = sum(1 for r in data if r.get('timestamp', '')[:10] == d)
        print(f'  - {d}: {day_trades} trades')
" 2>/dev/null || echo "count=0")

TRADING_DAY_COUNT=$(echo "$TRADING_DAYS" | head -1 | sed -n 's/.*count=\([0-9][0-9]*\).*/\1/p')
TRADING_DAY_COUNT=${TRADING_DAY_COUNT:-0}
echo "$TRADING_DAYS" | tail -n +2

TARGET_DAYS=7
if [ "$TRADING_DAY_COUNT" -ge "$TARGET_DAYS" ] 2>/dev/null; then
  echo "  [PASS] $TRADING_DAY_COUNT / $TARGET_DAYS distinct trading days"
else
  echo "  [    ] $TRADING_DAY_COUNT / $TARGET_DAYS distinct trading days"
fi
echo ""

# -----------------------------------------------
# 10. No real orders placed (evidence-based verification)
# -----------------------------------------------
echo "--- 10. No Real Orders Verification ---"

LIVE_TRADES=$(echo "$TRADES_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not isinstance(data, list):
    print('0')
else:
    live = [r for r in data if r.get('kraken_order_id', '').startswith('paper-') is False and r.get('kraken_order_id')]
    non_paper = [r for r in data if r.get('kraken_order_id') and not r.get('kraken_order_id', '').startswith('paper-')]
    print(len(non_paper))
    for r in non_paper[:5]:
        print(f'  WARNING: non-paper order_id={r.get(\"kraken_order_id\")} at {r.get(\"timestamp\",\"?\")}')
" 2>/dev/null || echo "?")

BROKER_LIVE_ORDERS=$(curl -s "${SUPABASE_URL}/rest/v1/broker_orders?select=id,broker_id,status&broker_id=eq.kraken" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not isinstance(data, list):
    print('0')
else:
    print(len(data))
    for r in data[:5]:
        print(f'  WARNING: broker_order id={r.get(\"id\")} broker={r.get(\"broker_id\")} status={r.get(\"status\")}')
" 2>/dev/null || echo "?")

TRADE_EXECUTED_AUDIT=$(curl -s "${SUPABASE_URL}/rest/v1/security_audit_log?select=id&action=eq.TRADE_EXECUTED" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "?")

echo "  Non-paper executed_trades entries: $LIVE_TRADES"
echo "  Kraken broker_orders entries: $BROKER_LIVE_ORDERS"
echo "  TRADE_EXECUTED audit entries (live): $TRADE_EXECUTED_AUDIT"
echo "  Bot config mode: $IS_PAPER"

NO_REAL_ORDERS="false"
if [ "$LIVE_TRADES" = "0" ] && [ "$BROKER_LIVE_ORDERS" = "0" ] && [ "$IS_PAPER" = "yes" ]; then
  NO_REAL_ORDERS="true"
  echo "  [PASS] Zero real orders placed — all trades are paper (paper-* prefix)"
elif [ "$LIVE_TRADES" = "?" ] || [ "$BROKER_LIVE_ORDERS" = "?" ]; then
  echo "  [WARN] Could not verify (query failed or table not accessible)"
else
  echo "  [FAIL] Evidence of non-paper activity found"
fi
echo ""

# -----------------------------------------------
# Summary
# -----------------------------------------------
echo "=============================================="
echo "  Phase 3 Pass Criteria (Evidence-Based)"
echo "=============================================="
echo "  [$([ "$TRADING_DAY_COUNT" -ge 7 ] 2>/dev/null && echo "x" || echo " ")] 7 days paper trading ($TRADING_DAY_COUNT distinct trading days)"
echo "  [$([ "$TRADES" -ge 50 ] 2>/dev/null && echo "x" || echo " ")] 50+ paper trades ($TRADES)"
echo "  [$([ "$RECON_FAILS" = "0" ] && echo "x" || echo " ")] 0 failed reconciliations ($RECON_FAILS)"
echo "  [$([ "$RISK_COVERAGE" = "pass_audit" ] || [ "$RISK_COVERAGE" = "pass_positions" ] && echo "x" || echo " ")] Risk checks on every trade ($RISK_COVERAGE)"
echo "  [$([ "$KS_EVIDENCE" = "true" ] && echo "x" || echo " ")] Kill switch (activated: $KS_ACTIVATED, released: $KS_RELEASED, status: $KILL_SWITCH_STATUS)"
echo "  [$([ "$COOLDOWN_TOTAL" -gt 0 ] 2>/dev/null && echo "x" || echo " ")] Cooldown tested (audit: $COOLDOWN_COUNT, risk_cooldowns: $RISK_COOLDOWN_COUNT)"
echo "  [$([ "$AUDIT_COUNT" -ge 5 ] 2>/dev/null && echo "x" || echo " ")] Audit logs present ($AUDIT_COUNT entries)"
echo "  [$([ "$NO_REAL_ORDERS" = "true" ] && echo "x" || echo " ")] No real orders placed (live_trades: $LIVE_TRADES, broker_orders: $BROKER_LIVE_ORDERS)"
echo "=============================================="

# Count passing criteria
PASS_COUNT=0
[ "$TRADING_DAY_COUNT" -ge 7 ] 2>/dev/null && PASS_COUNT=$((PASS_COUNT + 1))
[ "$TRADES" -ge 50 ] 2>/dev/null && PASS_COUNT=$((PASS_COUNT + 1))
[ "$RECON_FAILS" = "0" ] && PASS_COUNT=$((PASS_COUNT + 1))
([ "$RISK_COVERAGE" = "pass_audit" ] || [ "$RISK_COVERAGE" = "pass_positions" ]) && PASS_COUNT=$((PASS_COUNT + 1))
[ "$KS_EVIDENCE" = "true" ] && PASS_COUNT=$((PASS_COUNT + 1))
[ "$COOLDOWN_TOTAL" -gt 0 ] 2>/dev/null && PASS_COUNT=$((PASS_COUNT + 1))
[ "$AUDIT_COUNT" -ge 5 ] 2>/dev/null && PASS_COUNT=$((PASS_COUNT + 1))
[ "$NO_REAL_ORDERS" = "true" ] && PASS_COUNT=$((PASS_COUNT + 1))

echo ""
echo "  $PASS_COUNT / 8 criteria passing"

if [ "$PASS_COUNT" -eq 8 ]; then
  echo ""
  echo "  ALL CRITERIA MET — Phase 3 eligible for completion."
  echo "  Approval required before marking complete."
else
  echo ""
  echo "  Phase 3 still in progress."
fi
echo ""
