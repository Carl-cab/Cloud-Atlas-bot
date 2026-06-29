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
TRADES=$(curl -s "${SUPABASE_URL}/rest/v1/trading_positions?select=id&status=neq.deleted" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Prefer: count=exact" \
  -I 2>/dev/null | grep -i content-range | grep -oP '\d+$' || echo "0")

# Fallback: count from response body
if [ "$TRADES" = "0" ] || [ -z "$TRADES" ]; then
  TRADES_DATA=$(curl -s "${SUPABASE_URL}/rest/v1/trading_positions?select=id" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${USER_JWT}")
  TRADES=$(echo "$TRADES_DATA" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data) if isinstance(data, list) else 0)
" 2>/dev/null || echo "0")
fi

TARGET_TRADES=50
if [ "$TRADES" -ge "$TARGET_TRADES" ] 2>/dev/null; then
  echo "  [PASS] $TRADES / $TARGET_TRADES paper trades"
else
  echo "  [    ] $TRADES / $TARGET_TRADES paper trades"
fi
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
# 5. P&L snapshots
# -----------------------------------------------
echo "--- 5. P&L Snapshots ---"
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
# 6. Bot config status
# -----------------------------------------------
echo "--- 6. Bot Config ---"
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
# 7. Kill switch test
# -----------------------------------------------
echo "--- 7. Kill Switch ---"
echo "  To test: temporarily set is_paused=true in bot_config, trigger a trade, verify rejection."
echo "  (Run phase3-test-kill-switch.sh when ready)"
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
echo "  [ ] Kill switch tested"
echo "  [ ] Cooldown tested"
echo "  [ ] Audit logs complete"
echo "  [ ] No real orders placed"
echo "=============================================="
echo ""
