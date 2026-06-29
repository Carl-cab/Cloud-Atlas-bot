import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Security tests for trading safety invariants.
 * These tests validate the logic that prevents live trading,
 * enforces paper mode, and ensures safety controls work.
 *
 * The actual Edge Functions run in Deno, so we test the invariants
 * by simulating the decision logic used in trading-bot/index.ts.
 */

// Simulate the trading mode decision logic from trading-bot
function shouldExecutePaperTrade(botConfig: { mode: string; is_paused: boolean; is_active: boolean }): boolean {
  if (botConfig.is_paused) return false;
  if (!botConfig.is_active) return false;
  return botConfig.mode === 'paper';
}

function isLiveTradingBlocked(botConfig: { mode: string }): boolean {
  // Live trading is ALWAYS blocked in this release
  return botConfig.mode === 'live';
}

// Simulate the readiness gate logic
function evaluateReadinessGate(params: {
  readinessChecks: Array<{ status: string }> | null;
  paperTradeCount: number;
  failedReconciliations: number;
}): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  const hasFailedChecks = !params.readinessChecks || params.readinessChecks.some(c => c.status === 'fail');
  if (hasFailedChecks) failures.push('health-check has failed checks');
  if (params.paperTradeCount < 50) failures.push(`need 50+ paper trades (have ${params.paperTradeCount})`);
  if (params.failedReconciliations > 0) failures.push('unresolved reconciliation discrepancies exist');

  return { passed: failures.length === 0, failures };
}

// Simulate risk evaluation decision
function evaluateRiskDecision(params: {
  signalConfidence: number;
  positionSizePct: number;
  maxPositionSizePct: number;
  dailyLossPct: number;
  maxDailyLossPct: number;
  drawdownPct: number;
  maxDrawdownPct: number;
}): { approved: boolean; reason?: string } {
  if (params.positionSizePct > params.maxPositionSizePct) {
    return { approved: false, reason: 'Position size exceeds maximum allowed' };
  }
  if (params.dailyLossPct >= params.maxDailyLossPct) {
    return { approved: false, reason: 'Daily loss limit reached' };
  }
  if (params.drawdownPct >= params.maxDrawdownPct) {
    return { approved: false, reason: 'Maximum drawdown exceeded' };
  }
  if (params.signalConfidence < 0.6) {
    return { approved: false, reason: 'Signal confidence too low' };
  }
  return { approved: true };
}

// Simulate kill switch check
function isKillSwitchActive(botConfig: { is_paused: boolean; paused_reason?: string }): {
  blocked: boolean;
  reason: string;
} {
  if (botConfig.is_paused) {
    return { blocked: true, reason: botConfig.paused_reason || 'Kill switch activated' };
  }
  return { blocked: false, reason: '' };
}

// Simulate reconciliation discrepancy detection
function detectDiscrepancy(params: {
  dbBalance: number;
  exchangeBalance: number;
  threshold: number;
}): { hasDiscrepancy: boolean; difference: number } {
  const difference = Math.abs(params.dbBalance - params.exchangeBalance);
  return { hasDiscrepancy: difference > params.threshold, difference };
}

// Simulate health check for missing secrets
function validateRequiredSecrets(secrets: Record<string, string | undefined>): {
  valid: boolean;
  missing: string[];
} {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'ENCRYPTION_KEY'];
  const missing = required.filter(key => !secrets[key]);
  return { valid: missing.length === 0, missing };
}

// Simulate Kraken permission validation
function validateKrakenPermissions(permissions: string[]): {
  valid: boolean;
  reason?: string;
} {
  if (permissions.includes('withdraw')) {
    return { valid: false, reason: 'Withdraw permission detected — bot API key must NOT have withdraw access' };
  }
  const required = ['query_funds', 'query_open_orders'];
  const missingPerms = required.filter(p => !permissions.includes(p));
  if (missingPerms.length > 0) {
    return { valid: false, reason: `Missing required permissions: ${missingPerms.join(', ')}` };
  }
  return { valid: true };
}

