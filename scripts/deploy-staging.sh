#!/bin/bash
# =============================================================================
# Deploy to STAGING (never production)
#
# Deploys the edge functions needed to smoke-test the Strategy Engine paper
# experiment to a SEPARATE staging Supabase project. Production project
# ijwxlzwdysvvghmxlrnq must never be a target of this script.
#
# The FIRST thing this script does is refuse to run if the target ref is the
# production ref. There is no override.
#
# Prerequisites (see STAGING_SETUP.md):
#   export SUPABASE_ACCESS_TOKEN="sbp_xxxx"        # personal access token
#   export STAGING_PROJECT_REF="your-staging-ref"  # NOT the production ref
#
# Usage:
#   bash scripts/deploy-staging.sh                 # deploy smoke-test functions
#   bash scripts/deploy-staging.sh --with-migrations
#   bash scripts/deploy-staging.sh --all           # deploy every function
# =============================================================================

set -euo pipefail

# --- Hard production guard (first, before anything else) ---------------------
PROD_REF="ijwxlzwdysvvghmxlrnq"
STAGING_PROJECT_REF="${STAGING_PROJECT_REF:?'Set STAGING_PROJECT_REF (a staging project, NOT production). Stop and create one — see STAGING_SETUP.md'}"

if [ "$STAGING_PROJECT_REF" = "$PROD_REF" ]; then
  echo "REFUSING: STAGING_PROJECT_REF equals the production ref ($PROD_REF)."
  echo "This script deploys ONLY to staging. Production must remain untouched."
  exit 1
fi

SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:?'Set SUPABASE_ACCESS_TOKEN first'}"

# Minimum set of functions to exercise the strategy-engine paper flow:
#   trading-bot        — carries the USE_STRATEGY_ENGINE wiring (analyze_market)
#   secure-credentials — analyze_market fetches per-user Kraken keys before OHLC
SMOKE_FUNCTIONS=("trading-bot" "secure-credentials")
ALL_FUNCTIONS=("trading-bot" "secure-credentials" "scheduler-engine" "health-check" "risk-management-engine" "live-trading-engine" "reconciliation-engine")

WITH_MIGRATIONS=false
FUNCTIONS=("${SMOKE_FUNCTIONS[@]}")
for arg in "$@"; do
  case "$arg" in
    --with-migrations) WITH_MIGRATIONS=true ;;
    --all) FUNCTIONS=("${ALL_FUNCTIONS[@]}") ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

echo "=============================================="
echo "  Deploy to STAGING"
echo "=============================================="
echo "  Target ref: $STAGING_PROJECT_REF  (production $PROD_REF is NOT touched)"
echo "  Functions:  ${FUNCTIONS[*]}"
echo "  Migrations: $WITH_MIGRATIONS"
echo ""

if [ "$WITH_MIGRATIONS" = "true" ]; then
  echo "--- Applying migrations to staging ---"
  SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx supabase db push --project-ref "$STAGING_PROJECT_REF"
  echo ""
fi

for fn in "${FUNCTIONS[@]}"; do
  echo "--- Deploying $fn to staging ---"
  SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx supabase functions deploy "$fn" --project-ref "$STAGING_PROJECT_REF"
  echo ""
done

echo "=============================================="
echo "  STAGING deploy complete."
echo "=============================================="
echo ""
echo "Next:"
echo "  1. In the staging project dashboard, set function secrets:"
echo "       USE_BROKER_ADAPTERS=true"
echo "       USE_STRATEGY_ENGINE=true      # staging ONLY"
echo "     (Production keeps USE_STRATEGY_ENGINE unset/false.)"
echo "  2. Ensure the staging test user has a paper bot_config and Kraken keys"
echo "     (read-only keys are fine — see STAGING_SETUP.md)."
echo "  3. Run: bash scripts/run-smoke-tests.sh"
echo ""
