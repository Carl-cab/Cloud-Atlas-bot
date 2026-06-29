#!/bin/bash
# =============================================================================
# Phase 3: Paper Trading Monitor
#
# Checks current paper trading progress against Phase 3 pass criteria.
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
# Count executed_trades (this is what the readiness gate checks)
TRADES_DATA=$(curl -s "${SUPABASE_URL}/rest/v1/executed_trades?select=id" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")
TRADES=$(echo "$TRADES_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

# Also count trading_positions for comparison
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
# 3. Risk checks (verify risk events exist)
# -----------------------------------------------
echo "--- 3. Risk Events ---"
RISK_EVENTS=$(curl -s "${SUPABASE_URL}/rest/v1/risk_events?select=id&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "  Recent risk events: $RISK_EVENTS"
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

if [ "$COOLDOWN_COUNT" != "0" ] && [ -n "$COOLDOWN_COUNT" ]; then
  echo "  [PASS] COOLDOWN_ENGAGED audit entries: $COOLDOWN_COUNT"
elif [ "$RISK_COOLDOWN_COUNT" != "0" ] && [ -n "$RISK_COOLDOWN_COUNT" ]; then
  echo "  [PASS] Cooldown verified via risk_cooldowns table: $RISK_COOLDOWN_COUNT entries"
  echo "  (audit log query returned 0 — may be RLS-restricted for user JWT reads)"
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
curl -s "${SUPABASE_URL}/rest/v1/bot_config?select=mode,is_active,is_paused" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data: print('  No config found')
for row in data:
    mode = row.get('mode', '?')
    active = row.get('is_active', False)
    paused = row.get('is_paused', True)
    safe = '✓' if mode == 'paper' else '✗'
    print(f'  {safe} mode={mode} active={active} paused={paused}')
" 2>/dev/null
echo ""

# -----------------------------------------------
# 8. Kill switch verification
# -----------------------------------------------
echo "--- 8. Kill Switch ---"
KILL_SWITCH_RAW=$(curl -s "${SUPABASE_URL}/rest/v1/security_audit_log?select=id,action,created_at,details&action=eq.KILL_SWITCH_ACTIVATED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

KILL_SWITCH_AUDIT=$(echo "$KILL_SWITCH_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")

echo "$KILL_SWITCH_RAW" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    for entry in data[:3]:
        ts = entry.get('created_at', '?')
        details = entry.get('details', {})
        trigger = details.get('trigger', '?')
        reason = details.get('reason', '?')
        print(f'  - {ts}: trigger={trigger} reason={reason}')
" 2>/dev/null

KILL_SWITCH_STATUS=$(curl -s "${SUPABASE_URL}/rest/v1/bot_config?select=is_paused,paused_reason" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not isinstance(data, list) or not data:
    print('unknown')
else:
    row = data[0]
    paused = row.get('is_paused', False)
    reason = row.get('paused_reason', '')
    if paused:
        print(f'PAUSED (reason: {reason})')
    else:
        print('ACTIVE (is_paused=false)')
" 2>/dev/null || echo "unknown")

if [ "$KILL_SWITCH_AUDIT" != "0" ] && [ -n "$KILL_SWITCH_AUDIT" ]; then
  echo "  [PASS] KILL_SWITCH_ACTIVATED audit entries: $KILL_SWITCH_AUDIT"
else
  echo "  [    ] No KILL_SWITCH_ACTIVATED audit entries (0)"
  echo "  Note: The kill switch test uses direct DB updates, not the audit path."
  echo "  Run: bash scripts/phase3-test-kill-switch.sh"
fi
echo "  Current status: $KILL_SWITCH_STATUS"
echo ""

# -----------------------------------------------
# Summary
# -----------------------------------------------
echo "=============================================="
echo "  Phase 3 Pass Criteria"
echo "=============================================="
echo "  [ ] 7 days paper trading"
echo "  [$([ "$TRADES" -ge 50 ] 2>/dev/null && echo "x" || echo " ")] 50+ paper trades ($TRADES)"
echo "  [$([ "$RECON_FAILS" = "0" ] && echo "x" || echo " ")] 0 failed reconciliations ($RECON_FAILS)"
echo "  [ ] Risk checks on every trade"
echo "  [$([ "$KILL_SWITCH_AUDIT" != "0" ] && [ -n "$KILL_SWITCH_AUDIT" ] && echo "x" || echo " ")] Kill switch (audit: $KILL_SWITCH_AUDIT, status: $KILL_SWITCH_STATUS)"
COOLDOWN_TOTAL=$((COOLDOWN_COUNT + RISK_COOLDOWN_COUNT))
echo "  [$([ "$COOLDOWN_TOTAL" -gt 0 ] 2>/dev/null && echo "x" || echo " ")] Cooldown tested (audit: $COOLDOWN_COUNT, risk_cooldowns: $RISK_COOLDOWN_COUNT)"
echo "  [$([ "$AUDIT_COUNT" -ge 5 ] 2>/dev/null && echo "x" || echo " ")] Audit logs complete ($AUDIT_COUNT entries)"
echo "  [ ] No real orders placed"
echo "=============================================="
echo ""
