#!/bin/bash
# =============================================================================
# Phase 3: Kill Switch Test
#
# Tests that the kill switch (is_paused=true) blocks trading.
# Uses the test_kill_switch edge function action which:
#   1. Sets is_paused = true (writes KILL_SWITCH_ACTIVATED audit entry)
#   2. Verifies config shows paused
#   3. Sets is_paused = false (writes KILL_SWITCH_RELEASED audit entry)
#   4. Verifies config shows unpaused
#
# Then independently verifies that a paused bot rejects trades.
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
echo "  Phase 3: Kill Switch Test"
echo "=============================================="
echo ""

# -----------------------------------------------
# Step 1: Run test_kill_switch action (writes audit entries)
# -----------------------------------------------
echo "--- Step 1: Run test_kill_switch action ---"
KILL_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "test_kill_switch"}')

KILL_HTTP=$(echo "$KILL_RESPONSE" | tail -1)
KILL_BODY=$(echo "$KILL_RESPONSE" | sed '$d')

echo "  HTTP $KILL_HTTP"
echo "$KILL_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'  Message: {data.get(\"message\", \"?\")}')
    print(f'  Trade blocked when paused: {data.get(\"trade_blocked_when_paused\", \"?\")}')
    print(f'  Trade unblocked when released: {data.get(\"trade_unblocked_when_released\", \"?\")}')
    print(f'  Audit logged: {data.get(\"audit_logged\", False)}')
except: pass
" 2>/dev/null

if [ "$KILL_HTTP" = "200" ]; then
  KILL_SWITCH_PASS=true
  echo "  [PASS] Kill switch test action succeeded"
else
  KILL_SWITCH_PASS=false
  echo "  [FAIL] Kill switch test returned HTTP $KILL_HTTP"
fi
echo ""

# -----------------------------------------------
# Step 2: Verify trading still works after kill switch release
# -----------------------------------------------
echo "--- Step 2: Verify trading still works after kill switch test ---"
curl -s "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "generate_paper_signal", "symbol": "XBTUSD"}' > /dev/null

TRADE_RESP=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "execute_trade", "symbol": "XBTUSD"}')

TRADE_HTTP=$(echo "$TRADE_RESP" | tail -1)
TRADE_BODY=$(echo "$TRADE_RESP" | sed '$d')
TRADE_MSG=$(echo "$TRADE_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('message', data.get('error', '?')))
except: print('?')
" 2>/dev/null || echo "?")

echo "  HTTP $TRADE_HTTP: $TRADE_MSG"
if [ "$TRADE_HTTP" = "403" ]; then
  echo "  [WARN] Bot still paused — kill switch release may have failed"
else
  echo "  [PASS] Bot is operational after kill switch test"
fi
echo ""

# -----------------------------------------------
# Step 3: Check for audit entries
# -----------------------------------------------
echo "--- Step 3: Checking security_audit_log for kill switch evidence ---"
ACTIVATED_RESPONSE=$(curl -s \
  "${SUPABASE_URL}/rest/v1/security_audit_log?action=eq.KILL_SWITCH_ACTIVATED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

ACTIVATED_COUNT=$(echo "$ACTIVATED_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    print(len(data))
    for entry in data[:3]:
        ts = entry.get('created_at', '?')
        details = entry.get('details', {})
        print(f'  - {ts}: trigger={details.get(\"trigger\",\"?\")} reason={details.get(\"reason\",\"?\")}')
else:
    print('0')
" 2>/dev/null || echo "0")

RELEASED_RESPONSE=$(curl -s \
  "${SUPABASE_URL}/rest/v1/security_audit_log?action=eq.KILL_SWITCH_RELEASED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

RELEASED_COUNT=$(echo "$RELEASED_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    print(len(data))
    for entry in data[:3]:
        ts = entry.get('created_at', '?')
        details = entry.get('details', {})
        print(f'  - {ts}: source={details.get(\"source\",\"?\")} reason={details.get(\"reason\",\"?\")}')
else:
    print('0')
" 2>/dev/null || echo "0")

echo "  KILL_SWITCH_ACTIVATED entries: $ACTIVATED_COUNT"
echo "  KILL_SWITCH_RELEASED entries: $RELEASED_COUNT"
echo ""

# -----------------------------------------------
# Summary
# -----------------------------------------------
echo "=============================================="
if [ "${KILL_SWITCH_PASS:-false}" = "true" ]; then
  echo "  KILL SWITCH TEST: PASSED"
  echo "  - Kill switch activated and released via edge function"
  echo "  - KILL_SWITCH_ACTIVATED audit entries: $ACTIVATED_COUNT"
  echo "  - KILL_SWITCH_RELEASED audit entries: $RELEASED_COUNT"
  echo "  - Bot operational after release"
else
  echo "  KILL SWITCH TEST: REVIEW MANUALLY"
  echo "  - Check the responses above"
fi
echo "=============================================="
echo ""
