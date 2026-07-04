#!/bin/bash
# =============================================================================
# Strategy Engine Paper Experiment — STAGING smoke tests
#
# Exercises the USE_STRATEGY_ENGINE paper wiring end-to-end against a SEPARATE
# staging project and verifies it behaves safely. Production project
# ijwxlzwdysvvghmxlrnq must never be a target.
#
# The FIRST thing this script does is refuse to run if the target ref is the
# production ref.
#
# What it verifies:
#   1. Staging bot is in PAPER mode (aborts otherwise)
#   2. analyze_market runs the strategy pipeline (strategy_results row written)
#   3. A STRATEGY_PIPELINE_EXECUTED audit entry is written
#   4. execute_trade produces a PAPER outcome (simulated order / no real order)
#   5. No live-trading side effects (mode stays paper throughout)
#
# It does NOT set mode=live anywhere. The live-mode hard guard
# (seMode !== 'paper' skips the block) is covered by code review + unit tests,
# because enabling live mode is globally forbidden — even in staging.
#
# Prerequisites (see STAGING_SETUP.md):
#   export STAGING_PROJECT_REF="your-staging-ref"   # NOT the production ref
#   export SUPABASE_ANON_KEY="staging-anon-key"
#   export SUPABASE_USER_EMAIL="staging-test@user"
#   export SUPABASE_USER_PASSWORD="..."
#   export SMOKE_SYMBOL="XBTUSD"                     # optional, default XBTUSD
# =============================================================================

set -euo pipefail

# --- Hard production guard (first) -------------------------------------------
PROD_REF="ijwxlzwdysvvghmxlrnq"
STAGING_PROJECT_REF="${STAGING_PROJECT_REF:?'Set STAGING_PROJECT_REF (staging, NOT production)'}"
if [ "$STAGING_PROJECT_REF" = "$PROD_REF" ]; then
  echo "REFUSING: STAGING_PROJECT_REF equals the production ref ($PROD_REF)."
  echo "Smoke tests run ONLY against staging. Production must remain pristine."
  exit 1
fi

SUPABASE_URL="https://${STAGING_PROJECT_REF}.supabase.co"
ANON_KEY="${SUPABASE_ANON_KEY:?'Set SUPABASE_ANON_KEY first'}"
USER_EMAIL="${SUPABASE_USER_EMAIL:?'Set SUPABASE_USER_EMAIL first'}"
USER_PASSWORD="${SUPABASE_USER_PASSWORD:?'Set SUPABASE_USER_PASSWORD first'}"
SYMBOL="${SMOKE_SYMBOL:-XBTUSD}"

