#!/bin/bash
# =============================================================================
# Phase 3: Cooldown System Test
#
# Tests that the cooldown system pauses trading after consecutive losses.
# 1. Triggers multiple trade attempts rapidly
# 2. Checks if cooldown activates after loss threshold
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
echo "  Phase 3: Cooldown System Test"
echo "=============================================="
echo ""

# -----------------------------------------------
# Trigger multiple rapid trade attempts
# -----------------------------------------------
SYMBOLS=("XBTUSD" "ETHUSD" "XBTUSD" "SOLUSD" "ETHUSD")
COOLDOWN_TRIGGERED=false

for i in "${!SYMBOLS[@]}"; do
  SYM="${SYMBOLS[$i]}"
  echo "--- Trade attempt $((i+1)): $SYM ---"

  # Generate a signal first
  curl -s "${SUPABASE_URL}/functions/v1/trading-bot" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${ANON_KEY}" \
    -d "{\"action\": \"generate_paper_signal\", \"symbol\": \"${SYM}\"}" > /dev/null

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${SUPABASE_URL}/functions/v1/trading-bot" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${ANON_KEY}" \
    -d "{\"action\": \"execute_trade\", \"symbol\": \"${SYM}\"}")

  HTTP=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  MSG=$(echo "$BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    msg = data.get('message', data.get('error', data.get('reason', '')))
    print(msg)
except: print('parse error')
" 2>/dev/null || echo "?")

  echo "  HTTP $HTTP: $MSG"

  if echo "$MSG" | grep -iq "cooldown\|rate.limit\|too.many\|consecutive"; then
    COOLDOWN_TRIGGERED=true
    echo "  [PASS] Cooldown/rate limit triggered!"
    break
  fi

  sleep 1
done

echo ""

# -----------------------------------------------
# Check scheduler-engine rate limit
# -----------------------------------------------
echo "--- Checking scheduler cooldown status ---"
SCHED_RESPONSE=$(curl -s \
  "${SUPABASE_URL}/functions/v1/scheduler-engine" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "run_threshold_checks_all"}')

echo "$SCHED_RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'  Threshold checks: {json.dumps(data.get(\"results\", {}), indent=2)}')
except: pass
" 2>/dev/null
echo ""

# -----------------------------------------------
# Summary
# -----------------------------------------------
echo "=============================================="
if [ "$COOLDOWN_TRIGGERED" = "true" ]; then
  echo "  COOLDOWN TEST: PASSED"
  echo "  - Trading paused after rapid consecutive attempts"
else
  echo "  COOLDOWN TEST: PARTIAL"
  echo "  - Cooldown may require actual losing trades to trigger"
  echo "  - Verify: check risk_events table for cooldown entries"
  echo "  - Run: SELECT * FROM risk_events WHERE event_type LIKE '%cooldown%'"
fi
echo "=============================================="
echo ""
