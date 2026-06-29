// =============================================================================
// RECONCILIATION ENGINE — Phase 3: Daily Balance Reconciliation
//
// Actions:
//   run_reconciliation  — compare internal wallet balance against Kraken's
//                         reported balance; log discrepancies; optionally
//                         apply a reconciliation adjustment transaction
//   get_reconciliation_history — paginated reconciliation log
//
// Reconciliation logic:
//   1. Fetch the user's Kraken account balance via the signed API.
//   2. Compare to internal user_wallets.available_balance + locked_in_trades.
//   3. If the discrepancy exceeds DISCREPANCY_THRESHOLD_USD, log a CRITICAL
//      audit event and pause trading via the kill switch.
//   4. Write a row to reconciliation_log with status 'ok' or 'discrepancy'.
//   5. If auto_adjust is true and discrepancy is within SAFE_ADJUST_USD,
//      write a 'reconciliation' transaction to bring balances in sync.
//
// Security:
//   - All actions require a valid JWT.
//   - Kraken credentials are fetched per-user from secure-credentials.
//   - auto_adjust is disabled by default; must be explicitly requested.
// =============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { audit, AuditCategory, AuditSeverity, auditLog } from '../_shared/auditLogger.ts';
import { applyRateLimit, rateLimitConfigs } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Discrepancy above this threshold triggers a kill switch + CRITICAL alert
const DISCREPANCY_THRESHOLD_USD = 1.00;
// Discrepancy below this threshold can be auto-adjusted if requested
const SAFE_ADJUST_USD = 0.10;

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// ---------------------------------------------------------------------------
// Helper: fetch per-user Kraken credentials from secure-credentials
// ---------------------------------------------------------------------------
async function getKrakenCredentials(
  userId: string,
  token: string
): Promise<{ api_key: string; private_key: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const resp = await fetch(`${supabaseUrl}/functions/v1/secure-credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'get', key_type: 'kraken' }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.api_key || !data.private_key) return null;
  return { api_key: data.api_key, private_key: data.private_key };
}

// ---------------------------------------------------------------------------
// Helper: sign and call Kraken private API
// ---------------------------------------------------------------------------
async function krakenPrivateRequest(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
  privateKey: string
): Promise<Record<string, unknown>> {
  const nonce = Date.now().toString();
  const postData = new URLSearchParams({ nonce, ...params }).toString();
  const message = endpoint + await sha256(nonce + postData);

  const keyBytes = base64ToBytes(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC', cryptoKey, new TextEncoder().encode(message)
  );
  const sigBase64 = bytesToBase64(new Uint8Array(signature));

  const response = await fetch(`https://api.kraken.com/0/private/${endpoint}`, {
    method: 'POST',
    headers: {
      'API-Key': apiKey,
      'API-Sign': sigBase64,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  });

  return await response.json();
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return String.fromCharCode(...new Uint8Array(hashBuffer));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

// ---------------------------------------------------------------------------
// Helper: extract USD-equivalent balance from Kraken Balance response
// Kraken reports balances per asset (ZUSD, XXBT, etc.)
// ---------------------------------------------------------------------------
function extractKrakenUsdBalance(balances: Record<string, string>): number {
  // ZUSD is Kraken's USD balance
  const usd = parseFloat(balances['ZUSD'] ?? '0');
  // ZCAD is Canadian Dollar — convert at a conservative 1 CAD = 0.73 USD
  // In production this should use a live FX rate
  const cad = parseFloat(balances['ZCAD'] ?? '0') * 0.73;
  return usd + cad;
}

// ---------------------------------------------------------------------------
// Serve handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );

  try {
    // --- Auth: accept both user JWT and service role key (for scheduler calls) ---
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isServiceRole = token === SERVICE_ROLE_KEY && SERVICE_ROLE_KEY.length > 0;

    const body = await req.json();

    let userId: string;
    if (isServiceRole) {
      userId = body.user_id;
      if (!userId) {
        return new Response(JSON.stringify({ error: 'user_id required for service role calls' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else {
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      userId = user.id;

      try {
        const rateLimitResponse = await applyRateLimit(req, rateLimitConfigs.api, userId);
        if (rateLimitResponse) return rateLimitResponse;
      } catch (rlErr) {
        console.error('Rate limit error (non-fatal):', rlErr);
      }
    }

    const { action } = body;

    switch (action) {

      // -----------------------------------------------------------------------
      case 'run_reconciliation': {
        const { auto_adjust = false } = body;

        // 1. Fetch internal wallet balance
        const { data: wallet, error: walletError } = await supabaseAdmin
          .from('user_wallets')
          .select('*')
          .eq('user_id', userId)
          .eq('currency', 'USD')
          .maybeSingle();

        if (walletError || !wallet) {
          // No wallet = paper mode user without deposits; skip gracefully
          await supabaseAdmin.from('reconciliation_log').insert({
            user_id:               userId,
            kraken_balance_usd:    null,
            internal_balance_usd:  null,
            discrepancy_usd:       null,
            status:                'ok',
            notes:                 'Skipped: no wallet configured (paper mode)',
          });
          return new Response(JSON.stringify({
            success: true,
            status: 'skipped',
            reason: 'No wallet configured (paper mode)',
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const internalBalance =
          Number(wallet.available_balance) + Number(wallet.locked_in_trades);

        // 2. Fetch Kraken credentials
        const credentials = await getKrakenCredentials(userId, token);
        if (!credentials) {
          // No credentials = paper mode without exchange connection; skip gracefully
          await supabaseAdmin.from('reconciliation_log').insert({
            user_id:               userId,
            kraken_balance_usd:    null,
            internal_balance_usd:  internalBalance,
            discrepancy_usd:       null,
            status:                'ok',
            notes:                 'Skipped: Kraken credentials not configured (paper mode)',
          });
          return new Response(JSON.stringify({
            success: true,
            status: 'skipped',
            reason: 'Kraken credentials not configured (paper mode)',
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 3. Call Kraken Balance endpoint
        let krakenBalanceUsd: number;
        try {
          const krakenResp = await krakenPrivateRequest(
            'Balance', {}, credentials.api_key, credentials.private_key
          );

          if (krakenResp.error && Array.isArray(krakenResp.error) && krakenResp.error.length > 0) {
            throw new Error(`Kraken API error: ${krakenResp.error.join(', ')}`);
          }

          krakenBalanceUsd = extractKrakenUsdBalance(
            krakenResp.result as Record<string, string> ?? {}
          );
        } catch (krakenError) {
          await supabaseAdmin.from('reconciliation_log').insert({
            user_id:               userId,
            kraken_balance_usd:    null,
            internal_balance_usd:  internalBalance,
            discrepancy_usd:       null,
            status:                'error',
            notes:                 `Kraken API call failed: ${krakenError.message}`,
          });
          return new Response(JSON.stringify({
            error: 'Failed to fetch balance from Kraken',
          }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 4. Calculate discrepancy
        const discrepancy = Math.abs(krakenBalanceUsd - internalBalance);
        const discrepancyRaw = krakenBalanceUsd - internalBalance;
        const status = discrepancy > DISCREPANCY_THRESHOLD_USD ? 'discrepancy' : 'ok';

        // 5. Log reconciliation result
        await supabaseAdmin.from('reconciliation_log').insert({
          user_id:               userId,
          kraken_balance_usd:    krakenBalanceUsd,
          internal_balance_usd:  internalBalance,
          discrepancy_usd:       discrepancyRaw,
          status,
          notes: status === 'ok'
            ? `Balances match within $${DISCREPANCY_THRESHOLD_USD} threshold`
            : `Discrepancy of $${discrepancyRaw.toFixed(4)} detected`,
        });

        // 6. Handle discrepancy
        if (status === 'discrepancy') {
          // Activate kill switch to pause trading
          await supabaseAdmin
            .from('bot_config')
            .update({
              is_paused:     true,
              paused_reason: `RECONCILIATION_DISCREPANCY: internal=$${internalBalance.toFixed(2)} kraken=$${krakenBalanceUsd.toFixed(2)} diff=$${discrepancyRaw.toFixed(4)}`,
            })
            .eq('user_id', userId);

          await audit.killSwitchActivated(
            supabaseAdmin, userId,
            `Balance discrepancy: $${discrepancyRaw.toFixed(4)}`,
            'circuit_breaker'
          );

          await auditLog(supabaseAdmin, {
            userId,
            action: 'RECONCILIATION_DISCREPANCY',
            category: AuditCategory.RISK,
            severity: AuditSeverity.CRITICAL,
            details: {
              internal_balance: internalBalance,
              kraken_balance:   krakenBalanceUsd,
              discrepancy:      discrepancyRaw,
            }
          });

          return new Response(JSON.stringify({
            success: false,
            status: 'discrepancy',
            internal_balance:  internalBalance,
            kraken_balance:    krakenBalanceUsd,
            discrepancy:       discrepancyRaw,
            message: `CRITICAL: Balance discrepancy of $${discrepancyRaw.toFixed(4)} detected. Trading has been paused. Please review your account manually.`,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 7. Optional auto-adjustment for tiny rounding differences
        if (auto_adjust && discrepancy > 0 && discrepancy <= SAFE_ADJUST_USD) {
          const { data: walletRow } = await supabaseAdmin
            .from('user_wallets')
            .select('id, available_balance, total_deposited, total_withdrawn, total_realized_pnl, locked_in_trades, total_fees_paid')
            .eq('user_id', userId)
            .eq('currency', 'USD')
            .single();

          if (walletRow) {
            await supabaseAdmin.from('transactions').insert({
              user_id:          userId,
              wallet_id:        walletRow.id,
              transaction_type: 'reconciliation',
              amount:           discrepancyRaw,
              currency:         'USD',
              balance_before:   Number(walletRow.available_balance),
              balance_after:    Number(walletRow.available_balance) + discrepancyRaw,
              description:      `Auto-reconciliation adjustment of $${discrepancyRaw.toFixed(4)}`,
              metadata:         { kraken_balance: krakenBalanceUsd, internal_balance: internalBalance },
            });

            // Apply the adjustment to total_deposited (positive) or total_withdrawn (negative)
            if (discrepancyRaw > 0) {
              await supabaseAdmin
                .from('user_wallets')
                .update({ total_deposited: Number(walletRow.total_deposited) + discrepancyRaw })
                .eq('id', walletRow.id);
            } else {
              await supabaseAdmin
                .from('user_wallets')
                .update({ total_withdrawn: Number(walletRow.total_withdrawn) + Math.abs(discrepancyRaw) })
                .eq('id', walletRow.id);
            }
          }
        }

        await auditLog(supabaseAdmin, {
          userId,
          action: 'RECONCILIATION_OK',
          category: AuditCategory.SYSTEM,
          severity: AuditSeverity.INFO,
          details: { internal_balance: internalBalance, kraken_balance: krakenBalanceUsd, discrepancy: discrepancyRaw }
        });

        return new Response(JSON.stringify({
          success: true,
          status: 'ok',
          internal_balance:  internalBalance,
          kraken_balance:    krakenBalanceUsd,
          discrepancy:       discrepancyRaw,
          auto_adjusted:     auto_adjust && discrepancy <= SAFE_ADJUST_USD,
          message:           `Balances reconciled. Discrepancy: $${discrepancyRaw.toFixed(4)}`,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_reconciliation_history': {
        const { page = 1, per_page = 30 } = body;
        const offset = (page - 1) * per_page;

        const { data: logs, count, error: logError } = await supabaseAdmin
          .from('reconciliation_log')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('reconciled_at', { ascending: false })
          .range(offset, offset + per_page - 1);

        if (logError) throw new Error(`Failed to fetch reconciliation log: ${logError.message}`);

        return new Response(JSON.stringify({
          success: true,
          logs,
          total: count,
          page,
          per_page
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Reconciliation engine error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
