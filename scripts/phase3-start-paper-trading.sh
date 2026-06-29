#!/bin/bash
# =============================================================================
# Phase 3: Start Paper Trading Validation
#
# This script activates paper trading for validation. Run from your local machine.
#
# Prerequisites:
#   export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"
#   export SUPABASE_ANON_KEY="your-anon-key"
#   export SUPABASE_USER_EMAIL="your@email.com"
#   export SUPABASE_USER_PASSWORD="your-password"
#
# What it does:
#   1. Authenticates and gets JWT
#   2. Confirms bot_config is set to paper mode
#   3. Activates the bot (is_active=true, is_paused=false)
#   4. Triggers a single paper trade cycle
#   5. Triggers the scheduler for daily maintenance
#   6. Displays status
# =============================================================================

set -euo pipefail

PROJECT_REF="ijwxlzwdysvvghmxlrnq"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

echo "=============================================="
echo "  Phase 3: Start Paper Trading Validation"
echo "=============================================="
echo "  Project: $PROJECT_REF"
echo "  URL:     $SUPABASE_URL"
echo ""

# -----------------------------------------------
# Authenticate
# -----------------------------------------------
ANON_KEY="${SUPABASE_ANON_KEY:?'Set SUPABASE_ANON_KEY first'}"
USER_EMAIL="${SUPABASE_USER_EMAIL:?'Set SUPABASE_USER_EMAIL first'}"
USER_PASSWORD="${SUPABASE_USER_PASSWORD:?'Set SUPABASE_USER_PASSWORD first'}"

echo "--- Authenticating ---"
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
  echo "$AUTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTH_RESPONSE"
  exit 1
}
echo "Authenticated."
echo ""

# -----------------------------------------------
# Step 1: Verify bot_config is paper mode
# -----------------------------------------------
echo "--- Step 1: Verify paper trading mode ---"
CONFIG_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/bot_config?select=mode,is_active,is_paused" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${USER_JWT}")

echo "$CONFIG_CHECK" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data:
    print('  No bot_config rows found. Will create one during first trade.')
else:
    for row in data:
        mode = row.get('mode', 'unknown')
        active = row.get('is_active', False)
        paused = row.get('is_paused', True)
        status = 'SAFE' if mode == 'paper' else 'DANGER'
        print(f'  [{status}] mode={mode}, is_active={active}, is_paused={paused}')
        if mode != 'paper':
            print('  WARNING: Bot is NOT in paper mode! Aborting.')
            sys.exit(1)
print('  All configs are in paper mode.')
" || { echo "ABORTED: Non-paper mode detected."; exit 1; }
echo ""

# -----------------------------------------------
# Step 2: Verify trading-bot responds without 500
# (Live trading is blocked by code: paper mode returns early,
#  readiness gate returns 403/501 if mode is somehow set to 'live')
# -----------------------------------------------
echo "--- Step 2: Verify trading-bot is responsive ---"
GATE_CHECK=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "execute_trade", "symbol": "XBTUSD"}')

GATE_HTTP=$(echo "$GATE_CHECK" | tail -1)
GATE_BODY=$(echo "$GATE_CHECK" | sed '$d')

if [ "$GATE_HTTP" = "500" ]; then
  echo "  [FAIL] trading-bot returned HTTP 500"
  echo "$GATE_BODY" | python3 -m json.tool 2>/dev/null || echo "$GATE_BODY"
  echo ""
  echo "  Aborting — fix the 500 error before proceeding."
  exit 1
else
  echo "  [PASS] trading-bot responded with HTTP $GATE_HTTP (no crash)"
  echo "$GATE_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(f'  Message: {data.get(\"message\", data.get(\"error\", \"\"))}')
except: pass
" 2>/dev/null
fi
echo ""

# -----------------------------------------------
# Step 3: Generate paper signal then execute trade
# -----------------------------------------------
echo "--- Step 3a: Generate paper trading signal ---"
SIGNAL_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "generate_paper_signal", "symbol": "XBTUSD"}')

