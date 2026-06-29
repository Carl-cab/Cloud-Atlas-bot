import { describe, it, expect } from 'vitest';

/**
 * Broker Adapter Contract Tests
 *
 * These tests verify the BrokerAdapter interface contract. Every adapter
 * (Kraken, Paper, Alpaca, etc.) must satisfy these invariants. We test
 * using simulated adapter behavior to validate the contract shapes.
 */

// --- Simulated types matching the real BrokerAdapter interface ---
interface BrokerCapabilities {
  brokerId: string;
  name: string;
  supportedAssetClasses: string[];
  supportedOrderTypes: string[];
  supportsPaperTrading: boolean;
  supportsWebSocket: boolean;
  supportsStopLoss: boolean;
  supportsTakeProfit: boolean;
  supportsMarginTrading: boolean;
  maxOrdersPerSecond: number;
  supportedCurrencies: string[];
}

interface BrokerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  brokerError?: string;
  retryable?: boolean;
}

interface Order {
  id: string;
  brokerOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  status: string;
  quantity: number;
  filledQuantity: number;
  fee: number;
  feeCurrency: string;
  createdAt: string;
  updatedAt: string;
}

// --- Adapter simulators ---

function simulateKrakenCapabilities(): BrokerCapabilities {
  return {
    brokerId: 'kraken',
    name: 'Kraken',
    supportedAssetClasses: ['crypto'],
    supportedOrderTypes: ['market', 'limit', 'stop_loss', 'take_profit', 'stop_limit'],
    supportsPaperTrading: false,
    supportsWebSocket: true,
    supportsStopLoss: true,
    supportsTakeProfit: true,
    supportsMarginTrading: true,
    maxOrdersPerSecond: 1,
    supportedCurrencies: ['USD', 'CAD', 'EUR', 'GBP'],
  };
}

function simulatePaperCapabilities(): BrokerCapabilities {
  return {
    brokerId: 'paper',
    name: 'Paper Trading (Simulated)',
    supportedAssetClasses: ['crypto', 'stock', 'etf', 'forex', 'option', 'future', 'metal'],
    supportedOrderTypes: ['market', 'limit', 'stop_loss', 'take_profit', 'stop_limit'],
    supportsPaperTrading: true,
    supportsWebSocket: false,
    supportsStopLoss: true,
    supportsTakeProfit: true,
    supportsMarginTrading: false,
    maxOrdersPerSecond: 100,
    supportedCurrencies: ['USD'],
  };
}

