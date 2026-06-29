// =============================================================================
// Broker Audit Events
//
// Structured audit event types for all broker actions. These are consumed
// by the existing auditLogger.ts — we define the event shapes here and
// provide a helper to emit them.
// =============================================================================

import { auditLog, AuditCategory, AuditSeverity } from '../auditLogger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type BrokerAuditAction =
  | 'BROKER_SELECTED'
  | 'BROKER_HEALTHCHECK'
  | 'BROKER_CONNECT'
  | 'BROKER_FAILOVER'
  | 'BROKER_ADAPTER_FALLBACK'
  | 'ORDER_SUBMITTED'
  | 'ORDER_FILLED'
  | 'ORDER_CANCELLED'
  | 'ORDER_REJECTED'
  | 'ORDER_FAILED'
  | 'ORDER_MODIFIED'
  | 'ORDER_SIMULATED'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED'
  | 'BALANCE_FETCHED'
  | 'MARKET_DATA_FETCHED'
  | 'CREDENTIAL_VALIDATED'
  | 'RECONCILIATION_STARTED'
  | 'RECONCILIATION_SKIPPED'
  | 'RECONCILIATION_COMPLETED';

export interface BrokerAuditEvent {
  userId: string | null;
  action: BrokerAuditAction;
  brokerId: string;
  details: Record<string, unknown>;
}

export async function emitBrokerAudit(
  supabase: ReturnType<typeof createClient>,
  event: BrokerAuditEvent
): Promise<void> {
  const severityMap: Record<BrokerAuditAction, AuditSeverity> = {
    BROKER_SELECTED: AuditSeverity.INFO,
    BROKER_HEALTHCHECK: AuditSeverity.DEBUG,
    BROKER_CONNECT: AuditSeverity.INFO,
    BROKER_FAILOVER: AuditSeverity.WARNING,
    BROKER_ADAPTER_FALLBACK: AuditSeverity.WARNING,
    ORDER_SUBMITTED: AuditSeverity.INFO,
    ORDER_FILLED: AuditSeverity.INFO,
    ORDER_CANCELLED: AuditSeverity.INFO,
    ORDER_REJECTED: AuditSeverity.WARNING,
    ORDER_FAILED: AuditSeverity.CRITICAL,
    ORDER_MODIFIED: AuditSeverity.INFO,
    ORDER_SIMULATED: AuditSeverity.INFO,
    POSITION_OPENED: AuditSeverity.INFO,
    POSITION_CLOSED: AuditSeverity.INFO,
    BALANCE_FETCHED: AuditSeverity.DEBUG,
    MARKET_DATA_FETCHED: AuditSeverity.DEBUG,
    CREDENTIAL_VALIDATED: AuditSeverity.INFO,
    RECONCILIATION_STARTED: AuditSeverity.INFO,
    RECONCILIATION_SKIPPED: AuditSeverity.INFO,
    RECONCILIATION_COMPLETED: AuditSeverity.INFO,
  };

  await auditLog(supabase, {
    userId: event.userId,
    action: event.action,
    category: AuditCategory.TRADING,
    severity: severityMap[event.action] ?? AuditSeverity.INFO,
    details: { broker_id: event.brokerId, ...event.details },
  });
}
