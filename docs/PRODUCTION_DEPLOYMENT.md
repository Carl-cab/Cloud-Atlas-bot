# Cloud Atlas Bot — Production Deployment Guide

This guide details the exact steps required to deploy Cloud Atlas Bot securely to production. It covers environment configuration, database migration, edge function deployment, and pre-flight health checks.

---

## 1. Environment Configuration

The application requires several environment variables to be set securely. **Never commit `.env` to version control.** All secrets must be configured directly in the Supabase Dashboard and your hosting provider (e.g., Vercel, Netlify).

### Supabase Edge Functions Secrets
Configure these in the Supabase Dashboard (`Project Settings -> Edge Functions -> Secrets`) or via CLI:
```bash
supabase secrets set --env-file .env.production
```

| Variable | Type | Required | Description |
|---|---|---|---|
| `SUPABASE_URL` | URL | **Yes** | Your Supabase project URL (e.g., `https://xyz.supabase.co`) |
| `SUPABASE_ANON_KEY` | String | **Yes** | The public anon key for client-side auth |
| `SUPABASE_SERVICE_ROLE_KEY` | String | **Yes** | The secret service role key (bypasses RLS) |
| `ENCRYPTION_KEY` | Base64 | **Yes** | 32-byte cryptographic key for encrypting exchange API keys |
| `RESEND_API_KEY` | String | No | API key for sending email notifications |
| `TELEGRAM_BOT_TOKEN` | String | No | Bot token for Telegram alerts |

**Generating a secure ENCRYPTION_KEY:**
```bash
openssl rand -base64 32
```

### Frontend Environment Variables
Configure these in your hosting provider (Vercel/Netlify):

| Variable | Type | Required | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | URL | **Yes** | Matches `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | String | **Yes** | Matches `SUPABASE_ANON_KEY` |

---

## 2. Database Migrations

Before deploying the frontend or edge functions, you must apply the Phase 1-4 security and architecture migrations.

1. Ensure your local Supabase CLI is linked to your production project:
   ```bash
   supabase link --project-ref <your-project-id>
   ```
2. Push the migrations to the production database:
   ```bash
   supabase db push
   ```
3. Verify that all tables (`user_wallets`, `transactions`, `deployment_checks`, etc.) exist in the Supabase Dashboard.

---

## 3. Supabase Authentication Settings

The Phase 4 security hardening requires specific Authentication settings that **cannot be set via SQL migrations**. You must configure these manually in the Supabase Dashboard (`Authentication -> Settings`):

1. **JWT Expiry:** Set to `3600` seconds (1 hour).
2. **Refresh Token Rotation:** Ensure this is **Enabled**.
3. **Reuse Interval:** Set to `10` seconds.
4. **Email Confirmations:** Ensure "Enable Email Confirmations" is **Enabled**.
5. **Secure Email Change:** Ensure "Enable Secure Email Change" is **Enabled**.

---

## 4. Edge Function Deployment

All edge functions must be deployed with JWT verification enabled (configured in `supabase/config.toml`).

1. Deploy all edge functions to production:
   ```bash
   supabase functions deploy
   ```
2. Verify that the `health-check` function is successfully deployed.

---

## 5. Pre-Flight Health Check

Cloud Atlas Bot includes a built-in pre-flight health check engine that validates the production environment.

1. Obtain a valid JWT token by logging into the frontend.
2. Invoke the `health-check` edge function:
   ```bash
   curl -X POST https://<your-project-id>.supabase.co/functions/v1/health-check \
     -H "Authorization: Bearer <your-jwt-token>" \
     -H "Content-Type: application/json" \
     -d '{"action": "run_checks"}'
   ```
3. **Analyze the Response:**
   The response will contain a `summary` object and an `overall_status`.
   - If `overall_status` is `fail`, you **must** resolve the listed errors before proceeding.
   - If `overall_status` is `warn`, review the warnings (e.g., missing Telegram token) but you may proceed.
   - If `overall_status` is `pass`, the system is fully configured and ready for live trading.

---

## 6. Frontend Deployment

Once the health check passes, deploy the frontend application.

1. Ensure the `Content-Security-Policy` meta tag in `index.html` is updated with your specific Supabase project URL.
2. Build the production assets:
   ```bash
   npm run build
   ```
3. Deploy the `dist` directory to your hosting provider.

---

## 7. Post-Deployment Verification

1. Create a test user account.
2. Verify that the test user receives an empty `USD` wallet in `user_wallets`.
3. Attempt to add an Exchange API key and verify it is successfully encrypted.
4. Enable the bot in **Paper Trading Mode** and verify that mock trades are executed and recorded in `executed_trades` without errors.
