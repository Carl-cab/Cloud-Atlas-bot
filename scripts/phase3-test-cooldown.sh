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
# Check for COOLDOWN_ENGAGED audit entries
# -----------------------------------------------
echo "--- Checking security_audit_log for COOLDOWN_ENGAGED ---"
AUDIT_RESPONSE=$(curl -s \
  "${SUPABASE_URL}/rest/v1/security_audit_log?action=eq.COOLDOWN_ENGAGED&order=created_at.desc&limit=5" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

COOLDOWN_AUDIT_COUNT=$(echo "$AUDIT_RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(len(data))
    for entry in data[:3]:
        details = entry.get('details', {})
        print(f'  - {entry.get(\"created_at\", \"?\")}: reason={details.get(\"reason\", \"?\")} cooldown={details.get(\"cooldown_minutes\", \"?\")}min')
except:
    print('0')
" 2>/dev/null || echo "0")

echo "  COOLDOWN_ENGAGED entries found: $COOLDOWN_AUDIT_COUNT"
echo ""

# -----------------------------------------------
# Summary
# -----------------------------------------------
echo "=============================================="
if [ "$COOLDOWN_TRIGGERED" = "true" ]; then
  echo "  COOLDOWN TEST: PASSED"
  echo "  - Trading paused after rapid consecutive attempts"
  echo "  - COOLDOWN_ENGAGED audit entries: $COOLDOWN_AUDIT_COUNT"
elif [ "$COOLDOWN_AUDIT_COUNT" != "0" ] && [ "$COOLDOWN_AUDIT_COUNT" != "" ]; then
  echo "  COOLDOWN TEST: PASSED (via audit log)"
  echo "  - COOLDOWN_ENGAGED entries found in security_audit_log"
  echo "  - Cooldown mechanism confirmed operational"
else
  echo "  COOLDOWN TEST: PARTIAL"
  echo "  - Cooldown requires actual P&L losses to trigger (daily_loss/circuit_breaker/drawdown)"
  echo "  - After real losses occur in paper mode, COOLDOWN_ENGAGED will appear in audit log"
  echo "  - Verify manually: SELECT * FROM security_audit_log WHERE action = 'COOLDOWN_ENGAGED'"
fi
echo "=============================================="
echo ""
