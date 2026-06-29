import { describe, it, expect } from 'vitest';

/**
 * Phase 3 Monitor Evidence Logic Tests
 *
 * Verifies that the monitor's evidence detection logic correctly identifies
 * pass/fail conditions for each Phase 3 criterion. These tests simulate
 * the same classification logic the shell script uses.
 */

// --- Simulated DB query results ---

interface ExecutedTrade {
  id: string;
  kraken_order_id: string;
  timestamp: string;
  symbol?: string;
}

interface AuditEntry {
  id: string;
  action: string;
  created_at: string;
  details?: Record<string, unknown>;
}

interface RiskCooldown {
  id: string;
  reason: string;
  engaged_at: string;
  resolved: boolean;
}

interface Position {
  id: string;
  risk_amount: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}

interface BrokerOrder {
  id: string;
  broker_id: string;
  status: string;
}

// --- Evidence classification functions (mirror monitor logic) ---

function classifyTradeDays(trades: ExecutedTrade[]): { count: number; dates: string[] } {
  const dates = new Set<string>();
  for (const t of trades) {
    if (t.timestamp) dates.add(t.timestamp.slice(0, 10));
  }
  const sorted = Array.from(dates).sort();
  return { count: sorted.length, dates: sorted };
}

function classifyRiskCoverage(
  trades: ExecutedTrade[],
  auditEntries: AuditEntry[],
  positions: Position[]
): 'pass_audit' | 'pass_positions' | 'partial' | 'no_data' {
  const riskDecisions = auditEntries.filter(
    e => e.action === 'PAPER_TRADE_EXECUTED' || e.action === 'TRADE_REJECTED'
  );
  if (riskDecisions.length > 0 && riskDecisions.length >= trades.length) {
    return 'pass_audit';
  }
  const positionsWithRisk = positions.filter(
    p => p.risk_amount !== null && p.stop_loss !== null
  );
  if (positionsWithRisk.length > 0 && positionsWithRisk.length >= positions.length) {
    return 'pass_positions';
  }
  if (riskDecisions.length === 0 && positionsWithRisk.length === 0) {
    return 'no_data';
  }
  return 'partial';
}

function classifyCooldownEvidence(
  auditCooldowns: AuditEntry[],
  riskCooldowns: RiskCooldown[]
): { pass: boolean; source: string } {
  if (auditCooldowns.length > 0) {
    return { pass: true, source: 'security_audit_log' };
  }
  if (riskCooldowns.length > 0) {
    return { pass: true, source: 'risk_cooldowns' };
  }
  return { pass: false, source: 'none' };
}

function classifyNoRealOrders(
  trades: ExecutedTrade[],
  brokerOrders: BrokerOrder[],
  isPaper: boolean
): { pass: boolean; liveTradeCount: number; brokerOrderCount: number } {
  const nonPaper = trades.filter(
    t => t.kraken_order_id && !t.kraken_order_id.startsWith('paper-')
  );
  const krakenOrders = brokerOrders.filter(o => o.broker_id === 'kraken');
  return {
    pass: nonPaper.length === 0 && krakenOrders.length === 0 && isPaper,
    liveTradeCount: nonPaper.length,
    brokerOrderCount: krakenOrders.length,
  };
}

// ==========================================================================
// Tests
// ==========================================================================

