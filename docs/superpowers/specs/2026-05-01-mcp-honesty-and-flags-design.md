# MCP Honesty Pass + Feature Flag Infrastructure

**Date:** 2026-05-01
**Status:** Design — pending review
**Scope:** Close the doc/code gaps identified in the audit of `docs/MCP_IMPLEMENTATION.md` by (A) making the doc match reality and (B) wiring up the feature-flag infrastructure the doc claims exists.

## Context

A review of `docs/MCP_IMPLEMENTATION.md` against `src/mcp/`, `supabase/functions/mcp-integration/`, and `src/components/MCPDashboard.tsx` found accurate descriptions of resource/tool names and cache config, but several inaccuracies and aspirational claims:

- Wrong field reference in a usage example (`overview.sentiment.score` — should be `sentiment_score`).
- Four `ENABLE_*` feature flags listed but not implemented anywhere.
- Four API keys (`BINANCE_API_KEY`, `COINBASE_API_KEY`, `COINGECKO_API_KEY`, `TWITTER_BEARER_TOKEN`) listed; only `BINANCE_API_KEY` is referenced (in unrelated shared config), and the MCP edge function calls all external APIs unauthenticated.
- Security claims (rate limiting, request validation), monitoring claims (response time / success rate / cache hit ratio metrics), and troubleshooting "solutions" (exponential backoff, timeouts) — none implemented.
- Three of the four edge-function actions undocumented (`analyze_sentiment`, `get_economic_calendar`, `fetch_onchain_data`).
- Most tool implementations return `Math.random()` placeholders without disclosing this.

This design covers the honesty pass (A) and the flag infrastructure (D). It explicitly does **not** cover hardening (B — request validation, rate limiting) or real integrations (C — replacing placeholders with real APIs).

## Goals

1. Doc and code agree on what exists.
2. Feature flags actually gate behavior, off by default.
3. Placeholder/simulated tool responses are clearly marked at the response level.
4. No new external API dependencies, no breaking changes to dashboard UX.

## Non-Goals

- Replacing simulated tools with real integrations.
- Adding rate limiting, request validation, timeouts, or metrics tracking.
- Changes to `MCPDashboard.tsx` UI.
- API key plumbing for endpoints that don't currently need authentication.

## Architecture

### Flag mechanism

Env vars only — no DB, no UI toggle. Two reading sites with the same conceptual flag set:

| Concept              | Vite (browser bundle)             | Edge function (Deno)        |
|----------------------|-----------------------------------|-----------------------------|
| Multi-exchange data  | `VITE_ENABLE_MULTI_EXCHANGE_DATA` | `ENABLE_MULTI_EXCHANGE_DATA`|
| Sentiment analysis   | `VITE_ENABLE_SENTIMENT_ANALYSIS`  | `ENABLE_SENTIMENT_ANALYSIS` |
| On-chain metrics     | `VITE_ENABLE_ONCHAIN_METRICS`     | `ENABLE_ONCHAIN_METRICS`    |
| Economic calendar    | `VITE_ENABLE_ECONOMIC_CALENDAR`   | `ENABLE_ECONOMIC_CALENDAR`  |

The Vite prefix is mandatory to expose vars to the browser bundle. Both names refer to the same logical flag and are expected to be set in tandem in any environment that exercises both surfaces.

A flag is `true` only when the env var is the literal string `"true"`. Anything else (unset, `"false"`, `"0"`, `""`, missing) evaluates to `false`. No coercion of `"1"` / `"yes"` / etc.

### Helper modules

Two thin modules expose a typed flag object so call sites don't sprinkle `import.meta.env` / `Deno.env.get` everywhere:

**`src/mcp/flags.ts`** (new, ~15 lines):
```typescript
export interface MCPFlags {
  multiExchange: boolean;
  sentiment: boolean;
  onchain: boolean;
  economicCalendar: boolean;
}

export const flags: MCPFlags = {
  multiExchange: import.meta.env.VITE_ENABLE_MULTI_EXCHANGE_DATA === 'true',
  sentiment: import.meta.env.VITE_ENABLE_SENTIMENT_ANALYSIS === 'true',
  onchain: import.meta.env.VITE_ENABLE_ONCHAIN_METRICS === 'true',
  economicCalendar: import.meta.env.VITE_ENABLE_ECONOMIC_CALENDAR === 'true',
};
```

