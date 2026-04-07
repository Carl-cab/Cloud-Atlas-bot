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

The `monitoring-agent` edge function runs 10 health checks and logs incidents to the `agent_incidents` table.

### Run manually

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

Use `"dry_run": true` to inspect results without writing to the DB or sending notifications.

### Scheduling (every 5 minutes)

Trigger on a `*/5 * * * *` cron schedule:

```
POST https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/monitoring-agent
Body: {"user_id":"<UUID>","source":"cron"}
```

### Health checks

| Check | Threshold | Action on breach |
|-------|-----------|-----------------|
| `bot_config` | Row must exist | Returns critical immediately |
| `signal_freshness` | Last signal ≤ 30 min (when active) | warning |
| `market_data_freshness` | Last data ≤ 30 min (when active) | warning |
| `position_count` | Open ≤ `max_positions` | warning |
| `daily_loss` | Loss ≤ `daily_stop_loss` % | critical → bot paused |
| `risk_limits` | No utilisation ≥ 100% | warning |
| `risk_events` | < 3 events/hr | warning |
| `notification_failures` | < 5 failures/hr | warning |
| `recent_trades` | Trade in last 4 h (live mode only) | warning |
| `symbol_concentration` | No symbol > 50% of positions | warning |
| `data_staleness_combined` | Both signals AND data stale while active | critical → bot paused |

### Querying incidents

```sql
SELECT severity, incident_type, title, status, detected_at
FROM agent_incidents
WHERE user_id = '<UUID>'
ORDER BY detected_at DESC
LIMIT 20;
```

---

## Daily reports

Reports are generated by `notification-engine` with action `generate_report` and now use **real data** from `daily_pnl`, `trading_positions`, `risk_events`, and `bot_config`.

### Run manually

```bash
curl -X POST \
  https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/notification-engine \
  -H "Content-Type: application/json" \
  -d '{
    "action": "generate_report",
    "user_id": "<UUID>",
    "report_type": "daily",
    "send_telegram": true,
    "send_email": false
  }'
```

### Schedule once daily

Trigger on a `0 8 * * *` cron schedule (8 AM UTC):

```
POST https://mhaggmeoxdepwyshkyff.supabase.co/functions/v1/notification-engine
Body: {"action":"generate_report","user_id":"<UUID>","report_type":"daily","send_telegram":true,"send_email":true}
```

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
