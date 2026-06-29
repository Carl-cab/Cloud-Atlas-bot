#!/bin/bash
# =============================================================================
# Phase 2: Complete Online Validation
#
# Run from your local machine (not the cloud sandbox).
#
# Prerequisites:
#   export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"
#
# Optional (skips interactive prompts):
#   export SUPABASE_ANON_KEY="your-anon-key"
#   export SUPABASE_USER_EMAIL="your@email.com"
#   export SUPABASE_USER_PASSWORD="your-password"
# =============================================================================

set -euo pipefail

PROJECT_REF="ijwxlzwdysvvghmxlrnq"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:?'Set SUPABASE_ACCESS_TOKEN first'}"

echo "=============================================="
echo "  Phase 2: Online Validation — Cloud Atlas Bot"
echo "=============================================="
echo "  Project: $PROJECT_REF"
echo "  URL:     $SUPABASE_URL"
echo ""

# -----------------------------------------------
# Step 1: Authenticate
# -----------------------------------------------
echo "--- Step 1: Authenticate ---"
npx supabase login --token "$SUPABASE_ACCESS_TOKEN" 2>&1 | grep -v "PostHog" || true
echo "Done."
echo ""

# -----------------------------------------------
# Step 2: Link project
# -----------------------------------------------
echo "--- Step 2: Link project ---"
npx supabase link --project-ref "$PROJECT_REF" 2>&1 | grep -v "PostHog" || true
echo "Done."
echo ""

# -----------------------------------------------
# Step 3: Check migration status
# -----------------------------------------------
echo "--- Step 3: Migration status ---"
npx supabase migration list 2>&1 | head -50 || echo "(Could not list migrations)"
echo ""
read -p "Push migrations now? (y/N) " PUSH_MIGRATIONS
if [[ "$PUSH_MIGRATIONS" =~ ^[Yy]$ ]]; then
  npx supabase db push 2>&1
fi
echo ""

# -----------------------------------------------
# Step 4: Deploy all edge functions
# -----------------------------------------------
echo "--- Step 4: Deploy edge functions ---"
read -p "Deploy all edge functions? (y/N) " DEPLOY_FNS
if [[ "$DEPLOY_FNS" =~ ^[Yy]$ ]]; then
  npx supabase functions deploy 2>&1
  echo "All functions deployed."
else
  echo "Skipped. Deploy manually with: npx supabase functions deploy"
fi
echo ""

# -----------------------------------------------
# Step 5: Check secrets
# -----------------------------------------------
echo "--- Step 5: Verify secrets ---"
npx supabase secrets list 2>&1 || echo "(Could not list secrets)"
echo ""
echo "Required: ENCRYPTION_KEY (>= 32 chars)"
echo "Recommended: RESEND_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID"
echo "Dashboard: https://supabase.com/dashboard/project/$PROJECT_REF/settings/functions"
echo ""

# -----------------------------------------------
# Step 6: Get JWT and run health-check
# -----------------------------------------------
echo "--- Step 6: Run health-check ---"

# Get anon key
ANON_KEY="${SUPABASE_ANON_KEY:-}"

if [ -z "$ANON_KEY" ]; then
  echo "Retrieving anon key..."
  # Try JSON output format (newer CLI)
  ANON_KEY=$(npx supabase projects api-keys 2>/dev/null \
    | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for key in data:
        if 'anon' in key.get('name', '').lower():
            print(key.get('api_key', '')); break
except:
    pass
" 2>/dev/null) || ANON_KEY=""

  # Fallback: try text parsing
  if [ -z "$ANON_KEY" ]; then
    ANON_KEY=$(npx supabase projects api-keys 2>/dev/null \
      | grep -i anon | grep -oE 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+') || ANON_KEY=""
  fi

  if [ -z "$ANON_KEY" ]; then
    echo "Could not auto-retrieve anon key."
    read -p "Paste your SUPABASE_ANON_KEY: " ANON_KEY
  else
    echo "Got anon key."
  fi
fi

echo ""

# Get user credentials
USER_EMAIL="${SUPABASE_USER_EMAIL:-}"
USER_PASSWORD="${SUPABASE_USER_PASSWORD:-}"

if [ -z "$USER_EMAIL" ]; then
  read -p "Enter your Supabase email: " USER_EMAIL
fi
if [ -z "$USER_PASSWORD" ]; then
  read -sp "Enter your Supabase password: " USER_PASSWORD
  echo ""
fi

echo "Authenticating..."
AUTH_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"${USER_PASSWORD}\"}")

USER_JWT=$(echo "$AUTH_RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    token = data.get('access_token', '')
    if token: print(token)
    else:
        err = data.get('error_description', data.get('msg', data.get('error', '')))
        print('', file=sys.stderr)
        if err: print(f'Auth error: {err}', file=sys.stderr)
except Exception as e:
    print(f'Parse error: {e}', file=sys.stderr)
" 2>&1)

# Check if we got an error message instead of a token
if [ -z "$USER_JWT" ] || [[ "$USER_JWT" == *"error"* ]]; then
  echo "Authentication failed."
  echo "$AUTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTH_RESPONSE"
  echo ""
  echo "Run manually with a valid JWT:"
  echo "  export SUPABASE_URL=\"$SUPABASE_URL\""
  echo "  export USER_JWT=\"<token>\""
  echo "  export SUPABASE_ANON_KEY=\"$ANON_KEY\""
  echo "  bash scripts/run-health-check.sh"
  exit 1
fi

echo "Got JWT."
echo ""
echo "Calling health-check..."
echo ""

# Run health-check
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "${SUPABASE_URL}/functions/v1/health-check" \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${ANON_KEY}" \
  -d '{"action": "run_checks"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "401" ]; then
  echo "ERROR: 401 Unauthorized — JWT may have expired."
  exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Health check returned HTTP $HTTP_CODE"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  exit 1
fi

# Display results
echo "$BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
s = data.get('summary', {})

print('=' * 60)
print(f\"  Overall Status:    {data.get('overall_status', 'unknown').upper()}\")
print(f\"  Deployment Ready:  {data.get('deployment_ready', False)}\")
print(f\"  Checked At:        {data.get('checked_at', 'unknown')}\")
print(f\"  Total: {s.get('total', 0)} | Passed: {s.get('passed', 0)} | Failed: {s.get('failed', 0)} | Warned: {s.get('warned', 0)} | Skipped: {s.get('skipped', 0)}\")
print('=' * 60)
print()

for c in data.get('checks', []):
    icon = 'PASS' if c['status'] == 'pass' else 'FAIL' if c['status'] == 'fail' else 'WARN' if c['status'] == 'warn' else 'SKIP'
    print(f\"  [{icon:4s}] [{c['category']:15s}] {c['name']}\")
    print(f\"         {c['message']}\")
    print()

print(data.get('message', ''))

if data.get('deployment_ready'):
    print()
    print('=== DEPLOYMENT READY: TRUE ===')
    print('Phase 2 COMPLETE. Safe to proceed to Phase 3.')
else:
    print()
    print('=== DEPLOYMENT READY: FALSE ===')
    print('Fix the FAIL items above, redeploy health-check, and rerun.')
" 2>/dev/null || {
  echo "Raw response:"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
}

echo ""
echo "=== Done ==="