**`supabase/functions/mcp-integration/flags.ts`** (new, ~15 lines): same shape, `Deno.env.get('ENABLE_*') === 'true'`.

Same module is imported wherever a gate is needed.

### Flag → resource/tool/action mapping

| Flag                | Client resources              | Client tools              | Edge-function actions   |
|---------------------|-------------------------------|---------------------------|-------------------------|
| `multiExchange`     | `mcp://market-data/binance`   | —                         | `fetch_external_data`   |
| `sentiment`         | `mcp://sentiment/social`      | `fetch-news-sentiment`    | `analyze_sentiment`     |
| `onchain`           | `mcp://blockchain/metrics`    | `analyze-onchain-metrics` | `fetch_onchain_data`    |
| `economicCalendar`  | `mcp://economic/calendar`     | —                         | `get_economic_calendar` |

**Always-on** (no flag): `mcp://market-data/kraken`, `mcp://news/crypto`, `analyze-correlation`, `calculate-portfolio-var`, `retrain-ml-model`, `check-regulatory-compliance`. Rationale: Kraken is the primary exchange; correlation/VaR touch real DB data (only the math is simplified); `retrain-ml-model` delegates to a real edge function; the remaining two are unobtrusive enough that adding a flag adds more config noise than safety. They get `simulated`/`partially_simulated` markers in the response instead.

## Behavior

### Client (`src/mcp/mcp-server.ts`)

A new error class:
```typescript
export class MCPDisabledError extends Error {
  constructor(public feature: string, public uri?: string) {
    super(`MCP feature disabled: ${feature}${uri ? ` (${uri})` : ''}`);
    this.name = 'MCPDisabledError';
  }
}
```

Behavior changes:

- `listResources()` filters out resources whose flag is off.
- `listTools()` filters out tools whose flag is off.
- `readResource(uri)` throws `MCPDisabledError` if `uri` maps to a disabled flag (lookup table inside the method).
- `callTool(name, args)` throws `MCPDisabledError` if `name` maps to a disabled flag.
- Placeholder resource/tool implementations gain `simulated: true` at the top level of their response (always — independent of flag state).
- `analyzeCorrelation` response gains `partially_simulated: true` and `simulated_fields: ['correlation_matrix']`.
- `calculatePortfolioVaR` response gains `partially_simulated: true` and `simulated_fields: ['var_estimate']`.

### Client (`src/mcp/mcp-client.ts`)

- `refreshCriticalResources()` skips disabled URIs silently (no warn log spam).
- No other changes. Existing `Promise.allSettled` + stale-cache-on-error logic in `getResource` already handles `MCPDisabledError` gracefully — convenience methods (`getMarketOverview`, `analyzePortfolioRisk`, `getNewsAndSentiment`) will simply return `null` for the disabled fields.

### Edge function (`supabase/functions/mcp-integration/index.ts`)