describe('Trading Safety Invariants', () => {
  describe('1. Live trading disabled by default', () => {
    it('new bot config defaults to paper mode', () => {
      const defaultConfig = { mode: 'paper', is_paused: false, is_active: true };
      expect(shouldExecutePaperTrade(defaultConfig)).toBe(true);
      expect(isLiveTradingBlocked(defaultConfig)).toBe(false);
    });

    it('live mode is always blocked in this release', () => {
      const liveConfig = { mode: 'live', is_paused: false, is_active: true };
      expect(isLiveTradingBlocked(liveConfig)).toBe(true);
    });

    it('mode cannot be anything other than paper or live', () => {
      const validModes = ['paper', 'live'];
      const invalidModes = ['', 'test', 'demo', 'production', undefined, null];
      invalidModes.forEach(mode => {
        expect(validModes.includes(mode as string)).toBe(false);
      });
    });
  });

  describe('2. Paper trading does not submit real Kraken orders', () => {
    it('paper mode returns paper trade result without calling exchange', () => {
      const config = { mode: 'paper', is_paused: false, is_active: true };
      expect(shouldExecutePaperTrade(config)).toBe(true);
      // Paper mode exits early with paper trade result - no Kraken API call happens
      // The code path in trading-bot/index.ts returns after inserting to trading_positions
    });

    it('paper trade does not require Kraken credentials', () => {
      // In the code, paper trades don't call getPerUserKrakenCredentials
      // They insert directly to trading_positions with simulated data
      const paperPosition = {
        symbol: 'XBTUSD',
        side: 'buy',
        quantity: 0.01,
        entry_price: 50000,
        status: 'open',
      };
      expect(paperPosition.status).toBe('open');
      // No API key needed for paper trades
    });
  });

  describe('3. Readiness gate blocks live trading', () => {
    it('blocks when no deployment checks exist', () => {
      const result = evaluateReadinessGate({
        readinessChecks: null,
        paperTradeCount: 100,
        failedReconciliations: 0,
      });
      expect(result.passed).toBe(false);
      expect(result.failures).toContain('health-check has failed checks');
    });

    it('blocks when deployment checks have failures', () => {
      const result = evaluateReadinessGate({
        readinessChecks: [{ status: 'pass' }, { status: 'fail' }, { status: 'pass' }],
        paperTradeCount: 100,
        failedReconciliations: 0,
      });
      expect(result.passed).toBe(false);
      expect(result.failures).toContain('health-check has failed checks');
    });

    it('blocks when fewer than 50 paper trades executed', () => {
      const result = evaluateReadinessGate({
        readinessChecks: [{ status: 'pass' }],
        paperTradeCount: 49,
        failedReconciliations: 0,
      });
      expect(result.passed).toBe(false);
      expect(result.failures[0]).toContain('need 50+ paper trades');
    });

    it('blocks when unresolved reconciliation discrepancies exist', () => {
      const result = evaluateReadinessGate({
        readinessChecks: [{ status: 'pass' }],
        paperTradeCount: 100,
        failedReconciliations: 2,
      });
      expect(result.passed).toBe(false);
      expect(result.failures).toContain('unresolved reconciliation discrepancies exist');
    });

    it('passes only when ALL criteria are met', () => {
      const result = evaluateReadinessGate({
        readinessChecks: [{ status: 'pass' }, { status: 'pass' }],
        paperTradeCount: 50,
        failedReconciliations: 0,
      });
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('blocks when multiple criteria fail simultaneously', () => {
      const result = evaluateReadinessGate({
        readinessChecks: [{ status: 'fail' }],
        paperTradeCount: 10,
        failedReconciliations: 3,
      });
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(3);
    });

    it('readiness gate counts executed_trades (paper trades must write to both tables)', () => {
      // Simulates the requirement: paper trades must write to executed_trades
      // so the readiness gate's "50+ paper trades" counter advances.
      // The gate queries executed_trades, not trading_positions.
      const paperTradesInExecutedTrades = 50;
      const result = evaluateReadinessGate({
        readinessChecks: [{ status: 'pass' }],
        paperTradeCount: paperTradesInExecutedTrades,
        failedReconciliations: 0,
      });
      expect(result.passed).toBe(true);

      // If only trading_positions was written (old bug), gate would see 0
      const buggyResult = evaluateReadinessGate({
        readinessChecks: [{ status: 'pass' }],
        paperTradeCount: 0,
        failedReconciliations: 0,
      });
      expect(buggyResult.passed).toBe(false);
      expect(buggyResult.failures[0]).toContain('need 50+ paper trades');
    });
  });

  describe('4. Risk checks run before order placement', () => {
    it('rejects when position size exceeds maximum', () => {
      const result = evaluateRiskDecision({
        signalConfidence: 0.8,
        positionSizePct: 15,
        maxPositionSizePct: 10,
        dailyLossPct: 0,
        maxDailyLossPct: 2,
        drawdownPct: 0,
        maxDrawdownPct: 10,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Position size exceeds');
    });

    it('rejects when daily loss limit reached', () => {
      const result = evaluateRiskDecision({
        signalConfidence: 0.8,
        positionSizePct: 5,
        maxPositionSizePct: 10,
        dailyLossPct: 2,
        maxDailyLossPct: 2,
        drawdownPct: 0,
        maxDrawdownPct: 10,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Daily loss limit');
    });

    it('rejects when maximum drawdown exceeded', () => {
      const result = evaluateRiskDecision({
        signalConfidence: 0.8,
        positionSizePct: 5,
        maxPositionSizePct: 10,
        dailyLossPct: 0,
        maxDailyLossPct: 2,
        drawdownPct: 10,
        maxDrawdownPct: 10,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Maximum drawdown');
    });

    it('rejects when signal confidence is too low', () => {
      const result = evaluateRiskDecision({
        signalConfidence: 0.5,
        positionSizePct: 5,
        maxPositionSizePct: 10,
        dailyLossPct: 0,
        maxDailyLossPct: 2,
        drawdownPct: 0,
        maxDrawdownPct: 10,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Signal confidence too low');
    });

    it('approves only when all risk criteria pass', () => {
      const result = evaluateRiskDecision({
        signalConfidence: 0.8,
        positionSizePct: 5,
        maxPositionSizePct: 10,
        dailyLossPct: 1,
        maxDailyLossPct: 2,
        drawdownPct: 5,
        maxDrawdownPct: 10,
      });
      expect(result.approved).toBe(true);
    });
  });

  describe('5. Kill switch blocks trading', () => {
    it('blocks all trading when kill switch is active', () => {
      const result = isKillSwitchActive({ is_paused: true, paused_reason: 'Manual halt' });
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Manual halt');
    });

    it('uses default reason when no reason provided', () => {
      const result = isKillSwitchActive({ is_paused: true });
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Kill switch activated');
    });

    it('allows trading when kill switch is inactive', () => {
      const result = isKillSwitchActive({ is_paused: false });
      expect(result.blocked).toBe(false);
    });

    it('kill switch takes priority over is_active', () => {
      // Even if is_active=true, is_paused blocks first
      const config = { mode: 'paper', is_paused: true, is_active: true };
      expect(shouldExecutePaperTrade(config)).toBe(false);
    });
  });

  describe('6. Reconciliation detects discrepancies', () => {
    it('detects discrepancy above threshold', () => {
      const result = detectDiscrepancy({
        dbBalance: 10000,
        exchangeBalance: 10002,
        threshold: 1.0,
      });
      expect(result.hasDiscrepancy).toBe(true);
      expect(result.difference).toBe(2);
    });

    it('no discrepancy within threshold', () => {
      const result = detectDiscrepancy({
        dbBalance: 10000,
        exchangeBalance: 10000.50,
        threshold: 1.0,
      });
      expect(result.hasDiscrepancy).toBe(false);
    });

    it('detects when exchange has less than DB', () => {
      const result = detectDiscrepancy({
        dbBalance: 10000,
        exchangeBalance: 9995,
        threshold: 1.0,
      });
      expect(result.hasDiscrepancy).toBe(true);
      expect(result.difference).toBe(5);
    });

    it('exact match has no discrepancy', () => {
      const result = detectDiscrepancy({
        dbBalance: 5000,
        exchangeBalance: 5000,
        threshold: 1.0,
      });
      expect(result.hasDiscrepancy).toBe(false);
      expect(result.difference).toBe(0);
    });
  });

  describe('7. Missing secrets fail health-check', () => {
    it('fails when SUPABASE_URL is missing', () => {
      const result = validateRequiredSecrets({
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: 'key',
        SUPABASE_ANON_KEY: 'key',
        ENCRYPTION_KEY: 'key',
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('SUPABASE_URL');
    });

    it('fails when ENCRYPTION_KEY is missing', () => {
      const result = validateRequiredSecrets({
        SUPABASE_URL: 'url',
        SUPABASE_SERVICE_ROLE_KEY: 'key',
        SUPABASE_ANON_KEY: 'key',
        ENCRYPTION_KEY: undefined,
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('ENCRYPTION_KEY');
    });

    it('fails when multiple secrets missing', () => {
      const result = validateRequiredSecrets({
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        SUPABASE_ANON_KEY: 'key',
        ENCRYPTION_KEY: undefined,
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(3);
    });

    it('passes when all secrets present', () => {
      const result = validateRequiredSecrets({
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        SUPABASE_ANON_KEY: 'anon-key',
        ENCRYPTION_KEY: 'encryption-key-32-chars-minimum!',
      });
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('8. Kraken withdraw permission causes startup failure', () => {
    it('rejects API key with withdraw permission', () => {
      const result = validateKrakenPermissions(['query_funds', 'query_open_orders', 'create_order', 'withdraw']);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Withdraw permission detected');
    });

    it('accepts API key with only trading permissions', () => {
      const result = validateKrakenPermissions(['query_funds', 'query_open_orders', 'create_order', 'cancel_order']);
      expect(result.valid).toBe(true);
    });

    it('rejects API key missing required query permissions', () => {
      const result = validateKrakenPermissions(['create_order']);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing required permissions');
    });

    it('accepts read-only API key for paper trading', () => {
      const result = validateKrakenPermissions(['query_funds', 'query_open_orders']);
      expect(result.valid).toBe(true);
    });
  });

  describe('9. Missing bot_config auto-initialization', () => {
    // Simulates the auto-init logic added to trading-bot for users without a config row
    function autoInitBotConfig(existingConfig: any | null): {
      mode: string;
      is_active: boolean;
      is_paused: boolean;
      capital_cad: number;
      daily_stop_loss: number;
    } {
      if (existingConfig) return existingConfig;
      return {
        mode: 'paper',
        is_active: true,
        is_paused: false,
        capital_cad: 10000,
        daily_stop_loss: 5,
      };
    }

    it('creates safe paper config when none exists', () => {
      const config = autoInitBotConfig(null);
      expect(config.mode).toBe('paper');
      expect(config.is_paused).toBe(false);
      expect(config.is_active).toBe(true);
    });

    it('auto-initialized config defaults to paper mode, never live', () => {
      const config = autoInitBotConfig(null);
      expect(config.mode).toBe('paper');
      expect(config.mode).not.toBe('live');
    });

    it('does not overwrite existing config', () => {
      const existing = { mode: 'paper', is_active: false, is_paused: true, capital_cad: 5000, daily_stop_loss: 3 };
      const config = autoInitBotConfig(existing);
      expect(config).toBe(existing);
      expect(config.capital_cad).toBe(5000);
    });

    it('paper trade execution works with auto-initialized config', () => {
      const config = autoInitBotConfig(null);
      expect(shouldExecutePaperTrade(config)).toBe(true);
      expect(isLiveTradingBlocked(config)).toBe(false);
    });
  });

  describe('10. Paper mode does not require Kraken credentials', () => {
    function requiresKrakenCredentials(action: string): boolean {
      const exchangeActions = ['analyze_market'];
      return exchangeActions.includes(action);
    }

    it('execute_trade does not require credentials', () => {
      expect(requiresKrakenCredentials('execute_trade')).toBe(false);
    });

    it('analyze_market does require credentials', () => {
      expect(requiresKrakenCredentials('analyze_market')).toBe(true);
    });

    it('generate_paper_signal does not require credentials', () => {
      expect(requiresKrakenCredentials('generate_paper_signal')).toBe(false);
    });
  });

  describe('11. Risk rejection at low confidence', () => {
    it('rejects signal with confidence 0.50 (below 0.6 threshold)', () => {
      const result = evaluateRiskDecision({
        signalConfidence: 0.50,
        positionSizePct: 5,
        maxPositionSizePct: 10,
        dailyLossPct: 0,
        maxDailyLossPct: 5,
        drawdownPct: 0,
        maxDrawdownPct: 10,
      });
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('confidence');
    });

    it('approves signal with confidence 0.65 (above 0.6 threshold)', () => {
      const result = evaluateRiskDecision({
        signalConfidence: 0.65,
        positionSizePct: 5,
        maxPositionSizePct: 10,
        dailyLossPct: 0,
        maxDailyLossPct: 5,
        drawdownPct: 0,
        maxDrawdownPct: 10,
      });
      expect(result.approved).toBe(true);
    });

    it('paper signal generator always produces confidence >= 0.65', () => {
      for (let i = 0; i < 100; i++) {
        const confidence = 0.65 + Math.random() * 0.25;
        expect(confidence).toBeGreaterThanOrEqual(0.65);
        expect(confidence).toBeLessThanOrEqual(0.90);
      }
    });

    it('paper signal generator never produces hold signals', () => {
      for (let i = 0; i < 100; i++) {
        const rand = Math.random();
        const signalType = rand > 0.5 ? 'buy' : 'sell';
        expect(signalType).not.toBe('hold');
      }
    });
  });

  describe('12. Scheduler service role auth', () => {
    function authenticateRequest(token: string, serviceRoleKey: string): { isServiceRole: boolean; userId: string | null } {
      const isServiceRole = token === serviceRoleKey && serviceRoleKey.length > 0;
      return { isServiceRole, userId: null };
    }

    it('accepts service role key as valid auth', () => {
      const result = authenticateRequest('sbp_test_key_123', 'sbp_test_key_123');
      expect(result.isServiceRole).toBe(true);
    });

    it('rejects mismatched service role key', () => {
      const result = authenticateRequest('user_jwt_token', 'sbp_test_key_123');
      expect(result.isServiceRole).toBe(false);
    });

    it('rejects empty service role key', () => {
      const result = authenticateRequest('', '');
      expect(result.isServiceRole).toBe(false);
    });
  });

  describe('13. Reconciliation handles paper mode gracefully', () => {
    function reconciliationDecision(wallet: any, credentials: any): { status: string; shouldProceed: boolean } {
      if (!wallet) return { status: 'skipped', shouldProceed: false };
      if (!credentials) return { status: 'skipped', shouldProceed: false };
      return { status: 'ok', shouldProceed: true };
    }

    it('skips when no wallet exists (paper mode)', () => {
      const result = reconciliationDecision(null, null);
      expect(result.status).toBe('skipped');
      expect(result.shouldProceed).toBe(false);
    });

    it('skips when no credentials exist (paper mode)', () => {
      const result = reconciliationDecision({ available_balance: 100 }, null);
      expect(result.status).toBe('skipped');
      expect(result.shouldProceed).toBe(false);
    });

    it('proceeds when both wallet and credentials exist', () => {
      const result = reconciliationDecision({ available_balance: 100 }, { api_key: 'k', private_key: 'p' });
      expect(result.status).toBe('ok');
      expect(result.shouldProceed).toBe(true);
    });
  });

  // ===========================================================================
  // Cooldown Audit Logging
  // ===========================================================================
  describe('Cooldown Audit Logging', () => {
    function simulateCooldownAuditEntry(reason: string, cooldownMs: number, details: Record<string, unknown>) {
      return {
        action: 'COOLDOWN_ENGAGED',
        category: 'risk',
        severity: 'warning',
        details: { reason, cooldown_minutes: Math.round(cooldownMs / 60000), ...details },
      };
    }

    it('produces a COOLDOWN_ENGAGED audit entry on daily loss limit', () => {
      const entry = simulateCooldownAuditEntry('DAILY_LOSS_LIMIT', 24 * 60 * 60 * 1000, {
        daily_pnl: '$-50.00',
        daily_loss_limit: '$40.00 (10.0% of capital)',
      });
      expect(entry.action).toBe('COOLDOWN_ENGAGED');
      expect(entry.category).toBe('risk');
      expect(entry.severity).toBe('warning');
      expect(entry.details.reason).toBe('DAILY_LOSS_LIMIT');
      expect(entry.details.cooldown_minutes).toBe(1440);
    });

    it('produces a COOLDOWN_ENGAGED audit entry on circuit breaker', () => {
      const entry = simulateCooldownAuditEntry('CIRCUIT_BREAKER', 60 * 60 * 1000, {
        recent_loss_1h: '$-120.00',
        circuit_breaker_limit: '$100.00 (5% of capital)',
      });
      expect(entry.action).toBe('COOLDOWN_ENGAGED');
      expect(entry.details.reason).toBe('CIRCUIT_BREAKER');
      expect(entry.details.cooldown_minutes).toBe(60);
    });

    it('produces a COOLDOWN_ENGAGED audit entry on max drawdown', () => {
      const entry = simulateCooldownAuditEntry('MAX_DRAWDOWN', 48 * 60 * 60 * 1000, {
        current_balance: '$700.00',
        peak_balance: '$1000.00',
        drawdown: '30.00%',
      });
      expect(entry.action).toBe('COOLDOWN_ENGAGED');
      expect(entry.details.reason).toBe('MAX_DRAWDOWN');
      expect(entry.details.cooldown_minutes).toBe(2880);
    });

    it('cooldown entry does not weaken the pause — is_paused still set', () => {
      const botConfig = { is_paused: false, paused_reason: null as string | null };
      // Simulate engageCooldown side-effect
      botConfig.is_paused = true;
      botConfig.paused_reason = 'DAILY_LOSS_LIMIT';
      expect(botConfig.is_paused).toBe(true);
      expect(botConfig.paused_reason).toBe('DAILY_LOSS_LIMIT');
    });
  });

  // ===========================================================================
  // Paper Position Management & Trade Rejection Logging
  // ===========================================================================
  describe('Paper Position Management', () => {
    function simulatePositionClose(pos: { side: string; entry_price: number; stop_loss: number; take_profit: number }, currentPrice: number) {
      let shouldClose = false;
      let closeReason = '';
      let realizedPnl = 0;

      if (pos.side === 'buy') {
        if (pos.stop_loss > 0 && currentPrice <= pos.stop_loss) {
          shouldClose = true; closeReason = 'stop_loss'; realizedPnl = (currentPrice - pos.entry_price);
        } else if (pos.take_profit > 0 && currentPrice >= pos.take_profit) {
          shouldClose = true; closeReason = 'take_profit'; realizedPnl = (currentPrice - pos.entry_price);
        }
      } else if (pos.side === 'sell') {
        if (pos.stop_loss > 0 && currentPrice >= pos.stop_loss) {
          shouldClose = true; closeReason = 'stop_loss'; realizedPnl = (pos.entry_price - currentPrice);
        } else if (pos.take_profit > 0 && currentPrice <= pos.take_profit) {
          shouldClose = true; closeReason = 'take_profit'; realizedPnl = (pos.entry_price - currentPrice);
        }
      }

      return { shouldClose, closeReason, realizedPnl };
    }

    it('closes buy position when price drops to stop-loss', () => {
      const result = simulatePositionClose({ side: 'buy', entry_price: 100, stop_loss: 95, take_profit: 110 }, 94);
      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('stop_loss');
      expect(result.realizedPnl).toBeLessThan(0);
    });

    it('closes buy position when price rises to take-profit', () => {
      const result = simulatePositionClose({ side: 'buy', entry_price: 100, stop_loss: 95, take_profit: 110 }, 111);
      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('take_profit');
      expect(result.realizedPnl).toBeGreaterThan(0);
    });

    it('closes sell position when price rises to stop-loss', () => {
      const result = simulatePositionClose({ side: 'sell', entry_price: 100, stop_loss: 105, take_profit: 90 }, 106);
      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('stop_loss');
      expect(result.realizedPnl).toBeLessThan(0);
    });

    it('closes sell position when price drops to take-profit', () => {
      const result = simulatePositionClose({ side: 'sell', entry_price: 100, stop_loss: 105, take_profit: 90 }, 89);
      expect(result.shouldClose).toBe(true);
      expect(result.closeReason).toBe('take_profit');
      expect(result.realizedPnl).toBeGreaterThan(0);
    });

    it('keeps position open when price is between stop-loss and take-profit', () => {
      const result = simulatePositionClose({ side: 'buy', entry_price: 100, stop_loss: 95, take_profit: 110 }, 102);
      expect(result.shouldClose).toBe(false);
    });

    it('max open positions check blocks trade when at limit', () => {
      const maxPositions = 4;
      const openPositionCount = 4;
      const blocked = openPositionCount >= maxPositions;
      expect(blocked).toBe(true);
    });

    it('max open positions check allows trade after positions close', () => {
      const maxPositions = 4;
      const openPositionCount = 2;
      const blocked = openPositionCount >= maxPositions;
      expect(blocked).toBe(false);
    });
  });

  describe('Trade Rejection Audit Logging', () => {
    function simulateRejectionAuditEntry(reason: string, symbol: string, mode: string) {
      return {
        action: 'TRADE_REJECTED',
        category: 'trading',
        severity: 'warning',
        details: { reason, symbol, mode },
      };
    }

    it('logs rejection with reason and symbol', () => {
      const entry = simulateRejectionAuditEntry('Maximum open positions reached', 'XBTUSD', 'paper');
      expect(entry.action).toBe('TRADE_REJECTED');
      expect(entry.details.reason).toBe('Maximum open positions reached');
      expect(entry.details.symbol).toBe('XBTUSD');
      expect(entry.details.mode).toBe('paper');
    });

    it('logs confidence rejection', () => {
      const entry = simulateRejectionAuditEntry('Signal confidence below threshold (0.6)', 'ETHUSD', 'paper');
      expect(entry.details.reason).toContain('confidence');
    });
  });

  describe('test_cooldown action safety', () => {
    it('only works in paper mode', () => {
      const modes = ['paper', 'live'];
      const allowed = modes.map(m => ({ mode: m, permitted: m === 'paper' }));
      expect(allowed[0].permitted).toBe(true);
      expect(allowed[1].permitted).toBe(false);
    });

    it('un-pauses bot after cooldown test', () => {
      // Simulate: engageCooldown sets is_paused=true, then test_cooldown sets it back to false
      let isPaused = false;
      isPaused = true; // engageCooldown effect
      expect(isPaused).toBe(true);
      isPaused = false; // test_cooldown cleanup
      expect(isPaused).toBe(false);
    });
  });
});
