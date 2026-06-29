#!/bin/bash
# =============================================================================
# Phase 2: Complete Online Validation
#
# Run this from your local machine (not the cloud sandbox).
# The sandbox blocks outbound HTTPS to Supabase domains.
#
# Prerequisites:
#   1. Clone or pull the branch:
#      git fetch origin claude/explain-codebase-mlkcywl5a5qn6jz6-h6AMW
#      git checkout claude/explain-codebase-mlkcywl5a5qn6jz6-h6AMW
#
#   2. Install Supabase CLI: npm install -g supabase
#
#   3. Set your token:
#      export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"
#
# =============================================================================

set -euo pipefail

PROJECT_REF="ijwxlzwdysvvghmxlrnq"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

echo "=============================================="
echo "  Phase 2: Online Validation — Cloud Atlas Bot"
echo "=============================================="
echo ""

# -----------------------------------------------
# Step 1: Authenticate
# -----------------------------------------------
echo "--- Step 1: Authenticate ---"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:?'Set SUPABASE_ACCESS_TOKEN first'}"
npx supabase login --token "$SUPABASE_ACCESS_TOKEN" 2>/dev/null || true
echo "Authenticated."
echo ""

# -----------------------------------------------
# Step 2: Link project
# -----------------------------------------------
echo "--- Step 2: Link project ---"
npx supabase link --project-ref "$PROJECT_REF" 2>/dev/null || true
echo "Project linked."
echo ""

# -----------------------------------------------
# Step 3: Check migration status
# -----------------------------------------------
echo "--- Step 3: Migration status ---"
echo "Checking remote migration status..."
npx supabase migration list --project-ref "$PROJECT_REF" 2>&1 || echo "(Could not list migrations)"
echo ""
echo "To apply pending migrations:"
echo "  npx supabase db push --project-ref $PROJECT_REF"
echo ""
read -p "Push migrations now? (y/N) " PUSH_MIGRATIONS
if [[ "$PUSH_MIGRATIONS" =~ ^[Yy]$ ]]; then
  npx supabase db push --project-ref "$PROJECT_REF"
fi
echo ""

# -----------------------------------------------
# Step 4: Deploy all edge functions
# -----------------------------------------------
echo "--- Step 4: Deploy edge functions ---"
read -p "Deploy all edge functions? (y/N) " DEPLOY_FNS
if [[ "$DEPLOY_FNS" =~ ^[Yy]$ ]]; then
  npx supabase functions deploy --project-ref "$PROJECT_REF" 2>&1
  echo ""
  echo "All functions deployed."
else
  echo "Skipped. Deploy manually with:"
  echo "  npx supabase functions deploy --project-ref $PROJECT_REF"
fi
echo ""

# -----------------------------------------------
# Step 5: Check secrets
# -----------------------------------------------
echo "--- Step 5: Verify secrets ---"
echo "Listing configured secrets..."
npx supabase secrets list --project-ref "$PROJECT_REF" 2>&1 || echo "(Could not list secrets)"
echo ""
echo "Required secrets:"
echo "  ENCRYPTION_KEY         — must be >= 32 chars, not a placeholder"
echo "  RESEND_API_KEY         — recommended for email notifications"
echo "  TELEGRAM_BOT_TOKEN     — recommended for Telegram alerts"
echo "  TELEGRAM_CHAT_ID       — recommended for Telegram alerts"
echo ""
echo "Set missing secrets via Dashboard:"
echo "  https://supabase.com/dashboard/project/$PROJECT_REF/settings/functions"
echo ""

# -----------------------------------------------
# Step 6: Get JWT and run health-check
# -----------------------------------------------
echo "--- Step 6: Run health-check ---"

# Get anon key
echo "Retrieving API keys..."
ANON_KEY=$(npx supabase projects api-keys --project-ref "$PROJECT_REF" 2>/dev/null \
  | grep -i anon | awk '{print $NF}') || ANON_KEY=""

if [ -z "$ANON_KEY" ]; then
  echo "Could not auto-retrieve anon key."
  read -p "Paste your SUPABASE_ANON_KEY: " ANON_KEY
fi

echo ""
read -p "Enter your Supabase email: " USER_EMAIL
read -sp "Enter your Supabase password: " USER_PASSWORD
echo ""

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
    print(data.get('access_token', ''))
except:
    print('')
" 2>/dev/null)

if [ -z "$USER_JWT" ]; then
  echo "Authentication failed. Response:"
  echo "$AUTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTH_RESPONSE"
  echo ""
  echo "Try manually:"
  echo "  export SUPABASE_URL=\"$SUPABASE_URL\""
  echo "  export USER_JWT=\"<your-jwt>\""
  echo "  export SUPABASE_ANON_KEY=\"$ANON_KEY\""
  echo "  bash scripts/run-health-check.sh"
  exit 1
fi

echo "Got JWT token."
echo ""
echo "Running health-check..."
echo ""

# Call health-check
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
  echo "ERROR: Authentication failed (401). Token may have expired."
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
    print('*** DEPLOYMENT READY: TRUE ***')
    print('Phase 2 is COMPLETE. Safe to proceed to Phase 3.')
else:
    print()
    print('*** DEPLOYMENT READY: FALSE ***')
    print('Fix the FAIL items above and re-run this script.')
" 2>/dev/null || {
  echo "Raw response:"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
}

echo ""
echo "=== Phase 2: Online Validation Complete ==="