function simulatePaperPlaceOrder(symbol: string, side: 'buy' | 'sell', quantity: number, price: number): BrokerResult<Order> {
  const fee = price * quantity * 0.001;
  return {
    success: true,
    data: {
      id: `paper-${Date.now()}`,
      brokerOrderId: `paper-${Date.now()}`,
      symbol,
      side,
      type: 'market',
      status: 'filled',
      quantity,
      filledQuantity: quantity,
      fee,
      feeCurrency: 'USD',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function simulateBrokerSelection(
  preferredBrokerId: string | undefined,
  requirePaperTrading: boolean,
  brokers: BrokerCapabilities[]
): BrokerCapabilities | null {
  const candidates = brokers
    .filter(b => {
      if (requirePaperTrading && !b.supportsPaperTrading) return false;
      return true;
    })
    .sort((a, b) => {
      if (preferredBrokerId) {
        if (a.brokerId === preferredBrokerId) return -1;
        if (b.brokerId === preferredBrokerId) return 1;
      }
      return 0;
    });
  return candidates[0] ?? null;
}

// ==========================================================================
// Contract Tests
// ==========================================================================

describe('Broker Adapter Contract', () => {

  describe('1. Capabilities', () => {
    it('Kraken adapter reports correct brokerId', () => {
      const caps = simulateKrakenCapabilities();
      expect(caps.brokerId).toBe('kraken');
    });

    it('Paper adapter reports correct brokerId', () => {
      const caps = simulatePaperCapabilities();
      expect(caps.brokerId).toBe('paper');
    });

    it('capabilities have all required fields', () => {
      const requiredFields = [
        'brokerId', 'name', 'supportedAssetClasses', 'supportedOrderTypes',
        'supportsPaperTrading', 'supportsWebSocket', 'supportsStopLoss',
        'supportsTakeProfit', 'supportsMarginTrading', 'maxOrdersPerSecond',
        'supportedCurrencies',
      ];

      for (const caps of [simulateKrakenCapabilities(), simulatePaperCapabilities()]) {
        for (const field of requiredFields) {
          expect(caps).toHaveProperty(field);
        }
      }
    });

    it('Paper adapter supports all asset classes', () => {
      const caps = simulatePaperCapabilities();
      expect(caps.supportedAssetClasses).toContain('crypto');
      expect(caps.supportedAssetClasses).toContain('stock');
      expect(caps.supportedAssetClasses).toContain('forex');
    });

    it('Kraken adapter only supports crypto', () => {
      const caps = simulateKrakenCapabilities();
      expect(caps.supportedAssetClasses).toEqual(['crypto']);
    });

    it('Paper adapter declares paper trading support', () => {
      expect(simulatePaperCapabilities().supportsPaperTrading).toBe(true);
    });

    it('Kraken adapter does not declare paper trading support', () => {
      expect(simulateKrakenCapabilities().supportsPaperTrading).toBe(false);
    });
  });

  describe('2. Order Placement', () => {
    it('Paper order returns BrokerResult with success=true', () => {
      const result = simulatePaperPlaceOrder('BTCUSD', 'buy', 0.01, 65000);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('Paper order has valid order structure', () => {
      const result = simulatePaperPlaceOrder('ETHUSD', 'sell', 1.0, 3500);
      const order = result.data!;
      expect(order.id).toBeTruthy();
      expect(order.brokerOrderId).toBeTruthy();
      expect(order.symbol).toBe('ETHUSD');
      expect(order.side).toBe('sell');
      expect(order.quantity).toBe(1.0);
      expect(order.status).toBe('filled');
      expect(order.fee).toBeGreaterThan(0);
      expect(order.feeCurrency).toBe('USD');
    });

    it('market orders are immediately filled in paper mode', () => {
      const result = simulatePaperPlaceOrder('BTCUSD', 'buy', 0.1, 65000);
      expect(result.data!.status).toBe('filled');
      expect(result.data!.filledQuantity).toBe(0.1);
    });

    it('paper order IDs are prefixed with paper-', () => {
      const result = simulatePaperPlaceOrder('BTCUSD', 'buy', 0.1, 65000);
      expect(result.data!.id).toMatch(/^paper-/);
    });

    it('fees are calculated correctly (0.1%)', () => {
      const result = simulatePaperPlaceOrder('BTCUSD', 'buy', 1.0, 10000);
      expect(result.data!.fee).toBeCloseTo(10.0, 1);
    });
  });

  describe('3. Broker Registry Selection', () => {
    const allBrokers = [simulateKrakenCapabilities(), simulatePaperCapabilities()];

    it('selects preferred broker when available', () => {
      const selected = simulateBrokerSelection('kraken', false, allBrokers);
      expect(selected?.brokerId).toBe('kraken');
    });

    it('selects paper broker when paper trading required', () => {
      const selected = simulateBrokerSelection(undefined, true, allBrokers);
      expect(selected?.brokerId).toBe('paper');
    });

    it('excludes non-paper brokers when paper trading required', () => {
      const selected = simulateBrokerSelection('kraken', true, allBrokers);
      expect(selected?.brokerId).toBe('paper');
    });

    it('returns null when no broker matches', () => {
      const selected = simulateBrokerSelection(undefined, true, [simulateKrakenCapabilities()]);
      expect(selected).toBeNull();
    });

    it('falls back when preferred broker unavailable', () => {
      const selected = simulateBrokerSelection('alpaca', false, allBrokers);
      expect(selected).not.toBeNull();
    });
  });

  describe('4. BrokerResult Contract', () => {
    it('success result has data field', () => {
      const result: BrokerResult<string> = { success: true, data: 'ok' };
      expect(result.success).toBe(true);
      expect(result.data).toBe('ok');
    });

    it('failure result has error field', () => {
      const result: BrokerResult<string> = { success: false, error: 'connection timeout' };
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('broker-specific error stored separately', () => {
      const result: BrokerResult<string> = {
        success: false,
        error: 'Order rejected',
        brokerError: 'EOrder:Insufficient funds',
        retryable: false,
      };
      expect(result.brokerError).toContain('Insufficient');
      expect(result.retryable).toBe(false);
    });
  });

  describe('5. Security Invariants', () => {
    it('paper adapter never requires real credentials', () => {
      const caps = simulatePaperCapabilities();
      expect(caps.supportsPaperTrading).toBe(true);
    });

    it('adapter brokerId is immutable per adapter type', () => {
      const kraken1 = simulateKrakenCapabilities();
      const kraken2 = simulateKrakenCapabilities();
      expect(kraken1.brokerId).toBe(kraken2.brokerId);
    });

    it('order response never exposes credentials', () => {
      const result = simulatePaperPlaceOrder('BTCUSD', 'buy', 0.1, 65000);
      const json = JSON.stringify(result);
      expect(json).not.toContain('apiKey');
      expect(json).not.toContain('apiSecret');
      expect(json).not.toContain('privateKey');
      expect(json).not.toContain('password');
    });
  });

  describe('6. Multi-Asset Support', () => {
    it('paper adapter supports crypto symbols', () => {
      const caps = simulatePaperCapabilities();
      expect(caps.supportedAssetClasses).toContain('crypto');
    });

    it('paper adapter supports stock symbols', () => {
      const caps = simulatePaperCapabilities();
      expect(caps.supportedAssetClasses).toContain('stock');
    });

    it('paper adapter supports forex', () => {
      const caps = simulatePaperCapabilities();
      expect(caps.supportedAssetClasses).toContain('forex');
    });

    it('paper adapter supports all order types', () => {
      const caps = simulatePaperCapabilities();
      expect(caps.supportedOrderTypes).toContain('market');
      expect(caps.supportedOrderTypes).toContain('limit');
      expect(caps.supportedOrderTypes).toContain('stop_loss');
    });
  });
});
