# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/547bc654-753b-46f3-8f8c-3836a9e33702

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/547bc654-753b-46f3-8f8c-3836a9e33702) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/547bc654-753b-46f3-8f8c-3836a9e33702) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

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

### How to run

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/monitoring-agent \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<UUID>","dry_run":true,"source":"manual"}'
```

---

## Daily reports

Store a daily trading summary to the `daily_reports` table:

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/notification-engine \
  -H "Content-Type: application/json" \
  -d '{"action":"store_daily_report","user_id":"<UUID>"}'
```

Query stored reports:
```sql
SELECT date, total_pnl, win_rate, total_trades, incidents_count, current_mode
FROM daily_reports WHERE user_id = '<UUID>' ORDER BY date DESC LIMIT 30;
```
