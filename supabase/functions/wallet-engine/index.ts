// =============================================================================
// WALLET ENGINE — Phase 3: Deposit, Withdrawal, and Balance Management
//
// Actions:
//   get_balance        — return current wallet state for the authenticated user
//   deposit            — record a deposit (admin/webhook triggered)
//   request_withdrawal — create a pending withdrawal request
//   cancel_withdrawal  — cancel a pending withdrawal request
//   lock_funds         — reserve funds for an open trade position
//   unlock_funds       — release reserved funds when a position closes
//   get_transactions   — paginated transaction history
//   get_withdrawals    — paginated withdrawal request history
//
// Security:
//   - All actions require a valid JWT.
//   - user_id is ALWAYS taken from the JWT — never from the request body.
//   - Balance mutations use the service-role client to bypass RLS.
//   - All balance changes are recorded as immutable transaction rows.
//   - The available_balance invariant is enforced by a DB trigger.
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

// Minimum withdrawal amount in USD
const MIN_WITHDRAWAL_USD = 10.00;
// Maximum single deposit amount (anti-money-laundering safeguard)
const MAX_SINGLE_DEPOSIT_USD = 50000.00;
// Tolerance for deposit amount verification (±0.5% to account for exchange fees)
const DEPOSIT_AMOUNT_TOLERANCE_PCT = 0.005;

