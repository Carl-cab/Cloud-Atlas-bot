// =============================================================================
// Strategy Audit Events
//
// Defines audit actions for the Strategy Engine. Delegates to the shared
// auditLogger for persistence. Mirrors the broker/audit.ts pattern.
// =============================================================================

import { auditLog, AuditCategory, AuditSeverity } from '../auditLogger.ts';
import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type StrategyAuditAction =
  | 'STRATEGY_REGISTERED'
  | 'STRATEGY_UNREGISTERED'
  | 'STRATEGY_ENABLED'
  | 'STRATEGY_DISABLED'
  | 'STRATEGY_SIGNAL_GENERATED'
  | 'STRATEGY_SIGNAL_AGGREGATED'
  | 'STRATEGY_ERROR'
  | 'STRATEGY_PIPELINE_EXECUTED'
  | 'STRATEGY_PAUSE_RECOMMENDED'
  | 'STRATEGY_HEALTHCHECK';

export interface StrategyAuditEvent {
  action: StrategyAuditAction;
  userId: string;
  strategyId?: string;
  details?: Record<string, unknown>;
}

export async function emitStrategyAudit(
  supabase: ReturnType<typeof createClient>,
  event: StrategyAuditEvent
): Promise<void> {
  const severityMap: Record<StrategyAuditAction, AuditSeverity> = {
    STRATEGY_REGISTERED: AuditSeverity.INFO,
    STRATEGY_UNREGISTERED: AuditSeverity.INFO,
    STRATEGY_ENABLED: AuditSeverity.INFO,
    STRATEGY_DISABLED: AuditSeverity.WARNING,
    STRATEGY_SIGNAL_GENERATED: AuditSeverity.DEBUG,
    STRATEGY_SIGNAL_AGGREGATED: AuditSeverity.INFO,
    STRATEGY_ERROR: AuditSeverity.WARNING,
    STRATEGY_PIPELINE_EXECUTED: AuditSeverity.DEBUG,
    STRATEGY_PAUSE_RECOMMENDED: AuditSeverity.WARNING,
    STRATEGY_HEALTHCHECK: AuditSeverity.DEBUG,
  };

  await auditLog(supabase, {
    userId: event.userId,
    action: event.action,
    category: AuditCategory.TRADING,
    severity: severityMap[event.action] ?? AuditSeverity.INFO,
    details: {
      strategy_id: event.strategyId,
      ...event.details,
    },
  });
}
