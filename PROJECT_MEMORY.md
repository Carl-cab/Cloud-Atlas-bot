# PROJECT_MEMORY.md

Persistent context for ongoing development of the Cloud-Atlas-bot trading platform.

## Project Goals

Build a secure, functional, risk-managed autonomous crypto trading bot that:
1. Trades on Kraken exchange using ML-generated signals
2. Manages risk with circuit breakers, drawdown limits, cooldown, and kill switch
3. Tracks all money flows (deposits, withdrawals, P&L)
4. Reconciles DB state against exchange positions
5. Provides monitoring, alerting, and reporting
6. Halts all trading when safety thresholds are breached

**Optimization priority**: Correctness, security, observability, operational safety.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Paper mode is default | Prevents accidental live trading; must explicitly opt in |
| JWT-derived identity only | Prevents user impersonation via spoofed request bodies |
| Generic error messages | Prevents information leakage to attackers |
| CF-Connecting-IP for rate limiting | Cannot be spoofed by clients (set by Cloudflare edge) |
| No legacy crypto fallback | Removed insecure decryption methods; users re-enter keys |
| Service role for DB writes | Edge functions need to bypass RLS for cross-table operations |
| Separate auth client (anon key) | Service role client should not be used for token verification |
| Order idempotency keys | Prevents duplicate orders from network retries or rapid requests |
| Cooldown after losses | Prevents emotional/automated revenge trading |
| Reconciliation engine | Catches DB/exchange drift before it compounds |

## Kraken API Notes

- Private endpoints use HMAC-SHA512 with nonce (Unix timestamp ms)
- Asset codes: `ZUSD` (USD), `XXBT` (BTC), `XETH` (ETH)
- Trading pairs: `XBTUSD`, `ETHUSD`, `ADAUSD`
- Rate limits: ~15 calls per minute for private endpoints

## Supabase Project

- Project ref: `mhaggmeoxdepwyshkyff`
- Environment variables set via Supabase Dashboard (never in .env)

## Security Phases Completed

- **Phase 0**: JWT validation enforced, global API keys removed, env sanitized
- **Phase 1**: RLS lockdown, legacy crypto removed, rate-limit IP spoofing fixed
- **Phase 2**: Kill switch, order idempotency, strict risk limits, audit logging
- **Phase 3**: Deposit/withdrawal ledger, P&L tracking, reconciliation engine
- **Phase 4**: Production deployment readiness
- **Phase 5**: Monitoring, alerts, and reporting
- **Architecture**: Money flow verification, drawdown limits, cooldown system

## Environment Variables

### Frontend (.env — safe to expose)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

### Edge Functions (Supabase Secrets — never in .env)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto)
- `ENCRYPTION_KEY` (for credential/PII encryption)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `RESEND_API_KEY`
- Per-user Kraken keys are stored encrypted in DB, not as env vars