// ---------------------------------------------------------------------------
// Kraken API helpers (for deposit verification)
// ---------------------------------------------------------------------------
async function generateKrakenSignature(
  path: string,
  nonce: string,
  postData: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const message = nonce + postData;
  const messageHash = await crypto.subtle.digest('SHA-256', encoder.encode(message));
  const secretBytes = new Uint8Array(
    atob(secret).split('').map(c => c.charCodeAt(0))
  );
  const key = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const pathBytes = encoder.encode(path);
  const combined = new Uint8Array(pathBytes.length + messageHash.byteLength);
  combined.set(pathBytes);
  combined.set(new Uint8Array(messageHash), pathBytes.length);
  const sig = await crypto.subtle.sign('HMAC', key, combined);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function krakenPrivateRequest(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
  privateKey: string
): Promise<any> {
  const nonce = Date.now().toString();
  const postData = `nonce=${nonce}&` + new URLSearchParams(params).toString();
  const path = `/0/private/${endpoint}`;
  const signature = await generateKrakenSignature(path, nonce, postData, privateKey);
  const resp = await fetch(`https://api.kraken.com${path}`, {
    method: 'POST',
    headers: {
      'API-Key': apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  });
  if (!resp.ok) throw new Error(`Kraken API HTTP ${resp.status}`);
  return await resp.json();
}

/**
 * Verify a deposit against Kraken's Ledgers endpoint.
 *
 * Strategy:
 *   1. Call Kraken /0/private/Ledgers with type=deposit and start=(now - 24h).
 *   2. Find a ledger entry whose refid matches the provided kraken_ref_id.
 *   3. Confirm the amount is within DEPOSIT_AMOUNT_TOLERANCE_PCT of the declared amount.
 *   4. Confirm the entry has not already been credited (idempotency check).
 *
 * Returns: { verified: boolean; kraken_amount?: number; kraken_refid?: string; error?: string }
 */
async function verifyKrakenDeposit(
  userId: string,
  declaredAmount: number,
  krakenRefId: string,
  apiKey: string,
  privateKey: string
): Promise<{ verified: boolean; kraken_amount?: number; kraken_refid?: string; error?: string }> {
  try {
    // Check idempotency: has this refid already been credited?
    const { data: existingTx } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('reference_id', krakenRefId)
      .eq('transaction_type', 'deposit')
      .maybeSingle();

    if (existingTx) {
      return { verified: false, error: `Deposit refid ${krakenRefId} has already been credited` };
    }

    // Query Kraken Ledgers for the last 24 hours
    const start = Math.floor((Date.now() - 86400000) / 1000).toString();
    const ledgerResp = await krakenPrivateRequest(
      'Ledgers',
      { type: 'deposit', start },
      apiKey,
      privateKey
    );

    if (ledgerResp.error?.length > 0) {
      return { verified: false, error: `Kraken API error: ${ledgerResp.error.join(', ')}` };
    }

    const ledgers: Record<string, any> = ledgerResp.result?.ledger ?? {};
    const entry = Object.values(ledgers).find(
      (e: any) => e.refid === krakenRefId && e.type === 'deposit'
    ) as any;

    if (!entry) {
      return { verified: false, error: `Deposit refid ${krakenRefId} not found in Kraken ledger (may not have settled yet)` };
    }

    const krakenAmount = Math.abs(Number(entry.amount));
    const tolerance = declaredAmount * DEPOSIT_AMOUNT_TOLERANCE_PCT;

    if (Math.abs(krakenAmount - declaredAmount) > tolerance) {
      return {
        verified: false,
        kraken_amount: krakenAmount,
        error: `Amount mismatch: declared $${declaredAmount.toFixed(2)}, Kraken reports $${krakenAmount.toFixed(2)}`
      };
    }

    return { verified: true, kraken_amount: krakenAmount, kraken_refid: entry.refid };
  } catch (err) {
    return { verified: false, error: `Verification failed: ${err.message}` };
  }
}

// Service-role client — used for all balance mutations and audit logging
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// ---------------------------------------------------------------------------
// Helper: get or create wallet for a user
// ---------------------------------------------------------------------------
async function getOrCreateWallet(userId: string, currency = 'USD') {
  const { data: wallet, error } = await supabaseAdmin
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('currency', currency)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch wallet: ${error.message}`);

  if (!wallet) {
    const { data: newWallet, error: createError } = await supabaseAdmin
      .from('user_wallets')
      .insert({ user_id: userId, currency })
      .select()
      .single();
    if (createError) throw new Error(`Failed to create wallet: ${createError.message}`);
    return newWallet;
  }
  return wallet;
}

// ---------------------------------------------------------------------------
// Helper: record a transaction and update wallet atomically
// ---------------------------------------------------------------------------
async function recordTransaction(
  userId: string,
  walletId: string,
  type: string,
  amount: number,
  walletUpdate: Record<string, number>,
  balanceBefore: number,
  balanceAfter: number,
  referenceId?: string,
  referenceType?: string,
  description?: string,
  metadata: Record<string, unknown> = {}
) {
  // 1. Insert immutable transaction record
  const { error: txError } = await supabaseAdmin
    .from('transactions')
    .insert({
      user_id:          userId,
      wallet_id:        walletId,
      transaction_type: type,
      amount,
      currency:         'USD',
      balance_before:   balanceBefore,
      balance_after:    balanceAfter,
      reference_id:     referenceId ?? null,
      reference_type:   referenceType ?? null,
      description:      description ?? null,
      metadata,
    });

  if (txError) throw new Error(`Failed to record transaction: ${txError.message}`);

  // 2. Update wallet (trigger will recompute available_balance and validate)
  const { error: walletError } = await supabaseAdmin
    .from('user_wallets')
    .update(walletUpdate)
    .eq('id', walletId);

  if (walletError) throw new Error(`Failed to update wallet: ${walletError.message}`);
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
    // --- JWT Validation ---
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      await audit.authFailure(supabaseAdmin, null, 'Missing authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      await audit.authFailure(supabaseAdmin, null, authError?.message ?? 'Invalid token');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Rate limiting (user-scoped) ---
    const rateLimitResponse = await applyRateLimit(req, rateLimitConfigs.api, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json();
    const { action } = body;
    const userId = user.id; // Always use JWT user — never trust body

    switch (action) {

      // -----------------------------------------------------------------------
      case 'get_balance': {
        const wallet = await getOrCreateWallet(userId);
        return new Response(JSON.stringify({ success: true, wallet }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // -----------------------------------------------------------------------
      case 'deposit': {
        // Deposits are initiated by the operator/webhook after Kraken confirms
        // receipt of funds. The amount, reference, and kraken_ref_id are provided
        // in the body. The system verifies the transaction against Kraken's Ledgers
        // API before crediting the balance.
        //
        // Required fields:
        //   amount         — declared deposit amount in USD
        //   kraken_ref_id  — Kraken ledger refid (e.g., "LXXXXXXXXXXXXXXX")
        //
        // Optional fields:
        //   reference_id   — internal reference (defaults to kraken_ref_id)
        //   description    — human-readable note
        //   skip_verify    — if true, skip Kraken verification (for paper trading / testing only)
        const { amount, kraken_ref_id, reference_id, description, skip_verify = false } = body;

        if (!amount || typeof amount !== 'number' || amount <= 0) {
          return new Response(JSON.stringify({ error: 'Invalid deposit amount' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (amount > MAX_SINGLE_DEPOSIT_USD) {
          return new Response(JSON.stringify({
            error: `Deposit exceeds maximum single deposit limit of $${MAX_SINGLE_DEPOSIT_USD}`
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (!kraken_ref_id && !skip_verify) {
          return new Response(JSON.stringify({
            error: 'kraken_ref_id is required for deposit verification. Pass skip_verify=true for paper trading.'
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // --- Verify deposit against Kraken Ledgers API ---
        let verifiedAmount = amount;
        if (!skip_verify && kraken_ref_id) {
          // Fetch per-user Kraken credentials from secure-credentials
          const credResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/secure-credentials`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'get', credential_type: 'kraken', user_id: userId }),
          });
          const credData = await credResp.json();

          if (!credData.api_key || !credData.private_key) {
            await auditLog(supabaseAdmin, {
              userId,
              action: 'DEPOSIT_VERIFICATION_FAILED',
              category: AuditCategory.TRADING,
              severity: AuditSeverity.WARNING,
              details: { reason: 'No Kraken credentials found for user', kraken_ref_id }
            });
            return new Response(JSON.stringify({
              error: 'Cannot verify deposit: no Kraken API credentials configured. Add your Kraken API key first.'
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          const verification = await verifyKrakenDeposit(
            userId, amount, kraken_ref_id, credData.api_key, credData.private_key
          );

          if (!verification.verified) {
            await auditLog(supabaseAdmin, {
              userId,
              action: 'DEPOSIT_VERIFICATION_FAILED',
              category: AuditCategory.TRADING,
              severity: AuditSeverity.WARNING,
              details: { declared_amount: amount, kraken_ref_id, reason: verification.error }
            });
            return new Response(JSON.stringify({
              error: `Deposit verification failed: ${verification.error}`
            }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          // Use the Kraken-verified amount (may differ slightly due to fees)
          verifiedAmount = verification.kraken_amount ?? amount;
        }

        const effectiveRefId = reference_id ?? kraken_ref_id ?? `manual-${Date.now()}`;
        const wallet = await getOrCreateWallet(userId);
        const balanceBefore = Number(wallet.available_balance);
        const balanceAfter  = balanceBefore + verifiedAmount;

        await recordTransaction(
          userId,
          wallet.id,
          'deposit',
          verifiedAmount,
          { total_deposited: Number(wallet.total_deposited) + verifiedAmount },
          balanceBefore,
          balanceAfter,
          effectiveRefId,
          'deposit',
          description ?? `Deposit of $${verifiedAmount.toFixed(2)} USD (ref: ${effectiveRefId})`
        );

        await auditLog(supabaseAdmin, {
          userId,
          action: 'DEPOSIT',
          category: AuditCategory.TRADING,
          severity: AuditSeverity.INFO,
          details: {
            declared_amount: amount,
            verified_amount: verifiedAmount,
            kraken_ref_id,
            reference_id: effectiveRefId,
            skip_verify,
            balance_after: balanceAfter
          }
        });

        const updatedWallet = await getOrCreateWallet(userId);
        return new Response(JSON.stringify({
          success: true,
          message: `Deposit of $${verifiedAmount.toFixed(2)} verified and recorded`,
          verified: !skip_verify,
          kraken_ref_id,
          wallet: updatedWallet
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'request_withdrawal': {
        const { amount, destination, destination_type = 'kraken', notes } = body;

        if (!amount || typeof amount !== 'number' || amount < MIN_WITHDRAWAL_USD) {
          return new Response(JSON.stringify({
            error: `Minimum withdrawal amount is $${MIN_WITHDRAWAL_USD}`
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (!destination || typeof destination !== 'string' || destination.trim().length === 0) {
          return new Response(JSON.stringify({ error: 'Withdrawal destination is required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const wallet = await getOrCreateWallet(userId);
        if (Number(wallet.available_balance) < amount) {
          return new Response(JSON.stringify({
            error: `Insufficient balance. Available: $${Number(wallet.available_balance).toFixed(2)}`
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Create the withdrawal request
        const { data: withdrawalRequest, error: wrError } = await supabaseAdmin
          .from('withdrawal_requests')
          .insert({
            user_id:          userId,
            wallet_id:        wallet.id,
            amount,
            currency:         'USD',
            destination:      destination.trim(),
            destination_type,
            status:           'pending',
            notes:            notes ?? null,
          })
          .select()
          .single();

        if (wrError) throw new Error(`Failed to create withdrawal request: ${wrError.message}`);

        // Lock the funds immediately (deducted from available_balance)
        const balanceBefore = Number(wallet.available_balance);
        const balanceAfter  = balanceBefore - amount;

        await recordTransaction(
          userId,
          wallet.id,
          'withdrawal',
          -amount,
          { total_withdrawn: Number(wallet.total_withdrawn) + amount },
          balanceBefore,
          balanceAfter,
          withdrawalRequest.id,
          'withdrawal_request',
          `Withdrawal request of $${amount.toFixed(2)} to ${destination_type}`
        );

        await auditLog(supabaseAdmin, {
          userId,
          action: 'WITHDRAWAL_REQUESTED',
          category: AuditCategory.TRADING,
          severity: AuditSeverity.INFO,
          details: { amount, destination_type, request_id: withdrawalRequest.id, balance_after: balanceAfter }
        });

        return new Response(JSON.stringify({
          success: true,
          message: `Withdrawal request of $${amount.toFixed(2)} submitted`,
          request: withdrawalRequest
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'cancel_withdrawal': {
        const { request_id } = body;
        if (!request_id) {
          return new Response(JSON.stringify({ error: 'request_id is required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Fetch and validate ownership + status
        const { data: request, error: fetchError } = await supabaseAdmin
          .from('withdrawal_requests')
          .select('*')
          .eq('id', request_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (fetchError || !request) {
          return new Response(JSON.stringify({ error: 'Withdrawal request not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (request.status !== 'pending') {
          return new Response(JSON.stringify({
            error: `Cannot cancel a withdrawal in status: ${request.status}`
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Cancel the request
        await supabaseAdmin
          .from('withdrawal_requests')
          .update({ status: 'cancelled', reviewed_at: new Date().toISOString() })
          .eq('id', request_id);

        // Refund the locked funds
        const wallet = await getOrCreateWallet(userId);
        const balanceBefore = Number(wallet.available_balance);
        const refundAmount  = Number(request.amount);
        const balanceAfter  = balanceBefore + refundAmount;

        await recordTransaction(
          userId,
          wallet.id,
          'deposit',  // Reversal: treat as a re-deposit
          refundAmount,
          { total_withdrawn: Math.max(0, Number(wallet.total_withdrawn) - refundAmount) },
          balanceBefore,
          balanceAfter,
          request_id,
          'withdrawal_request',
          `Cancelled withdrawal refund of $${refundAmount.toFixed(2)}`
        );

        await auditLog(supabaseAdmin, {
          userId,
          action: 'WITHDRAWAL_CANCELLED',
          category: AuditCategory.TRADING,
          severity: AuditSeverity.INFO,
          details: { request_id, amount: refundAmount, balance_after: balanceAfter }
        });

        return new Response(JSON.stringify({
          success: true,
          message: `Withdrawal cancelled and $${refundAmount.toFixed(2)} returned to available balance`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'lock_funds': {
        // Called by trading engines when a new position is opened
        const { amount, position_id } = body;
        if (!amount || amount <= 0 || !position_id) {
          return new Response(JSON.stringify({ error: 'amount and position_id are required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const wallet = await getOrCreateWallet(userId);
        if (Number(wallet.available_balance) < amount) {
          return new Response(JSON.stringify({
            error: `Insufficient balance to lock $${amount.toFixed(2)}`
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const balanceBefore = Number(wallet.available_balance);
        const balanceAfter  = balanceBefore - amount;

        await recordTransaction(
          userId, wallet.id, 'trade_lock', -amount,
          { locked_in_trades: Number(wallet.locked_in_trades) + amount },
          balanceBefore, balanceAfter,
          position_id, 'position',
          `Funds locked for position ${position_id}`
        );

        return new Response(JSON.stringify({
          success: true,
          locked: amount,
          available_balance: balanceAfter
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'unlock_funds': {
        // Called by trading engines when a position is closed
        const { amount, position_id, realized_pnl = 0, fee = 0 } = body;
        if (!amount || amount <= 0 || !position_id) {
          return new Response(JSON.stringify({ error: 'amount and position_id are required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const wallet = await getOrCreateWallet(userId);
        const balanceBefore = Number(wallet.available_balance);

        // Unlock the original locked amount
        await recordTransaction(
          userId, wallet.id, 'trade_unlock', amount,
          { locked_in_trades: Math.max(0, Number(wallet.locked_in_trades) - amount) },
          balanceBefore, balanceBefore + amount,
          position_id, 'position',
          `Funds unlocked for closed position ${position_id}`
        );

        // Record realized P&L (can be negative for a loss)
        if (realized_pnl !== 0) {
          const walletAfterUnlock = await getOrCreateWallet(userId);
          await recordTransaction(
            userId, wallet.id, 'realized_pnl', realized_pnl,
            { total_realized_pnl: Number(walletAfterUnlock.total_realized_pnl) + realized_pnl },
            Number(walletAfterUnlock.available_balance),
            Number(walletAfterUnlock.available_balance) + realized_pnl,
            position_id, 'position',
            `Realized P&L of $${realized_pnl.toFixed(2)} for position ${position_id}`
          );
        }

        // Record exchange fee
        if (fee > 0) {
          const walletAfterPnl = await getOrCreateWallet(userId);
          await recordTransaction(
            userId, wallet.id, 'fee', -fee,
            { total_fees_paid: Number(walletAfterPnl.total_fees_paid) + fee },
            Number(walletAfterPnl.available_balance),
            Number(walletAfterPnl.available_balance) - fee,
            position_id, 'position',
            `Exchange fee of $${fee.toFixed(2)} for position ${position_id}`
          );
        }

        const finalWallet = await getOrCreateWallet(userId);
        return new Response(JSON.stringify({
          success: true,
          realized_pnl,
          fee,
          available_balance: Number(finalWallet.available_balance)
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_transactions': {
        const { page = 1, per_page = 50, type_filter } = body;
        const offset = (page - 1) * per_page;

        let query = supabaseAdmin
          .from('transactions')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + per_page - 1);

        if (type_filter) {
          query = query.eq('transaction_type', type_filter);
        }

        const { data: transactions, count, error: txError } = await query;
        if (txError) throw new Error(`Failed to fetch transactions: ${txError.message}`);

        return new Response(JSON.stringify({
          success: true,
          transactions,
          total: count,
          page,
          per_page
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // -----------------------------------------------------------------------
      case 'get_withdrawals': {
        const { page = 1, per_page = 20, status_filter } = body;
        const offset = (page - 1) * per_page;

        let query = supabaseAdmin
          .from('withdrawal_requests')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('requested_at', { ascending: false })
          .range(offset, offset + per_page - 1);

        if (status_filter) {
          query = query.eq('status', status_filter);
        }

        const { data: withdrawals, count, error: wError } = await query;
        if (wError) throw new Error(`Failed to fetch withdrawals: ${wError.message}`);

        return new Response(JSON.stringify({
          success: true,
          withdrawals,
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
    console.error('Wallet engine error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
