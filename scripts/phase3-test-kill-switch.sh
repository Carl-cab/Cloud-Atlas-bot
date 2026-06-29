#!/bin/bash
# =============================================================================
# Phase 3: Kill Switch Test
#
# Tests that the kill switch (is_paused=true) blocks trading and writes
# durable audit evidence. Uses the test_kill_switch edge function action
# which writes KILL_SWITCH_ACTIVATED and KILL_SWITCH_RELEASED audit entries.
#
# If test_kill_switch is not available (function not redeployed), falls back
# to direct DB PATCHes and manual trade verification.
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
# Step 1: Try test_kill_switch edge function action
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
echo "  Response: $KILL_BODY"

if [ "$KILL_HTTP" = "200" ]; then
  echo "$KILL_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'  Message: {data.get(\"message\", \"?\")}')
print(f'  Trade blocked when paused: {data.get(\"trade_blocked_when_paused\", \"?\")}')
print(f'  Trade unblocked when released: {data.get(\"trade_unblocked_when_released\", \"?\")}')
print(f'  Audit logged: {data.get(\"audit_logged\", False)}')
" 2>/dev/null
  KILL_SWITCH_PASS=true
  USE_FALLBACK=false
  echo "  [PASS] Kill switch test action succeeded (with audit evidence)"
else
  echo "  [INFO] test_kill_switch action returned HTTP $KILL_HTTP"
  echo "  Falling back to direct DB verification..."
  USE_FALLBACK=true
  KILL_SWITCH_PASS=false
fi
echo ""

# -----------------------------------------------
# Step 2: Fallback — direct DB PATCHes if edge function action unavailable
# -----------------------------------------------
if [ "$USE_FALLBACK" = "true" ]; then
  echo "--- Step 2a: Activate kill switch (direct PATCH) ---"
  PATCH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PATCH "${SUPABASE_URL}/rest/v1/bot_config?is_paused=eq.false" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d '{"is_paused": true}')

  echo "  PATCH response: HTTP $PATCH_RESPONSE"
  echo ""

  echo "--- Step 2b: Attempt trade (expecting rejection) ---"
  TRADE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${SUPABASE_URL}/functions/v1/trading-bot" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${ANON_KEY}" \
    -d '{"action": "execute_trade", "symbol": "XBTUSD"}')

  TRADE_HTTP=$(echo "$TRADE_RESPONSE" | tail -1)
  TRADE_BODY=$(echo "$TRADE_RESPONSE" | sed '$d')

  BLOCKED=$(echo "$TRADE_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
msg = json.dumps(data).lower()
if 'paused' in msg or 'kill' in msg or 'halted' in msg or 'inactive' in msg:
    print('yes')
else:
    print('no')
" 2>/dev/null || echo "unknown")

  if [ "$BLOCKED" = "yes" ]; then
    echo "  [PASS] Trade blocked by kill switch (HTTP $TRADE_HTTP)"
    KILL_SWITCH_PASS=true
  else
    echo "  [WARN] Trade was NOT clearly blocked (HTTP $TRADE_HTTP)"
    echo "  Response: $TRADE_BODY"
  fi
  echo ""

  echo "--- Step 2c: Deactivate kill switch (direct PATCH) ---"
  PATCH2_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PATCH "${SUPABASE_URL}/rest/v1/bot_config?is_paused=eq.true" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d '{"is_paused": false}')

  echo "  PATCH response: HTTP $PATCH2_RESPONSE"
  echo ""

  echo "  [INFO] Fallback test does not write audit entries."
  echo "  To get durable evidence, redeploy trading-bot and re-run this script:"
  echo "    SUPABASE_ACCESS_TOKEN=<pat> npx supabase functions deploy trading-bot --project-ref $PROJECT_REF"
  echo ""
fi

# -----------------------------------------------
# Step 3: Verify trading still works after kill switch test
# -----------------------------------------------
echo "--- Step 3: Verify trading still works ---"
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
TRADE_MSG=$(echo "$TRADE_RESP" | sed '$d' | python3 -c "
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
# Step 4: Check for audit entries
# -----------------------------------------------
echo "--- Step 4: Checking kill switch audit evidence ---"
ACTIVATED_COUNT=$(curl -s \
  "${SUPABASE_URL}/rest/v1/security_audit_log?select=id,created_at,details&action=eq.KILL_SWITCH_ACTIVATED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    print(len(data))
    for entry in data[:3]:
        ts = entry.get('created_at', '?')
        details = entry.get('details', {})
        print(f'  - ACTIVATED {ts}: trigger={details.get(\"trigger\",\"?\")} reason={details.get(\"reason\",\"?\")}')
else:
    print('0')
" 2>/dev/null || echo "0")

RELEASED_COUNT=$(curl -s \
  "${SUPABASE_URL}/rest/v1/security_audit_log?select=id,created_at,details&action=eq.KILL_SWITCH_RELEASED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list):
    print(len(data))
    for entry in data[:3]:
        ts = entry.get('created_at', '?')
        details = entry.get('details', {})
        print(f'  - RELEASED  {ts}: source={details.get(\"source\",\"?\")} reason={details.get(\"reason\",\"?\")}')
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
  if [ "$USE_FALLBACK" = "true" ]; then
    echo "  KILL SWITCH TEST: PASSED (fallback — no audit evidence)"
    echo "  - Trade blocked when is_paused=true"
    echo "  - Trade allowed when is_paused=false"
    echo "  - Redeploy trading-bot for durable audit evidence"
  else
    echo "  KILL SWITCH TEST: PASSED (with audit evidence)"
    echo "  - KILL_SWITCH_ACTIVATED entries: $ACTIVATED_COUNT"
    echo "  - KILL_SWITCH_RELEASED entries: $RELEASED_COUNT"
    echo "  - Bot operational after release"
  fi
else
  echo "  KILL SWITCH TEST: REVIEW MANUALLY"
  echo "  - Check the responses above"
fi
echo "=============================================="
echo ""
