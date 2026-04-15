# Cloud Atlas Trading Dashboard

Automated crypto trading bot with ML strategy engines, live Kraken exchange integration, and real-time risk management — built with **Vite + React + TypeScript**, **shadcn/ui**, **Tailwind CSS**, and **Supabase**.

---

## Prerequisites

- Node.js ≥ 18
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for deploying edge functions)
- A [Kraken](https://www.kraken.com/) account with API keys

---

## Getting started

```sh
# 1. Clone
git clone <YOUR_GIT_URL>
cd cloud-atlas-trading

# 2. Install dependencies
npm install

# 3. Configure environment (copy and fill in values)
cp .env.example .env

# 4. Start the dev server
npm run dev
```

Vite reads `PORT` from the environment; if unset it picks a free port automatically.

### Required environment variables (`.env`)

```env
VITE_SUPABASE_URL=https://mhaggmeoxdepwyshkyff.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
VITE_SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>   # used server-side only
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (auto port) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` on http://localhost:4173 |
| `npm run lint` | ESLint |

---

## Supabase backend

| Resource | Detail |
|---|---|
| Project | `CloudAtlas-v2` — `mhaggmeoxdepwyshkyff` |
| Auth | Anonymous sign-in enabled; users get a session on first load |
| Tables | 30 (bot\_config, trading\_positions, strategy\_signals, market\_data, …) |
| Edge Functions | 17 (live-trading-engine, secure-credentials, market-data-engine, …) |

### Re-deploy edge functions

```sh
SUPABASE_ACCESS_TOKEN=<your-pat> npx supabase functions deploy \
  --project-ref mhaggmeoxdepwyshkyff
```

### Apply new migrations

```sh
SUPABASE_ACCESS_TOKEN=<your-pat> npx supabase db push
```

---

## Adding Kraken API keys

1. Open the app → **Setup → Configure API Keys**
2. Enter your Kraken API Key and Secret
3. Keys are AES-GCM encrypted and stored in Supabase via the `secure-credentials` edge function

---

## Project structure

```
src/
  components/       # UI components (tabs, modals, charts)
  context/          # BotStateProvider (global bot state)
  hooks/            # useAuth, usePerformanceMonitor
  integrations/
    supabase/       # client.ts, types.ts
  pages/            # Index, LiveTrading, NotFound
supabase/
  functions/        # Deno edge functions
  migrations/       # Ordered SQL migrations
```

---

## Tech stack

- **Frontend** — Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend** — Supabase (PostgreSQL, Auth, Edge Functions, RLS)
- **Exchange** — Kraken REST API via `live-trading-engine` edge function
- **ML** — Custom strategy engines (trend-following, mean-reversion) with daily retraining

---

## Telegram bot

CloudAtlasBot has a Telegram command interface powered by the `telegram-command-router` edge function.

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token.
2. Start a conversation with your bot to get your chat ID, or use [@userinfobot](https://t.me/userinfobot).
3. Find your Supabase user UUID in the dashboard under **Auth → Users**.
4. Set the required secrets:

```bash
npx supabase secrets set \
  TELEGRAM_BOT_TOKEN="<token from BotFather>" \
  TELEGRAM_CHAT_ID="<your Telegram chat ID>" \
  TELEGRAM_USER_ID="<your Supabase user UUID>" \
  --project-ref mhaggmeoxdepwyshkyff
```

5. Register the webhook with Telegram (run once after deploy):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/telegram-command-router"}'
```

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/status` | Mode, active state, daily P&L, positions, last signal time |
| `/report` | Generate and send today's daily report |
| `/positions` | All open positions with entry price, current price, unrealized P&L |
| `/alerts` | Latest 10 unresolved monitoring incidents |
| `/pause` | Pause the bot (`is_active = false`) |
| `/resume` | Resume the bot (paper mode only) |
| `/paper` | Switch to paper mode and pause |

### Test manually

```bash
curl -X POST \
  https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/telegram-command-router \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":"<YOUR_CHAT_ID>"},"text":"/status"}}'
```

---

## Monitoring agent

The `monitoring-agent` edge function runs 13 health checks and logs every anomaly to the `agent_incidents` table. **All alerts are DB-only — no external messages are sent.**

### What it monitors

| Check | What it looks for | Action on breach |
|-------|-------------------|-----------------|
| `bot_config` | Config row exists | Critical — returns immediately |
| `signal_freshness` | Last signal ≤ 30 min (when active) | Warning |
| `market_data_freshness` | Last market data ≤ 30 min (when active) | Warning |
| `position_count` | Open positions ≤ `max_positions` | Warning |
| `daily_loss` | Daily loss ≤ `daily_stop_loss %` of capital | **Critical → bot paused** |
| `risk_limits` | No risk limit utilisation ≥ 100% | Warning |
| `risk_events` | < 3 risk events per hour | Warning |
| `notification_failures` | < 5 notification failures per hour | Warning |
| `recent_trades` | At least 1 trade per 4 h (live mode) | Warning |
| `symbol_concentration` | No symbol > 50% of open positions | Warning |
| `pnl_consistency` | `daily_pnl.realized_pnl` within 5% of sum of `executed_trades` (exit/stop_loss/take_profit only) | Warning |
| `system_health` | daily_pnl record exists today (if active); no ghost positions > 7 days old; risk monitoring table populated | Warning |
| `data_staleness_combined` | Both signals AND market data stale while active | **Critical → bot paused** |

### How incidents are created

Every non-ok check produces one row in `agent_incidents`:

```sql
SELECT severity, incident_type, title, status, detected_at, action_taken
FROM agent_incidents
WHERE user_id = '<UUID>'
ORDER BY detected_at DESC
LIMIT 20;
```

Each row contains:
- `severity` — `warning` or `critical`
- `incident_type` — check name (e.g. `daily_loss`, `pnl_consistency`)
- `title` — human-readable description of the anomaly
- `context` — structured JSONB with check-specific data
- `action_taken` — array of actions taken (e.g. `"Bot paused due to daily loss limit breach"`)
- `status` — defaults to `open`; set to `resolved` manually when fixed

### How to run manually

```bash
curl -X POST \
  https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/monitoring-agent \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "<YOUR_SUPABASE_USER_UUID>",
    "dry_run": true,
    "source": "manual"
  }'
```

### `dry_run` mode

When `dry_run: true`:
- **No DB writes** — incidents are logged to console only, `bot_config` is never updated.
- Returns the same JSON shape as a live run so you can inspect what would happen.
- Use this for testing and debugging.

### How it protects capital

On a **critical** breach the agent takes one safe action: `bot_config.is_active = false` (trading halts). It never modifies:
- strategies, risk settings, capital, or API keys
- executed_trades or trading_positions

### Scheduling

Run every 2–5 minutes via cron:

```
POST https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/monitoring-agent
Body: {"user_id":"<UUID>","source":"cron","dry_run":false}
```

---

## Daily reports

Reports are generated by `notification-engine` and **stored in the `daily_reports` table**.

### Store a report (DB only)

```bash
curl -X POST \
  https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/notification-engine \
  -H "Content-Type: application/json" \
  -d '{"action":"store_daily_report","user_id":"<UUID>"}'
```

Response includes the full report object with all 17 metrics.

### Query stored reports

```sql
SELECT date, total_pnl, win_rate, total_trades,
       open_positions_count, incidents_count, current_mode, bot_active_state
FROM daily_reports
WHERE user_id = '<UUID>'
ORDER BY date DESC
LIMIT 30;
```

### Schedule once daily

Run at market close or midnight UTC:

```
POST notification-engine
Body: {"action":"store_daily_report","user_id":"<UUID>"}
```

Schedule at `0 0 * * *` (midnight UTC) or at market close.

---

## Edge function secrets

| Secret | Used by | Description |
|--------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | `notification-engine`, `telegram-command-router` | Bot token from BotFather |
| `TELEGRAM_CHAT_ID` | `notification-engine`, `telegram-command-router` | Your Telegram chat ID |
| `TELEGRAM_USER_ID` | `telegram-command-router` | Your Supabase user UUID |
| `RESEND_API_KEY` | `notification-engine` | Resend.com email API key |
| `SUPABASE_URL` | all functions | Auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions | Auto-injected by Supabase |