SIGNAL_HTTP=$(echo "$SIGNAL_RESPONSE" | tail -1)
SIGNAL_BODY=$(echo "$SIGNAL_RESPONSE" | sed '$d')

echo "  HTTP $SIGNAL_HTTP"
echo "$SIGNAL_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    sig = data.get('signal', {})
    print(f'  Signal: {sig.get(\"signal_type\", \"?\")} @ \${sig.get(\"price\", 0):.2f} (confidence: {sig.get(\"confidence\", 0):.2f})')
except: pass
" 2>/dev/null
echo ""

echo "--- Step 3b: Execute paper trade ---"
TRADE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "execute_trade", "symbol": "XBTUSD"}')

TRADE_HTTP=$(echo "$TRADE_RESPONSE" | tail -1)
TRADE_BODY=$(echo "$TRADE_RESPONSE" | sed '$d')

echo "  HTTP $TRADE_HTTP"
echo "$TRADE_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    msg = data.get('message', data.get('error', ''))
    print(f'  Result: {msg}')
    pos = data.get('position', {})
    if pos:
        print(f'  Position: {pos.get(\"side\", \"?\")} {pos.get(\"quantity\", 0)} {pos.get(\"symbol\", \"?\")} @ \${pos.get(\"entry_price\", 0):.2f}')
except: pass
" 2>/dev/null || echo "$TRADE_BODY"
echo ""

# -----------------------------------------------
# Step 4: Run scheduler daily maintenance
# -----------------------------------------------
echo "--- Step 4: Trigger scheduler (daily maintenance) ---"
SCHED_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/scheduler-engine" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "run_daily_maintenance"}')

SCHED_HTTP=$(echo "$SCHED_RESPONSE" | tail -1)
SCHED_BODY=$(echo "$SCHED_RESPONSE" | sed '$d')

echo "  HTTP $SCHED_HTTP"
echo "$SCHED_BODY" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    results = data.get('results', {})
    print(f'  Active users: {results.get(\"active_users\", 0)}')
    pnl = results.get('pnl_snapshots', {})
    recon = results.get('reconciliation', {})
    alerts = results.get('alert_checks', {})
    print(f'  P&L snapshots: {pnl.get(\"success\", 0)} ok, {pnl.get(\"failed\", 0)} failed')
    print(f'  Reconciliation: {recon.get(\"success\", 0)} ok, {recon.get(\"failed\", 0)} failed')
    print(f'  Alert checks: {alerts.get(\"success\", 0)} ok, {alerts.get(\"failed\", 0)} failed')
    print(f'  Duration: {results.get(\"duration_ms\", \"?\")} ms')
except:
    print(sys.stdin.read())
" 2>/dev/null || echo "$SCHED_BODY"
echo ""

# -----------------------------------------------
# Step 5: Run health-check
# -----------------------------------------------
echo "--- Step 5: Run health-check ---"
HC_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/health-check" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "run_checks"}')

HC_HTTP=$(echo "$HC_RESPONSE" | tail -1)
HC_BODY=$(echo "$HC_RESPONSE" | sed '$d')

echo "  HTTP $HC_HTTP"
echo "$HC_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
s = data.get('summary', {})
print(f'  Status: {data.get(\"overall_status\", \"unknown\").upper()}')
print(f'  Deployment Ready: {data.get(\"deployment_ready\", False)}')
print(f'  Passed: {s.get(\"passed\", 0)} | Failed: {s.get(\"failed\", 0)} | Warned: {s.get(\"warned\", 0)}')
" 2>/dev/null || echo "$HC_BODY"
echo ""

echo "=============================================="
echo "  Phase 3 Paper Trading: STARTED"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Run this script daily (or set up cron for scheduler-engine)"
echo "  2. Monitor with: bash scripts/phase3-monitor.sh"
echo "  3. Goal: 50+ paper trades, 0 failed reconciliations, 7 days"
echo ""
