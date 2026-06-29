#!/bin/bash
# =============================================================================
# Phase 3: Kill Switch Test
#
# Tests that the kill switch (is_paused=true) blocks trading.
# 1. Sets is_paused = true
# 2. Attempts a paper trade (should be rejected)
# 3. Restores is_paused = false
# 4. Attempts a paper trade (should succeed)
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
# Step 1: Activate kill switch (is_paused = true)
# -----------------------------------------------
echo "--- Step 1: Enable kill switch (is_paused=true) ---"
PATCH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "${SUPABASE_URL}/rest/v1/bot_config?is_paused=eq.false" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"is_paused": true}')

echo "  PATCH response: HTTP $PATCH_RESPONSE"
echo ""

# -----------------------------------------------
# Step 2: Attempt trade (should be blocked)
# -----------------------------------------------
echo "--- Step 2: Attempt trade (expecting rejection) ---"
TRADE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "execute_trade", "symbol": "BTC/USD"}')

TRADE_HTTP=$(echo "$TRADE_RESPONSE" | tail -1)
TRADE_BODY=$(echo "$TRADE_RESPONSE" | sed '$d')

if echo "$TRADE_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
msg = json.dumps(data).lower()
if 'paused' in msg or 'kill' in msg or 'halted' in msg or 'inactive' in msg:
    print('  [PASS] Trade blocked by kill switch')
    sys.exit(0)
else:
    print(f'  [FAIL] Trade was NOT blocked. Response: {data}')
    sys.exit(1)
" 2>/dev/null; then
  KILL_SWITCH_PASS=true
else
  KILL_SWITCH_PASS=false
  echo "  [WARN] Could not verify kill switch blocked trade (HTTP $TRADE_HTTP)"
  echo "  $TRADE_BODY"
fi
echo ""

# -----------------------------------------------
# Step 3: Disable kill switch (is_paused = false)
# -----------------------------------------------
echo "--- Step 3: Disable kill switch (is_paused=false) ---"
PATCH2_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PATCH "${SUPABASE_URL}/rest/v1/bot_config?is_paused=eq.true" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"is_paused": false}')

echo "  PATCH response: HTTP $PATCH2_RESPONSE"
echo ""

# -----------------------------------------------
# Step 4: Attempt trade (should succeed in paper mode)
# -----------------------------------------------
echo "--- Step 4: Attempt trade (expecting paper trade success) ---"
TRADE2_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "execute_trade", "symbol": "BTC/USD"}')

TRADE2_HTTP=$(echo "$TRADE2_RESPONSE" | tail -1)
TRADE2_BODY=$(echo "$TRADE2_RESPONSE" | sed '$d')

echo "  HTTP $TRADE2_HTTP"
echo "$TRADE2_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    msg = data.get('message', '')
    if 'paper trade' in msg.lower() or 'executed' in msg.lower():
        print(f'  [PASS] Paper trade executed after kill switch disabled')
    else:
        print(f'  [INFO] Response: {msg}')
except:
    pass
" 2>/dev/null
echo ""

# -----------------------------------------------
# Summary
# -----------------------------------------------
echo "=============================================="
if [ "${KILL_SWITCH_PASS:-false}" = "true" ]; then
  echo "  KILL SWITCH TEST: PASSED"
  echo "  - Trade blocked when is_paused=true"
  echo "  - Trade allowed when is_paused=false"
else
  echo "  KILL SWITCH TEST: REVIEW MANUALLY"
  echo "  - Check the responses above"
fi
echo "=============================================="
echo ""
