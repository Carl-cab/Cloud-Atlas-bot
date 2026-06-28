#!/bin/bash
# =============================================================================
# Cloud Atlas Bot — Production Health Check Runner
#
# Invokes the health-check edge function against the live Supabase instance.
# Requires a valid user JWT token.
#
# Usage:
#   1. Set environment variables (or pass as args):
#      export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
#      export USER_JWT="your-jwt-token-here"
#
#   2. Run:
#      bash scripts/run-health-check.sh
#
# To get a JWT token:
#   - Sign in via the dashboard and extract the token from the session
#   - Or use: curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
#       -H "apikey: $SUPABASE_ANON_KEY" \
#       -H "Content-Type: application/json" \
#       -d '{"email":"your@email.com","password":"your-password"}'
# =============================================================================

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:?'SUPABASE_URL is required'}"
USER_JWT="${USER_JWT:?'USER_JWT is required (Bearer token for authenticated user)'}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"

echo "=== Cloud Atlas Bot — Health Check ==="
echo "Target: $SUPABASE_URL"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/health-check" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  ${SUPABASE_ANON_KEY:+-H "apikey: ${SUPABASE_ANON_KEY}"} \
  -d '{"action": "run_checks"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "401" ]; then
  echo "ERROR: Authentication failed. Check your JWT token."
  exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Health check returned HTTP $HTTP_CODE"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

# Parse and display results
echo "$BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
s = data.get('summary', {})
print(f\"Overall Status: {data.get('overall_status', 'unknown').upper()}\")
print(f\"Deployment Ready: {data.get('deployment_ready', False)}\")
print(f\"Total: {s.get('total', 0)} | Passed: {s.get('passed', 0)} | Failed: {s.get('failed', 0)} | Warned: {s.get('warned', 0)} | Skipped: {s.get('skipped', 0)}\")
print()
for c in data.get('checks', []):
    icon = '✓' if c['status'] == 'pass' else '✗' if c['status'] == 'fail' else '⚠' if c['status'] == 'warn' else '○'
    print(f\"  {icon} [{c['category']:15s}] {c['name']:40s} {c['message']}\")
print()
print(data.get('message', ''))
" 2>/dev/null || echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"

echo ""
echo "=== Health Check Complete ==="
