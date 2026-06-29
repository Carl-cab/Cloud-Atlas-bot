# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build (vite build → dist/)
npm run lint         # ESLint
npx vitest run       # Run all tests
npx vitest run src/test/security/  # Run security tests only
npx vitest run path/to/file.test.ts  # Single test file
```

Deploy edge functions:
```bash
SUPABASE_ACCESS_TOKEN=<pat> npx supabase functions deploy --project-ref ijwxlzwdysvvghmxlrnq
```

## Architecture

Autonomous crypto trading bot: React dashboard + Supabase Edge Functions backend + Kraken exchange.

### Frontend (React + TypeScript + Vite)

- **Entry**: `src/pages/Index.tsx` (tabbed dashboard)
- **Path alias**: `@/` → `./src/`
- **UI library**: shadcn/ui (`src/components/ui/`)
- **State**: `src/context/BotStateProvider.tsx` (global bot config, mode, active state)
- **Supabase client**: `src/integrations/supabase/client.ts`

### Backend (Supabase Edge Functions — Deno/TypeScript)

All functions in `supabase/functions/<name>/index.ts`. Core trading pipeline:

```
trading-bot (signal → risk → trade)
  ├── live-trading-engine (Kraken API: balance, orders, market prices)
  ├── ml-trading-engine (signal generation: RSI, MACD, momentum)
  ├── enhanced-ml-engine (advanced ML with regime detection)
  ├── risk-management-engine (circuit breaker, drawdown, kill switch)
  └── secure-credentials (encrypted API key storage via AES-GCM + HKDF)

wallet-engine (balance tracking, deposit/withdrawal ledger)
pnl-engine (P&L tracking, drawdown calculation)
reconciliation-engine (DB vs exchange position sync)
scheduler-engine (cooldown system, trade scheduling)
report-engine (daily reports, performance summaries)
alert-engine (monitoring alerts, incident tracking)
health-check (system health verification)
notification-engine (Telegram + email delivery)
```

**Shared code**: `supabase/functions/_shared/rateLimiter.ts`, `featureFlags.ts`

### Trading Modes

Controlled by `bot_config.mode` in the database:
- `paper` (default) — Simulates trades, logs them, never hits exchange
- `live` — Places real orders on Kraken

### Authentication Pattern

Every sensitive edge function follows:
1. Extract Bearer token from `Authorization` header
2. Verify via `supabaseAuth.auth.getUser(token)` (using ANON_KEY client)
3. Derive `user_id` from `user.id` — never trust `user_id` from request body
4. Return 401 directly on auth failure (not thrown through catch)
5. Service-to-service calls use `SUPABASE_SERVICE_ROLE_KEY` as bearer token

### Database

PostgreSQL via Supabase with RLS. Key tables: `bot_config`, `trading_positions`, `trading_logs`, `executed_trades`, `risk_events`, `market_data`, `daily_reports`, `agent_incidents`, `deposit_withdrawal_ledger`. Migrations in `supabase/migrations/`.

### Safety Controls

- **Kill switch**: Instantly halts all trading (`bot_config.is_active = false`)
- **Order idempotency**: Prevents duplicate orders from rapid requests
- **Drawdown limits**: Auto-halts when max drawdown exceeded
- **Cooldown system**: Pauses after consecutive losses
- **Reconciliation**: Verifies DB positions match exchange state
- **Money flow verification**: Tracks all deposits/withdrawals

## Security Invariants

- All edge functions (except `market-data-engine`, `health-check`) require JWT auth
- Error responses never expose internal details — only generic messages
- Rate limiter trusts CF-Connecting-IP, then rightmost non-private X-Forwarded-For
- `supabase/config.toml` controls `verify_jwt` at the gateway level
- Credentials encrypted via AES-GCM with HKDF key derivation (v2, no legacy fallback)
- No global API keys — per-user encrypted keys stored in database

## Testing

Vitest + jsdom. Config: `vitest.config.ts`, setup: `src/test/setup.ts`.

- Component tests: `src/test/components/`
- Hook tests: `src/test/hooks/`
- Integration tests: `src/test/integration/`
- Security tests: `src/test/security/`
