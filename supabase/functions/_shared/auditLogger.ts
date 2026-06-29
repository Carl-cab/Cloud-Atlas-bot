// =============================================================================
// PHASE 2: Shared Audit Logger
//
// Provides a single, consistent interface for writing to security_audit_log
// from any edge function. All critical trading and security events MUST be
// logged through this module.
//
// Usage:
//   import { auditLog, AuditCategory, AuditSeverity } from '../_shared/auditLogger.ts';
//   await auditLog(supabase, {
//     userId: user.id,
//     action: 'TRADE_REJECTED',
//     category: AuditCategory.TRADING,
//     severity: AuditSeverity.WARNING,
//     details: { reason: riskEval.reason, symbol, signal_id: latestSignal.id }
//   });
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export enum AuditCategory {
  SECURITY  = 'security',
  TRADING   = 'trading',
  RISK      = 'risk',
  AUTH      = 'auth',
  SYSTEM    = 'system',
}

export enum AuditSeverity {
  DEBUG    = 'debug',
  INFO     = 'info',
  WARNING  = 'warning',
  CRITICAL = 'critical',
}

export interface AuditEntry {
  userId: string | null;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Write a structured audit log entry to security_audit_log.
 * Uses the service-role client to bypass RLS (the table is write-restricted
 * to service_role only after the Phase 1 migration).
 * Never throws — failures are logged to console only so they never block
 * the calling function's primary flow.
 */
export async function auditLog(
  supabaseServiceRole: ReturnType<typeof createClient>,
  entry: AuditEntry
): Promise<void> {
  try {
    const { error } = await supabaseServiceRole
      .from('security_audit_log')
      .insert({
        user_id:        entry.userId,
        action:         entry.action,
        event_category: entry.category,
        severity_level: entry.severity,
        details:        entry.details ?? {},
        ip_address:     entry.ipAddress ?? null,
        created_at:     new Date().toISOString(),
      });

    if (error) {
      console.error('[auditLog] Failed to write audit entry:', error.message);
    }
  } catch (err) {
    console.error('[auditLog] Unexpected error:', err);
  }
}

/**
 * Convenience wrappers for common event types
 */
export const audit = {
  authFailure: (
    supabase: ReturnType<typeof createClient>,
    userId: string | null,
    reason: string,
    ipAddress?: string
  ) => auditLog(supabase, {
    userId,
    action: 'AUTH_FAILURE',
    category: AuditCategory.AUTH,
    severity: AuditSeverity.WARNING,
    details: { reason },
    ipAddress,
  }),

  authSuccess: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    ipAddress?: string
  ) => auditLog(supabase, {
    userId,
    action: 'AUTH_SUCCESS',
    category: AuditCategory.AUTH,
    severity: AuditSeverity.INFO,
    ipAddress,
  }),

  killSwitchActivated: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    reason: string,
    trigger: 'manual' | 'daily_loss' | 'circuit_breaker'
  ) => auditLog(supabase, {
    userId,
    action: 'KILL_SWITCH_ACTIVATED',
    category: AuditCategory.RISK,
    severity: AuditSeverity.CRITICAL,
    details: { reason, trigger },
  }),

  circuitBreakerTriggered: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    lossAmount: number,
    threshold: number
  ) => auditLog(supabase, {
    userId,
    action: 'CIRCUIT_BREAKER_TRIGGERED',
    category: AuditCategory.RISK,
    severity: AuditSeverity.CRITICAL,
    details: { loss_amount: lossAmount, threshold_fraction: threshold },
  }),

  tradeRejected: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    reason: string,
    signal: Record<string, unknown>
  ) => auditLog(supabase, {
    userId,
    action: 'TRADE_REJECTED',
    category: AuditCategory.TRADING,
    severity: AuditSeverity.WARNING,
    details: { reason, signal },
  }),

  tradeFailed: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    errorMessage: string,
    orderRequest: Record<string, unknown>
  ) => auditLog(supabase, {
    userId,
    action: 'TRADE_FAILED',
    category: AuditCategory.TRADING,
    severity: AuditSeverity.CRITICAL,
    // SECURITY: Sanitize orderRequest to avoid logging API keys or secrets
    details: {
      error: errorMessage,
      symbol: orderRequest.symbol,
      side: orderRequest.side,
      type: orderRequest.type,
      quantity: orderRequest.quantity,
    },
  }),

  tradeExecuted: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    orderId: string,
    symbol: string,
    side: string,
    quantity: number,
    price: number,
    isIdempotent: boolean
  ) => auditLog(supabase, {
    userId,
    action: 'TRADE_EXECUTED',
    category: AuditCategory.TRADING,
    severity: AuditSeverity.INFO,
    details: { order_id: orderId, symbol, side, quantity, price, idempotent: isIdempotent },
  }),

  decryptionFailure: (
    supabase: ReturnType<typeof createClient>,
    userId: string
  ) => auditLog(supabase, {
    userId,
    action: 'DECRYPTION_FAILURE',
    category: AuditCategory.SECURITY,
    severity: AuditSeverity.CRITICAL,
    details: { message: 'Credential decryption failed \u2014 user must re-enter API keys' },
  }),

  unauthorizedAccess: (
    supabase: ReturnType<typeof createClient>,
    authenticatedUserId: string,
    requestedUserId: string,
    action: string,
    ipAddress?: string
  ) => auditLog(supabase, {
    userId: authenticatedUserId,
    action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
    category: AuditCategory.SECURITY,
    severity: AuditSeverity.CRITICAL,
    details: { authenticated_user: authenticatedUserId, requested_user: requestedUserId, attempted_action: action },
    ipAddress,
  }),

  cooldownEngaged: (
    supabase: ReturnType<typeof createClient>,
    userId: string,
    reason: string,
    cooldownMs: number,
    details: Record<string, unknown>
  ) => auditLog(supabase, {
    userId,
    action: 'COOLDOWN_ENGAGED',
    category: AuditCategory.RISK,
    severity: AuditSeverity.WARNING,
    details: { reason, cooldown_minutes: Math.round(cooldownMs / 60000), ...details },
  }),
};