PASS=0
FAIL=0
note_pass() { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
note_fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "=============================================="
echo "  Strategy Engine Paper Smoke Tests (STAGING)"
echo "=============================================="
echo "  Target: $STAGING_PROJECT_REF  (production untouched)"
echo "  Symbol: $SYMBOL"
echo ""

# --- Authenticate ------------------------------------------------------------
AUTH_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}")
USER_JWT=$(echo "$AUTH_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
if [ -z "$USER_JWT" ]; then
  echo "ERROR: Authentication against staging failed."
  echo "$AUTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTH_RESPONSE"
  exit 1
fi
echo "Authenticated against staging."
echo ""

# --- Precheck: staging must be in paper mode ---------------------------------
echo "--- Precheck: staging bot_config mode ---"
CONFIG=$(curl -s "${SUPABASE_URL}/rest/v1/bot_config?select=mode,is_active,is_paused" \
  -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}")
MODE=$(echo "$CONFIG" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d[0].get('mode','none') if isinstance(d,list) and d else 'none')
" 2>/dev/null || echo "error")
echo "  mode=$MODE"
if [ "$MODE" = "live" ]; then
  echo "  ABORT: staging is in LIVE mode. This experiment is paper-only. Fix staging config."
  exit 1
fi
if [ "$MODE" != "paper" ]; then
  echo "  NOTE: no paper bot_config yet — analyze_market/execute_trade will auto-create one (paper)."
fi
echo ""

# --- Capture baseline counts -------------------------------------------------
count_rows() {
  # $1 = full REST query after /rest/v1/
  curl -s "${SUPABASE_URL}/rest/v1/$1" \
    -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${USER_JWT}" \
    -H "Prefer: count=exact" -H "Range: 0-0" -D - -o /dev/null 2>/dev/null \
    | grep -i "content-range" | sed -n 's/.*\///p' | tr -d '\r' || echo "0"
}

BEFORE_RESULTS=$(count_rows "strategy_results?strategy_id=eq.volatility-expansion&select=id")
BEFORE_AUDIT=$(count_rows "security_audit_log?action=eq.STRATEGY_PIPELINE_EXECUTED&select=id")
echo "  Baseline: strategy_results=${BEFORE_RESULTS:-0}  pipeline_audit=${BEFORE_AUDIT:-0}"
echo ""

# --- Test 1: analyze_market runs the pipeline --------------------------------
echo "--- Test 1: analyze_market triggers the strategy pipeline ---"
AM=$(curl -s -w "\n%{http_code}" "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" -H "Content-Type: application/json" -H "apikey: ${ANON_KEY}" \
  -d "{\"action\":\"analyze_market\",\"symbol\":\"${SYMBOL}\"}")
AM_HTTP=$(echo "$AM" | tail -1)
echo "  analyze_market HTTP $AM_HTTP"
if [ "$AM_HTTP" != "200" ]; then
  echo "  Response: $(echo "$AM" | sed '\$d')"
  note_fail "analyze_market did not return 200 (check staging Kraken keys / USE_STRATEGY_ENGINE)"
else
  note_pass "analyze_market returned 200"
fi

sleep 2
AFTER_RESULTS=$(count_rows "strategy_results?strategy_id=eq.volatility-expansion&select=id")
if [ "${AFTER_RESULTS:-0}" -gt "${BEFORE_RESULTS:-0}" ]; then
  note_pass "strategy_results grew (${BEFORE_RESULTS:-0} -> ${AFTER_RESULTS:-0}) — pipeline ran"
else
  note_fail "strategy_results did not grow — is USE_STRATEGY_ENGINE=true in staging?"
fi
echo ""

# --- Test 2: pipeline audit trail --------------------------------------------
echo "--- Test 2: STRATEGY_PIPELINE_EXECUTED audit written ---"
AFTER_AUDIT=$(count_rows "security_audit_log?action=eq.STRATEGY_PIPELINE_EXECUTED&select=id")
if [ "${AFTER_AUDIT:-0}" -gt "${BEFORE_AUDIT:-0}" ]; then
  note_pass "pipeline audit grew (${BEFORE_AUDIT:-0} -> ${AFTER_AUDIT:-0})"
else
  note_fail "no new STRATEGY_PIPELINE_EXECUTED audit entry"
fi
echo ""

# --- Test 3: execute_trade is paper-only -------------------------------------
echo "--- Test 3: execute_trade produces a PAPER outcome ---"
ET=$(curl -s -w "\n%{http_code}" "${SUPABASE_URL}/functions/v1/trading-bot" \
  -H "Authorization: Bearer ${USER_JWT}" -H "Content-Type: application/json" -H "apikey: ${ANON_KEY}" \
  -d "{\"action\":\"execute_trade\",\"symbol\":\"${SYMBOL}\"}")
ET_HTTP=$(echo "$ET" | tail -1)
ET_BODY=$(echo "$ET" | sed '$d')
echo "  execute_trade HTTP $ET_HTTP"
echo "  $(echo "$ET_BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('message',d.get('error','?')))" 2>/dev/null || echo "$ET_BODY")"
if [ "$ET_HTTP" = "200" ]; then
  note_pass "execute_trade returned 200 (paper: opened a simulated position or 'no actionable signal')"
else
  note_fail "execute_trade returned HTTP $ET_HTTP"
fi

# Confirm any order was SIMULATED, never a live order
SIM_ORDERS=$(count_rows "security_audit_log?action=eq.ORDER_SIMULATED&select=id")
LIVE_ORDERS=$(count_rows "security_audit_log?action=eq.ORDER_PLACED&select=id")
echo "  ORDER_SIMULATED audit total: ${SIM_ORDERS:-0}   ORDER_PLACED (live) total: ${LIVE_ORDERS:-0}"
if [ "${LIVE_ORDERS:-0}" -eq 0 ]; then
  note_pass "no live orders recorded (ORDER_PLACED=0) — paper isolation holds"
else
  note_fail "ORDER_PLACED > 0 in staging — investigate immediately"
fi
echo ""

# --- Summary -----------------------------------------------------------------
echo "=============================================="
echo "  SMOKE TEST SUMMARY: ${PASS} passed, ${FAIL} failed"
echo "=============================================="
if [ "$FAIL" -eq 0 ]; then
  echo "  RESULT: PASS — staging paper wiring behaves correctly."
  echo "  The live-mode hard guard is covered by code review + unit tests"
  echo "  (this script never sets mode=live)."
  echo ""
  echo "  This does NOT authorize production. Production enablement of"
  echo "  USE_STRATEGY_ENGINE remains gated on Phase 3 completion + owner sign-off"
  echo "  (see RELEASE_CHECKLIST.md)."
  exit 0
else
  echo "  RESULT: FAIL — do not proceed. See failures above."
  exit 1
fi
