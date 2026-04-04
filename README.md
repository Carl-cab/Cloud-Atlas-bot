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