describe('Phase 3: Monitor Evidence Logic', () => {

  describe('1. Trading Days', () => {
    it('counts distinct dates from trade timestamps', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1', timestamp: '2026-07-01T10:00:00Z' },
        { id: '2', kraken_order_id: 'paper-2', timestamp: '2026-07-01T14:00:00Z' },
        { id: '3', kraken_order_id: 'paper-3', timestamp: '2026-07-02T09:00:00Z' },
        { id: '4', kraken_order_id: 'paper-4', timestamp: '2026-07-03T11:00:00Z' },
      ];
      const result = classifyTradeDays(trades);
      expect(result.count).toBe(3);
      expect(result.dates).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    });

    it('returns 0 for empty trades', () => {
      expect(classifyTradeDays([]).count).toBe(0);
    });

    it('7 distinct days passes the criterion', () => {
      const trades: ExecutedTrade[] = Array.from({ length: 7 }, (_, i) => ({
        id: `${i}`,
        kraken_order_id: `paper-${i}`,
        timestamp: `2026-07-0${i + 1}T10:00:00Z`,
      }));
      expect(classifyTradeDays(trades).count).toBe(7);
    });

    it('multiple trades on same day count as one day', () => {
      const trades: ExecutedTrade[] = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        kraken_order_id: `paper-${i}`,
        timestamp: '2026-07-01T10:00:00Z',
      }));
      expect(classifyTradeDays(trades).count).toBe(1);
    });
  });

  describe('2. Risk Check Coverage', () => {
    it('pass_audit when audit entries >= trade count', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1', timestamp: '2026-07-01T10:00:00Z' },
      ];
      const audit: AuditEntry[] = [
        { id: 'a1', action: 'PAPER_TRADE_EXECUTED', created_at: '2026-07-01T10:00:01Z' },
      ];
      expect(classifyRiskCoverage(trades, audit, [])).toBe('pass_audit');
    });

    it('pass_audit when rejections + executions cover all trades', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1', timestamp: '2026-07-01T10:00:00Z' },
      ];
      const audit: AuditEntry[] = [
        { id: 'a1', action: 'TRADE_REJECTED', created_at: '2026-07-01T09:00:00Z' },
        { id: 'a2', action: 'PAPER_TRADE_EXECUTED', created_at: '2026-07-01T10:00:01Z' },
      ];
      expect(classifyRiskCoverage(trades, audit, [])).toBe('pass_audit');
    });

    it('pass_positions when all positions have risk fields', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1', timestamp: '2026-07-01T10:00:00Z' },
      ];
      const positions: Position[] = [
        { id: 'p1', risk_amount: 50, stop_loss: 64000, take_profit: 68000 },
      ];
      expect(classifyRiskCoverage(trades, [], positions)).toBe('pass_positions');
    });

    it('no_data when no evidence exists', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1', timestamp: '2026-07-01T10:00:00Z' },
      ];
      expect(classifyRiskCoverage(trades, [], [])).toBe('no_data');
    });

    it('partial when fewer audit entries than trades', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1', timestamp: '2026-07-01T10:00:00Z' },
        { id: '2', kraken_order_id: 'paper-2', timestamp: '2026-07-01T11:00:00Z' },
      ];
      const audit: AuditEntry[] = [
        { id: 'a1', action: 'PAPER_TRADE_EXECUTED', created_at: '2026-07-01T10:00:01Z' },
      ];
      expect(classifyRiskCoverage(trades, audit, [])).toBe('partial');
    });

    it('ignores irrelevant audit actions', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1', timestamp: '2026-07-01T10:00:00Z' },
      ];
      const audit: AuditEntry[] = [
        { id: 'a1', action: 'AUTH_SUCCESS', created_at: '2026-07-01T10:00:01Z' },
        { id: 'a2', action: 'BROKER_SELECTED', created_at: '2026-07-01T10:00:01Z' },
      ];
      expect(classifyRiskCoverage(trades, audit, [])).toBe('no_data');
    });
  });

  describe('3. Cooldown Evidence', () => {
    it('passes via audit log when COOLDOWN_ENGAGED entries exist', () => {
      const audit: AuditEntry[] = [
        { id: 'a1', action: 'COOLDOWN_ENGAGED', created_at: '2026-07-01T10:00:00Z' },
      ];
      const result = classifyCooldownEvidence(audit, []);
      expect(result.pass).toBe(true);
      expect(result.source).toBe('security_audit_log');
    });

    it('passes via risk_cooldowns when audit log is empty', () => {
      const cooldowns: RiskCooldown[] = [
        { id: 'c1', reason: 'PAPER_COOLDOWN_TEST', engaged_at: '2026-07-01T10:00:00Z', resolved: true },
      ];
      const result = classifyCooldownEvidence([], cooldowns);
      expect(result.pass).toBe(true);
      expect(result.source).toBe('risk_cooldowns');
    });

    it('fails when both sources are empty', () => {
      const result = classifyCooldownEvidence([], []);
      expect(result.pass).toBe(false);
      expect(result.source).toBe('none');
    });

    it('prefers audit log over risk_cooldowns', () => {
      const audit: AuditEntry[] = [
        { id: 'a1', action: 'COOLDOWN_ENGAGED', created_at: '2026-07-01T10:00:00Z' },
      ];
      const cooldowns: RiskCooldown[] = [
        { id: 'c1', reason: 'PAPER_COOLDOWN_TEST', engaged_at: '2026-07-01T10:00:00Z', resolved: true },
      ];
      const result = classifyCooldownEvidence(audit, cooldowns);
      expect(result.source).toBe('security_audit_log');
    });
  });

  describe('4. No Real Orders', () => {
    it('passes when all trades are paper and no broker orders', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'paper-1719667800123', timestamp: '2026-07-01T10:00:00Z' },
        { id: '2', kraken_order_id: 'paper-close-1719667800456', timestamp: '2026-07-01T11:00:00Z' },
      ];
      const result = classifyNoRealOrders(trades, [], true);
      expect(result.pass).toBe(true);
      expect(result.liveTradeCount).toBe(0);
      expect(result.brokerOrderCount).toBe(0);
    });

    it('fails when non-paper kraken_order_id exists', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: 'O2XBLF-XYZABC-123456', timestamp: '2026-07-01T10:00:00Z' },
      ];
      const result = classifyNoRealOrders(trades, [], true);
      expect(result.pass).toBe(false);
      expect(result.liveTradeCount).toBe(1);
    });

    it('fails when broker_orders has kraken entries', () => {
      const brokerOrders: BrokerOrder[] = [
        { id: 'bo1', broker_id: 'kraken', status: 'filled' },
      ];
      const result = classifyNoRealOrders([], brokerOrders, true);
      expect(result.pass).toBe(false);
      expect(result.brokerOrderCount).toBe(1);
    });

    it('fails when bot is not in paper mode', () => {
      const result = classifyNoRealOrders([], [], false);
      expect(result.pass).toBe(false);
    });

    it('ignores paper broker orders', () => {
      const brokerOrders: BrokerOrder[] = [
        { id: 'bo1', broker_id: 'paper', status: 'filled' },
      ];
      const result = classifyNoRealOrders([], brokerOrders, true);
      expect(result.pass).toBe(true);
      expect(result.brokerOrderCount).toBe(0);
    });

    it('null kraken_order_id does not count as live', () => {
      const trades: ExecutedTrade[] = [
        { id: '1', kraken_order_id: '', timestamp: '2026-07-01T10:00:00Z' },
      ];
      const result = classifyNoRealOrders(trades, [], true);
      expect(result.pass).toBe(true);
    });
  });
});
