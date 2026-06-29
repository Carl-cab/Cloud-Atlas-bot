#!/bin/bash
# =============================================================================
# Phase 3: Batch Paper Trade Execution
#
# Generates and executes multiple paper trades in sequence to accelerate
# toward the 50-trade Phase 3 target. Each trade uses real market data
# from Kraken's public ticker API via generate_paper_signal.
#
# Usage:
#   bash scripts/phase3-batch-paper-trades.sh [count]
#   Default: 10 trades per run
#
# Prerequisites:
#   export SUPABASE_ANON_KEY="your-anon-key"
#   export SUPABASE_USER_EMAIL="your@email.com"
#   export SUPABASE_USER_PASSWORD="your-password"
#
# Safety:
#   - Only executes in paper mode (verified before each batch)
#   - Aborts if bot_config.mode != 'paper'
#   - Respects risk management (trades may be rejected)
#   - Respects kill switch and cooldown pauses
# =============================================================================

set -euo pipefail

TRADE_COUNT="${1:-10}"
PROJECT_REF="ijwxlzwdysvvghmxlrnq"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
SYMBOLS=("XBTUSD" "ETHUSD" "SOLUSD" "XRPUSD" "ADAUSD")

ANON_KEY="${SUPABASE_ANON_KEY:?'Set SUPABASE_ANON_KEY first'}"
USER_EMAIL="${SUPABASE_USER_EMAIL:?'Set SUPABASE_USER_EMAIL first'}"
USER_PASSWORD="${SUPABASE_USER_PASSWORD:?'Set SUPABASE_USER_PASSWORD first'}"

echo "=============================================="
echo "  Phase 3: Batch Paper Trade Execution"
echo "  Target: $TRADE_COUNT trades"
echo "=============================================="
echo ""

# --- Authenticate ---
AUTH_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}")

USER_JWT=$(echo "$AUTH_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
token = data.get('access_token', '')
if token: print(token)
else: sys.exit(1)
" 2>/dev/null) || {
  echo "ERROR: Authentication failed."
  exit 1
}
echo "Authenticated."
echo ""

# --- Verify paper mode ---
CONFIG_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/bot_config?select=mode,is_active,is_paused" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

echo "$CONFIG_CHECK" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data:
    print('  No bot_config yet (will be created on first trade).')
    sys.exit(0)
for row in data:
    if row.get('mode') != 'paper':
        print('  ABORT: Bot is NOT in paper mode!')
        sys.exit(1)
print('  Confirmed: paper mode.')
" || { echo "ABORTED: Safety check failed."; exit 1; }
echo ""

# --- Execute batch trades ---
EXECUTED=0
REJECTED=0
ERRORS=0

for i in $(seq 1 "$TRADE_COUNT"); do
  # Rotate through symbols
  SYM_INDEX=$(( (i - 1) % ${#SYMBOLS[@]} ))
  SYM="${SYMBOLS[$SYM_INDEX]}"

  echo -n "  Trade $i/$TRADE_COUNT ($SYM): "

  # Generate signal
  SIG_RESP=$(curl -s \
    "${SUPABASE_URL}/functions/v1/trading-bot" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${ANON_KEY}" \
    -d "{\"action\": \"generate_paper_signal\", \"symbol\": \"${SYM}\"}")

  # Execute trade
  TRADE_RESP=$(curl -s -w "\n%{http_code}" \
    "${SUPABASE_URL}/functions/v1/trading-bot" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${ANON_KEY}" \
    -d "{\"action\": \"execute_trade\", \"symbol\": \"${SYM}\"}")

  HTTP=$(echo "$TRADE_RESP" | tail -1)
  BODY=$(echo "$TRADE_RESP" | sed '$d')

  MSG=$(echo "$BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    msg = data.get('message', data.get('error', 'unknown'))
    reason = data.get('reason', '')
    if reason:
        print(f'{msg} | reason: {reason}')
    else:
        print(msg)
except: print('parse error')
" 2>/dev/null || echo "?")

  if [ "$HTTP" = "200" ]; then
    if echo "$MSG" | grep -iq "executed\|paper.*trade\|success"; then
      EXECUTED=$((EXECUTED + 1))
      echo "EXECUTED ($MSG)"
    elif echo "$MSG" | grep -iq "reject\|paused\|cooldown\|limit"; then
      REJECTED=$((REJECTED + 1))
      echo "REJECTED ($MSG)"
    else
      EXECUTED=$((EXECUTED + 1))
      echo "OK ($MSG)"
    fi
  elif [ "$HTTP" = "500" ]; then
    ERRORS=$((ERRORS + 1))
    echo "ERROR ($MSG)"
  else
    REJECTED=$((REJECTED + 1))
    echo "HTTP $HTTP ($MSG)"
  fi

  # Brief pause between trades to avoid overwhelming the function
  sleep 2
done

echo ""
echo "=============================================="
echo "  Batch Complete"
echo "  Executed: $EXECUTED"
echo "  Rejected: $REJECTED"
echo "  Errors:   $ERRORS"
echo "=============================================="
echo ""
echo "Run 'bash scripts/phase3-monitor.sh' to check cumulative progress."
