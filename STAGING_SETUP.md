# Staging Setup

How to stand up a **separate** staging Supabase project for smoke-testing the
Strategy Engine paper experiment, without ever touching the production
paper-validation project.

> **Production project `ijwxlzwdysvvghmxlrnq` is off-limits for testing.** It
> is mid-Phase-3 and must stay pristine. Every script here refuses to run if
> its target ref equals the production ref.

---

## Why a separate project

`execute_trade` reads the *latest* `strategy_signals` row regardless of its
`strategy_type`. If the experiment ran in production, its vol-expansion signals
would enter the Phase 3 execution stream and **contaminate the validation
record**. A separate project keeps Phase 3's dataset clean and lets us test
freely.

## What you provide (I cannot create this for you)

Creating a Supabase project requires your account. Do this once:

1. **Create the project** at https://supabase.com/dashboard → New Project.
   Name it e.g. `cloud-atlas-staging`. Choose the same region as production.
2. **Copy its project ref** (the `xxxxxxxx` in `https://<ref>.supabase.co`).
   This is your `STAGING_PROJECT_REF`. It must NOT be `ijwxlzwdysvvghmxlrnq`.
3. **Copy its anon key and service role key** (Dashboard → Settings → API).

> When you have the ref, hand it to me (or just set it in your shell). Until a
> real staging ref exists, the scripts will stop and tell you to create one.

## One-time staging configuration

```bash
# In your shell (staging values, NOT production):
export SUPABASE_ACCESS_TOKEN="sbp_xxxx"            # your personal access token
export STAGING_PROJECT_REF="your-staging-ref"      # NOT ijwxlzwdysvvghmxlrnq
export SUPABASE_ANON_KEY="staging-anon-key"
export SUPABASE_USER_EMAIL="staging-test@example.com"
export SUPABASE_USER_PASSWORD="a-strong-password"
```

### 1. Apply the schema (all migrations, including the strategy tables)

```bash
bash scripts/deploy-staging.sh --with-migrations
```

This runs `supabase db push` against staging, creating every table Phase 2/3
and the Strategy Engine need (`bot_config`, `trading_positions`,
`strategy_signals`, `strategy_results`, `security_audit_log`, …).

### 2. Create the staging test user

In the staging Dashboard → Authentication → Users → Add user, create a user
with the `SUPABASE_USER_EMAIL` / `SUPABASE_USER_PASSWORD` above.

### 3. Seed a paper `bot_config` for that user

Dashboard → SQL editor (staging), replacing `<USER_UUID>`:

```sql
insert into public.bot_config (user_id, mode, is_active, is_paused, capital_cad, daily_stop_loss)
values ('<USER_UUID>', 'paper', true, false, 10000, 5)
on conflict (user_id) do update set mode = 'paper', is_active = true, is_paused = false;
```

> `mode` MUST be `paper`. Do not set `live` anywhere, ever.

### 4. Store Kraken API keys for the test user (read-only recommended)

`analyze_market` fetches per-user Kraken credentials before pulling OHLC, so
the test user needs keys stored — even though paper mode never trades. Use
**read-only** Kraken API keys (Kraken → Settings → API → Query-only
permissions). Store them via the staging `secure-credentials` function, or the
app's Settings UI pointed at staging. Read-only keys cannot place orders, so
this is safe.

### 5. Set staging function secrets

Dashboard → Edge Functions → Secrets (staging project):

| Secret | Staging value |
|--------|---------------|
| `USE_BROKER_ADAPTERS` | `true` |
| `USE_STRATEGY_ENGINE` | `true`  ← **staging only** |
| `SUPABASE_URL` / keys | auto-provided by Supabase |
| `TELEGRAM_*` | optional (leave unset to skip notifications) |

Production keeps `USE_STRATEGY_ENGINE` unset/false.

## Deploy + smoke test

```bash
bash scripts/deploy-staging.sh          # deploys trading-bot + secure-credentials
bash scripts/run-smoke-tests.sh         # verifies the paper wiring on staging
```

A green run means the pipeline executes, writes `strategy_results` and audit
rows, and produces only simulated (paper) orders. It does **not** authorize
production — see `RELEASE_CHECKLIST.md`.

## Teardown

Staging is disposable. When finished, either pause/delete the staging project
in the Dashboard, or `TRUNCATE strategy_results, strategy_signals;` to reset
between runs. Nothing here affects production.