- Action switch checks the flag before dispatch. Disabled action returns:
  ```json
  { "success": false, "error": "feature_disabled", "feature": "sentiment", "timestamp": "..." }
  ```
  with HTTP 200 (it's a known state, not a server error).
- `analyzeSentiment`, `getEconomicCalendar`, `fetchOnchainData` responses gain `simulated: true` at top level (alongside the existing `note: "..."` string).

### Dashboard (`src/components/MCPDashboard.tsx`)

No changes. The dashboard iterates `listResources()` / `listTools()` and will display fewer items when flags are off. Convenience methods returning `null` for disabled fields are already handled.

## Doc rewrite (`docs/MCP_IMPLEMENTATION.md`)

Surgical edits only — no reorganization.

1. **Fix wrong example** (line 213): `overview.sentiment.score` → `overview.sentiment.sentiment_score`.

2. **Replace "Environment Variables" section** (lines 192–199): remove the four-key list. Replace with the four `VITE_ENABLE_*` flag names and a note that no external API keys are required today (public endpoints only); future paid integrations will follow the existing `supabase/functions/_shared/config.ts` pattern.

3. **Update "Feature Flags" section** (lines 201–205): keep the four flag names, document each in one line as off-by-default with the resource/tool/action it gates. Use the `VITE_ENABLE_*` form.

4. **Add new "Simulated Data" subsection** (between "MCP Tools" and "Integration Points"): one short paragraph explaining several tools/resources currently return simulated data marked with `simulated: true` (or `partially_simulated: true` for correlation/VaR), and a list naming which.

5. **Document the 3 missing edge-function actions** in "Backend Integration": add `analyze_sentiment`, `get_economic_calendar`, `fetch_onchain_data` alongside the existing `fetch_external_data` example.

6. **Demote aspirational claims:**
   - Security: drop "Rate limiting for external APIs" and "Request validation and sanitization." Keep HTTPS and Supabase secrets bullet.
   - Monitoring & Observability: replace "Metrics Tracked" list with the single true statement: *"Each MCP edge-function call is logged to `log_trading_event` with action and params."* Move the rest of the bullets under "Future Enhancements."
   - Troubleshooting "Common Issues" (lines 229–233): keep the section, but reframe each numbered item from prescriptive ("Implement exponential backoff") to descriptive ("Not currently implemented; if added, exponential backoff is the recommended pattern"). None of the listed mitigations exist in the code.

## Configuration files

**`.env.example`** (existing — append):

```bash

# MCP feature flags — off by default
# Set to "true" to enable simulated data for development/demo.
# Production deployments should leave these unset.
VITE_ENABLE_MULTI_EXCHANGE_DATA=false
VITE_ENABLE_SENTIMENT_ANALYSIS=false
VITE_ENABLE_ONCHAIN_METRICS=false
VITE_ENABLE_ECONOMIC_CALENDAR=false
```

Edge function flags are not added to `.env.example` (Supabase secrets are managed separately, not via `.env`); their existence is documented in `MCP_IMPLEMENTATION.md`.

## Testing

Vitest is already configured (`vitest.config.ts`, jsdom env, setup at `src/test/setup.ts`).

**New test files:**

- `src/mcp/flags.test.ts` — env parsing: `"true"` → true; `"false"`, `""`, `"1"`, `"yes"`, unset → false. Uses `vi.stubEnv` per Vite test convention.
- `src/mcp/mcp-server.test.ts` — gating behavior:
  - `listResources()` filters disabled URIs.
  - `listTools()` filters disabled tools.
  - `readResource(disabledUri)` throws `MCPDisabledError`.
  - `callTool(disabledTool, ...)` throws `MCPDisabledError`.
  - Enabled cases: resource/tool returns object with `simulated: true` (where applicable).
  - Correlation/VaR returns `partially_simulated: true` + `simulated_fields`.

Edge function tests are out of scope for this change (no Deno test infra exists in the repo); the gating logic in the edge function will be exercised by the same flag-helper unit shape and reviewed manually.

## Files touched

**New (4):**
- `src/mcp/flags.ts`
- `supabase/functions/mcp-integration/flags.ts`
- `src/mcp/flags.test.ts`
- `src/mcp/mcp-server.test.ts`

**Modified (5):**
- `src/mcp/mcp-server.ts`
- `src/mcp/mcp-client.ts`
- `supabase/functions/mcp-integration/index.ts`
- `docs/MCP_IMPLEMENTATION.md`
- `.env.example` (append)

**Not touched:**
- `src/components/MCPDashboard.tsx`
- `supabase/functions/_shared/config.ts`

## Risk and rollback

**Behavioral risk:** dashboard will show fewer resources/tools after this lands, until operator sets flags. This is intentional but visible. Mitigation: dev environments set all flags `=true` in their local `.env`, matching the documented dev workflow.

**Rollback:** revert is mechanical — flags default to false means removing `flags.ts` imports and the gating checks restores prior behavior. No data migrations, no schema changes.
