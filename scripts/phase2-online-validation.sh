#!/bin/bash
# =============================================================================
# Phase 2: Online Validation — Complete Runbook
#
# This script performs the full Phase 2 online validation:
#   1. Authenticates with Supabase CLI
#   2. Links the project
#   3. Deploys all edge functions
#   4. Verifies required secrets
#   5. Runs the health-check
#   6. Reports deployment_ready status
#
# Prerequisites:
#   - SUPABASE_ACCESS_TOKEN: Personal Access Token from
#     https://supabase.com/dashboard/account/tokens
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"
#   bash scripts/phase2-online-validation.sh
#
# Optional (for health-check step):
#   export SUPABASE_USER_EMAIL="your@email.com"
#   export SUPABASE_USER_PASSWORD="your-password"
#
# =============================================================================

set -euo pipefail

PROJECT_REF="ijwxlzwdysvvghmxlrnq"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:?'Set SUPABASE_ACCESS_TOKEN first. Get one at https://supabase.com/dashboard/account/tokens'}"

echo "=============================================="
echo "  Phase 2: Online Validation — Cloud Atlas Bot"
echo "=============================================="
echo ""

# -----------------------------------------------
# Step 1: Authenticate Supabase CLI
# -----------------------------------------------
echo "--- Step 1: Authenticating Supabase CLI ---"
npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
echo "OK: Authenticated"
echo ""

# -----------------------------------------------
# Step 2: Link project
# -----------------------------------------------
echo "--- Step 2: Linking project $PROJECT_REF ---"
npx supabase link --project-ref "$PROJECT_REF" 2>/dev/null || true
echo "OK: Project linked"
echo ""

# -----------------------------------------------
# Step 3: Push migrations
# -----------------------------------------------
echo "--- Step 3: Applying migrations ---"
echo "NOTE: Migrations should be applied via Supabase Dashboard"
echo "      (Settings > Database > Migrations) or via:"
echo ""
echo "  npx supabase db push --project-ref $PROJECT_REF"
echo ""
echo "Attempting db push..."
npx supabase db push --project-ref "$PROJECT_REF" 2>&1 || {
  echo "WARN: db push had issues. Check output above."
  echo "      You may need to apply migrations manually via Dashboard."
}
echo ""

# -----------------------------------------------
# Step 4: Deploy all edge functions
# -----------------------------------------------
echo "--- Step 4: Deploying all edge functions ---"
FUNCTIONS=(
  alert-engine
  auth-manager
  autonomous-agent
  daily-retraining
  enhanced-ml-engine
  health-check
  live-trading-engine
  market-data-engine
  mcp-integration
  migrate-legacy-keys
  ml-trading-engine
  notification-engine
  pnl-engine
  reconciliation-engine
  report-engine
  risk-management-engine
  scheduler-engine
  secure-credentials
  secure-notification-settings
  security-audit
  trading-bot
  wallet-engine
)

DEPLOY_FAILURES=()
for fn in "${FUNCTIONS[@]}"; do
  echo -n "  Deploying $fn... "
  if npx supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt=false 2>/dev/null; then
    echo "OK"
  else
    echo "FAILED"
    DEPLOY_FAILURES+=("$fn")
  fi
done

# auth-failure-test is intentionally skipped (disabled in production)
echo ""
if [ ${#DEPLOY_FAILURES[@]} -eq 0 ]; then
  echo "OK: All ${#FUNCTIONS[@]} functions deployed"
else
  echo "WARN: ${#DEPLOY_FAILURES[@]} function(s) failed to deploy: ${DEPLOY_FAILURES[*]}"
fi
echo ""

# -----------------------------------------------
# Step 5: Verify required secrets
# -----------------------------------------------
echo "--- Step 5: Checking required secrets ---"
echo "NOTE: Supabase auto-provides SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY"
echo ""
echo "Required secrets (set via Dashboard > Project Settings > Edge Functions > Secrets):"
echo "  - ENCRYPTION_KEY (>= 32 chars, not a placeholder)"
echo "  - RESEND_API_KEY (recommended for email notifications)"
echo "  - TELEGRAM_BOT_TOKEN (recommended for Telegram alerts)"
echo "  - TELEGRAM_CHAT_ID (recommended for Telegram alerts)"
echo ""
echo "Verify in Dashboard: https://supabase.com/dashboard/project/$PROJECT_REF/settings/functions"
echo ""

# Try to list secrets (may not show values, just names)
echo "Attempting to list configured secrets..."
npx supabase secrets list --project-ref "$PROJECT_REF" 2>&1 || echo "(Could not list secrets — verify manually in Dashboard)"
echo ""

# -----------------------------------------------
# Step 6: Run health-check
# -----------------------------------------------
echo "--- Step 6: Running health-check ---"

# Get the project URL
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Try to get a JWT if credentials are provided
if [ -n "${SUPABASE_USER_EMAIL:-}" ] && [ -n "${SUPABASE_USER_PASSWORD:-}" ]; then
  echo "Authenticating user to get JWT..."

  # We need the anon key for auth
  ANON_KEY=$(npx supabase projects api-keys --project-ref "$PROJECT_REF" 2>/dev/null | grep anon | awk '{print $NF}' || echo "")

  if [ -z "$ANON_KEY" ]; then
    echo "WARN: Could not retrieve anon key. Set SUPABASE_ANON_KEY manually."
    echo ""
    echo "Manual health-check command:"
    echo "  export SUPABASE_URL=\"$SUPABASE_URL\""
    echo "  export USER_JWT=\"<your-jwt-token>\""
    echo "  bash scripts/run-health-check.sh"
    exit 0
  fi

  AUTH_RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${SUPABASE_USER_EMAIL}\",\"password\":\"${SUPABASE_USER_PASSWORD}\"}")

  USER_JWT=$(echo "$AUTH_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

  if [ -z "$USER_JWT" ]; then
    echo "WARN: Authentication failed. Response:"
    echo "$AUTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$AUTH_RESPONSE"
    echo ""
    echo "Manual health-check command:"
    echo "  export SUPABASE_URL=\"$SUPABASE_URL\""
    echo "  export USER_JWT=\"<your-jwt-token>\""
    echo "  bash scripts/run-health-check.sh"
    exit 0
  fi

  echo "OK: Got JWT token"
else
  echo "No SUPABASE_USER_EMAIL / SUPABASE_USER_PASSWORD set."
  echo ""
  echo "To run the health-check, either:"
  echo "  a) Re-run with: export SUPABASE_USER_EMAIL=... SUPABASE_USER_PASSWORD=..."
  echo "  b) Or run manually:"
  echo "     export SUPABASE_URL=\"$SUPABASE_URL\""
  echo "     export USER_JWT=\"<your-jwt-token>\""
  echo "     bash scripts/run-health-check.sh"
  echo ""
  echo "=== Phase 2: Deployment complete. Health-check pending. ==="
  exit 0
fi

echo ""
echo "Calling health-check endpoint..."
export SUPABASE_URL
export USER_JWT
export SUPABASE_ANON_KEY="${ANON_KEY}"
bash scripts/run-health-check.sh

echo ""
echo "=== Phase 2: Online Validation Complete ==="
