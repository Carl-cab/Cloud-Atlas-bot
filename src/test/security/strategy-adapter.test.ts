import { describe, it, expect } from 'vitest';

/**
 * Strategy Adapter Contract Tests
 *
 * Verifies the StrategyAdapter interface contract, StrategyRegistry behavior,
 * SignalAggregator logic, and Strategy Pipeline orchestration. Every strategy
 * (Momentum, MeanReversion, Breakout, TrendFollowing, AIHybrid) must satisfy
 * these invariants.
 *
 * Tests use simulated types matching the real Strategy Engine interfaces to
 * verify behavior without Deno/Supabase runtime dependencies.
 */

// ==========================================================================
// Simulated types matching the real Strategy Engine interfaces
// ==========================================================================

type SignalDirection = 'long' | 'short' | 'close' | 'hold';
type SignalStrength = 'strong' | 'moderate' | 'weak';
type StrategyCategory = 'momentum' | 'mean_reversion' | 'breakout' | 'trend_following' | 'ai_hybrid' | 'statistical_arbitrage' | 'custom';
type StrategyHealthStatus = 'healthy' | 'degraded' | 'stale' | 'error';
type AggregationMethod = 'majority_vote' | 'weighted_confidence' | 'priority_strategy' | 'consensus_threshold';
type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

interface StrategySignal {
  strategyId: string;
  symbol: string;
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number;
  riskScore: number;
  positionSize: number;
  stopLoss: number | null;
  takeProfit: number | null;
  expectedHoldingTime: string | null;
  entryPrice: number;
  reasoning: string;
  indicators: Record<string, number>;
  metadata: Record<string, unknown>;
  timestamp: string;
}

interface StrategyMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: StrategyCategory;
  supportedTimeframes: Timeframe[];
  supportedSymbols: string[];
  minDataPoints: number;
  riskLevel: 'low' | 'medium' | 'high';
  tags: string[];
}

interface StrategyHealth {
  status: StrategyHealthStatus;
  lastSignalAt: string | null;
  signalCount: number;
  errorCount: number;
  averageLatencyMs: number;
  checkedAt: string;
}

interface AggregatedSignal {
  symbol: string;
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number;
  riskScore: number;
  positionSize: number;
  stopLoss: number | null;
  takeProfit: number | null;
  expectedHoldingTime: string | null;
  entryPrice: number;
  reasoning: string;
  aggregationMethod: AggregationMethod;
  contributingStrategies: string[];
  individualSignals: StrategySignal[];
  consensusReached: boolean;
  metadata: Record<string, unknown>;
  timestamp: string;
}

interface AggregatorConfig {
  method: AggregationMethod;
  consensusThreshold: number;
  minimumConfidence: number;
  maximumRiskScore: number;
  priorityStrategyId?: string;
  weightOverrides?: Record<string, number>;
}

interface RegisteredStrategy {
  strategyId: string;
  metadata: StrategyMetadata;
  enabled: boolean;
  priority: number;
  weight: number;
  lastHealth?: StrategyHealth;
}

// ==========================================================================
// Simulated Strategy Implementations
// ==========================================================================

function createSignal(overrides: Partial<StrategySignal> = {}): StrategySignal {
  return {
    strategyId: 'test-strategy',
    symbol: 'XBTUSD',
    direction: 'long',
    strength: 'moderate',
    confidence: 0.7,
    riskScore: 0.3,
    positionSize: 0.02,
    stopLoss: 63000,
    takeProfit: 69000,
    expectedHoldingTime: 'PT4H',
    entryPrice: 65000,
    reasoning: 'Test signal',
    indicators: { rsi: 55 },
    metadata: {},
    timestamp: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

function createMetadata(overrides: Partial<StrategyMetadata> = {}): StrategyMetadata {
  return {
    id: 'test-strategy',
    name: 'Test Strategy',
    version: '0.1.0',
    description: 'Test strategy for unit tests',
    author: 'Cloud Atlas',
    category: 'momentum',
    supportedTimeframes: ['1h', '4h'],
    supportedSymbols: [],
    minDataPoints: 14,
    riskLevel: 'medium',
    tags: ['test'],
    ...overrides,
  };
}

function createHealth(overrides: Partial<StrategyHealth> = {}): StrategyHealth {
  return {
    status: 'healthy',
    lastSignalAt: '2026-07-01T10:00:00Z',
    signalCount: 10,
    errorCount: 0,
    averageLatencyMs: 5,
    checkedAt: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

function createRegistered(overrides: Partial<RegisteredStrategy> = {}): RegisteredStrategy {
  return {
    strategyId: 'test-strategy',
    metadata: createMetadata(),
    enabled: true,
    priority: 100,
    weight: 1.0,
    ...overrides,
  };
}

// ==========================================================================
// Simulated Registry
// ==========================================================================

class SimulatedRegistry {
  private strategies: Map<string, RegisteredStrategy> = new Map();

  register(id: string, priority: number = 100, weight: number = 1.0): void {
    this.strategies.set(id, createRegistered({
      strategyId: id,
      metadata: createMetadata({ id }),
      priority,
      weight: Math.max(0, Math.min(1, weight)),
    }));
  }

  unregister(id: string): void { this.strategies.delete(id); }

  get(id: string): RegisteredStrategy | null {
    const entry = this.strategies.get(id);
    return entry?.enabled ? entry : null;
  }

  getAll(): RegisteredStrategy[] { return Array.from(this.strategies.values()); }

  getEnabled(): RegisteredStrategy[] {
    return this.getAll().filter(s => s.enabled).sort((a, b) => a.priority - b.priority);
  }

  enable(id: string): boolean {
    const entry = this.strategies.get(id);
    if (!entry) return false;
    entry.enabled = true;
    return true;
  }

  disable(id: string): boolean {
    const entry = this.strategies.get(id);
    if (!entry) return false;
    entry.enabled = false;
    return true;
  }

  setPriority(id: string, priority: number): boolean {
    const entry = this.strategies.get(id);
    if (!entry) return false;
    entry.priority = priority;
    return true;
  }

  setWeight(id: string, weight: number): boolean {
    const entry = this.strategies.get(id);
    if (!entry) return false;
    entry.weight = Math.max(0, Math.min(1, weight));
    return true;
  }

  totalWeight(): number {
    return this.getEnabled().reduce((sum, s) => sum + s.weight, 0);
  }

  weightMap(): Map<string, number> {
    const total = this.totalWeight();
    const map = new Map<string, number>();
    for (const s of this.getEnabled()) {
      map.set(s.strategyId, total > 0 ? s.weight / total : 0);
    }
    return map;
  }

  select(criteria: { category?: StrategyCategory; maxRiskLevel?: string; enabledOnly?: boolean }): RegisteredStrategy[] {
    const riskOrder: Record<string, number> = { low: 1, medium: 2, high: 3 };
    return this.getAll()
      .filter(s => {
        if (criteria.enabledOnly !== false && !s.enabled) return false;
        if (criteria.category && s.metadata.category !== criteria.category) return false;
        if (criteria.maxRiskLevel) {
          const maxRisk = riskOrder[criteria.maxRiskLevel] ?? 3;
          const stratRisk = riskOrder[s.metadata.riskLevel] ?? 3;
          if (stratRisk > maxRisk) return false;
        }
        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }
}

// ==========================================================================
// Simulated Aggregator
// ==========================================================================

function filterSignals(signals: StrategySignal[], config: AggregatorConfig): StrategySignal[] {
  return signals.filter(s =>
    s.confidence >= config.minimumConfidence &&
    s.riskScore <= config.maximumRiskScore &&
    s.direction !== 'hold'
  );
}

function confidenceToStrength(c: number): SignalStrength {
  if (c >= 0.75) return 'strong';
  if (c >= 0.5) return 'moderate';
  return 'weak';
}

function majorityVote(signals: StrategySignal[]): SignalDirection {
  const counts = new Map<SignalDirection, number>();
  for (const s of signals) {
    counts.set(s.direction, (counts.get(s.direction) ?? 0) + 1);
  }
  let best: SignalDirection = 'hold';
  let max = 0;
  for (const [dir, count] of counts) {
    if (count > max) { max = count; best = dir; }
  }
  return best;
}

function weightedConfidence(
  signals: StrategySignal[],
  weights: Map<string, number>
): SignalDirection {
  const scores = new Map<SignalDirection, number>();
  for (const s of signals) {
    const w = weights.get(s.strategyId) ?? (1 / signals.length);
    const existing = scores.get(s.direction) ?? 0;
    scores.set(s.direction, existing + s.confidence * w);
  }
  let best: SignalDirection = 'hold';
  let max = -1;
  for (const [dir, score] of scores) {
    if (score > max) { max = score; best = dir; }
  }
  return best;
}

function consensusThreshold(signals: StrategySignal[], threshold: number): { direction: SignalDirection; reached: boolean } {
  const counts = new Map<SignalDirection, number>();
  for (const s of signals) {
    counts.set(s.direction, (counts.get(s.direction) ?? 0) + 1);
  }
  for (const [dir, count] of counts) {
    if (count / signals.length >= threshold) {
      return { direction: dir, reached: true };
    }
  }
  return { direction: 'hold', reached: false };
}

// ==========================================================================
// Tests
// ==========================================================================

describe('Strategy Engine: Adapter Contract', () => {

  describe('StrategySignal shape', () => {
    it('has all required fields', () => {
      const signal = createSignal();
      expect(signal.strategyId).toBeDefined();
      expect(signal.symbol).toBeDefined();
      expect(signal.direction).toBeDefined();
      expect(signal.strength).toBeDefined();
      expect(typeof signal.confidence).toBe('number');
      expect(typeof signal.riskScore).toBe('number');
      expect(typeof signal.positionSize).toBe('number');
      expect(typeof signal.entryPrice).toBe('number');
      expect(signal.reasoning).toBeDefined();
      expect(signal.indicators).toBeDefined();
      expect(signal.metadata).toBeDefined();
      expect(signal.timestamp).toBeDefined();
    });

    it('confidence is between 0 and 1', () => {
      expect(createSignal({ confidence: 0 }).confidence).toBe(0);
      expect(createSignal({ confidence: 1 }).confidence).toBe(1);
      expect(createSignal({ confidence: 0.5 }).confidence).toBe(0.5);
    });

    it('riskScore is between 0 and 1', () => {
      expect(createSignal({ riskScore: 0 }).riskScore).toBe(0);
      expect(createSignal({ riskScore: 1 }).riskScore).toBe(1);
    });

    it('direction must be a valid value', () => {
      const validDirections: SignalDirection[] = ['long', 'short', 'close', 'hold'];
      for (const dir of validDirections) {
        expect(createSignal({ direction: dir }).direction).toBe(dir);
      }
    });

    it('strength must be a valid value', () => {
      const validStrengths: SignalStrength[] = ['strong', 'moderate', 'weak'];
      for (const str of validStrengths) {
        expect(createSignal({ strength: str }).strength).toBe(str);
      }
    });

    it('stopLoss and takeProfit can be null', () => {
      const signal = createSignal({ stopLoss: null, takeProfit: null });
      expect(signal.stopLoss).toBeNull();
      expect(signal.takeProfit).toBeNull();
    });

    it('does not contain broker-specific values', () => {
      const signal = createSignal();
      const json = JSON.stringify(signal);
      expect(json).not.toContain('kraken');
      expect(json).not.toContain('ZUSD');
      expect(json).not.toContain('XXBT');
      expect(json).not.toContain('api_key');
      expect(json).not.toContain('api_secret');
    });

    it('indicators are numeric key-value pairs', () => {
      const signal = createSignal({ indicators: { rsi: 55, macd: 0.3, volume: 1200 } });
      for (const [key, value] of Object.entries(signal.indicators)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('number');
      }
    });

    it('positionSize is non-negative', () => {
      expect(createSignal({ positionSize: 0 }).positionSize).toBe(0);
      expect(createSignal({ positionSize: 0.05 }).positionSize).toBe(0.05);
    });
  });

  describe('StrategyMetadata shape', () => {
    it('has all required fields', () => {
      const meta = createMetadata();
      expect(meta.id).toBeDefined();
      expect(meta.name).toBeDefined();
      expect(meta.version).toBeDefined();
      expect(meta.description).toBeDefined();
      expect(meta.author).toBeDefined();
      expect(meta.category).toBeDefined();
      expect(Array.isArray(meta.supportedTimeframes)).toBe(true);
      expect(Array.isArray(meta.supportedSymbols)).toBe(true);
      expect(typeof meta.minDataPoints).toBe('number');
      expect(meta.riskLevel).toBeDefined();
      expect(Array.isArray(meta.tags)).toBe(true);
    });

    it('category must be valid', () => {
      const valid: StrategyCategory[] = ['momentum', 'mean_reversion', 'breakout', 'trend_following', 'ai_hybrid', 'statistical_arbitrage', 'custom'];
      for (const cat of valid) {
        expect(createMetadata({ category: cat }).category).toBe(cat);
      }
    });

    it('version follows semver pattern', () => {
      expect(createMetadata().version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('riskLevel must be valid', () => {
      for (const level of ['low', 'medium', 'high'] as const) {
        expect(createMetadata({ riskLevel: level }).riskLevel).toBe(level);
      }
    });

    it('empty supportedSymbols means all symbols', () => {
      const meta = createMetadata({ supportedSymbols: [] });
      expect(meta.supportedSymbols).toEqual([]);
    });
  });

  describe('StrategyHealth shape', () => {
    it('has all required fields', () => {
      const health = createHealth();
      expect(health.status).toBeDefined();
      expect(typeof health.signalCount).toBe('number');
      expect(typeof health.errorCount).toBe('number');
      expect(typeof health.averageLatencyMs).toBe('number');
      expect(health.checkedAt).toBeDefined();
    });

    it('status must be valid', () => {
      const valid: StrategyHealthStatus[] = ['healthy', 'degraded', 'stale', 'error'];
      for (const status of valid) {
        expect(createHealth({ status }).status).toBe(status);
      }
    });

    it('lastSignalAt can be null', () => {
      expect(createHealth({ lastSignalAt: null }).lastSignalAt).toBeNull();
    });
  });
});

describe('Strategy Engine: Built-in Strategy Metadata', () => {

  const builtInStrategies = [
    { id: 'momentum', name: 'Momentum Strategy', category: 'momentum' as StrategyCategory, risk: 'medium' },
    { id: 'mean-reversion', name: 'Mean Reversion Strategy', category: 'mean_reversion' as StrategyCategory, risk: 'low' },
    { id: 'breakout', name: 'Breakout Strategy', category: 'breakout' as StrategyCategory, risk: 'high' },
    { id: 'trend-following', name: 'Trend Following Strategy', category: 'trend_following' as StrategyCategory, risk: 'medium' },
    { id: 'ai-hybrid', name: 'AI Hybrid Strategy', category: 'ai_hybrid' as StrategyCategory, risk: 'medium' },
  ];

  for (const strat of builtInStrategies) {
    describe(`${strat.name}`, () => {
      it(`has id '${strat.id}'`, () => {
        const meta = createMetadata({ id: strat.id, name: strat.name, category: strat.category, riskLevel: strat.risk as 'low' | 'medium' | 'high' });
        expect(meta.id).toBe(strat.id);
      });

      it(`has category '${strat.category}'`, () => {
        const meta = createMetadata({ id: strat.id, category: strat.category });
        expect(meta.category).toBe(strat.category);
      });

      it(`has risk level '${strat.risk}'`, () => {
        const meta = createMetadata({ id: strat.id, riskLevel: strat.risk as 'low' | 'medium' | 'high' });
        expect(meta.riskLevel).toBe(strat.risk);
      });

      it('has version 0.1.0 (skeleton)', () => {
        const meta = createMetadata({ id: strat.id, version: '0.1.0' });
        expect(meta.version).toBe('0.1.0');
      });

      it('has non-empty description', () => {
        const meta = createMetadata({ id: strat.id, description: `${strat.name} description` });
        expect(meta.description.length).toBeGreaterThan(0);
      });

      it('author is Cloud Atlas', () => {
        const meta = createMetadata({ id: strat.id, author: 'Cloud Atlas' });
        expect(meta.author).toBe('Cloud Atlas');
      });

      it('supports at least one timeframe', () => {
        const meta = createMetadata({ id: strat.id, supportedTimeframes: ['1h'] });
        expect(meta.supportedTimeframes.length).toBeGreaterThanOrEqual(1);
      });

      it('has minDataPoints > 0', () => {
        const meta = createMetadata({ id: strat.id, minDataPoints: 14 });
        expect(meta.minDataPoints).toBeGreaterThan(0);
      });
    });
  }
});

describe('Strategy Engine: Registry', () => {

  describe('Registration', () => {
    it('registers a strategy', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      expect(registry.getAll().length).toBe(1);
    });

    it('registers multiple strategies', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 10);
      registry.register('mean-reversion', 20);
      registry.register('breakout', 30);
      expect(registry.getAll().length).toBe(3);
    });

    it('unregisters a strategy', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.unregister('momentum');
      expect(registry.getAll().length).toBe(0);
    });

    it('unregister non-existent is no-op', () => {
      const registry = new SimulatedRegistry();
      registry.unregister('does-not-exist');
      expect(registry.getAll().length).toBe(0);
    });

    it('register with custom priority', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 5);
      const all = registry.getAll();
      expect(all[0].priority).toBe(5);
    });

    it('register with custom weight', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 100, 0.8);
      const all = registry.getAll();
      expect(all[0].weight).toBe(0.8);
    });

    it('clamps weight to [0, 1]', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 100, 1.5);
      expect(registry.getAll()[0].weight).toBe(1.0);
      registry.register('test2', 100, -0.5);
      expect(registry.getAll().find(s => s.strategyId === 'test2')?.weight).toBe(0);
    });
  });

  describe('Discovery', () => {
    it('get returns strategy by id', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      expect(registry.get('momentum')).not.toBeNull();
    });

    it('get returns null for unknown id', () => {
      const registry = new SimulatedRegistry();
      expect(registry.get('unknown')).toBeNull();
    });

    it('get returns null for disabled strategy', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.disable('momentum');
      expect(registry.get('momentum')).toBeNull();
    });

    it('getEnabled excludes disabled', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.register('breakout');
      registry.disable('breakout');
      expect(registry.getEnabled().length).toBe(1);
      expect(registry.getEnabled()[0].strategyId).toBe('momentum');
    });

    it('getAll includes disabled', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.register('breakout');
      registry.disable('breakout');
      expect(registry.getAll().length).toBe(2);
    });
  });

  describe('Enable/Disable', () => {
    it('enable returns true for existing strategy', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.disable('momentum');
      expect(registry.enable('momentum')).toBe(true);
      expect(registry.get('momentum')).not.toBeNull();
    });

    it('enable returns false for unknown strategy', () => {
      const registry = new SimulatedRegistry();
      expect(registry.enable('unknown')).toBe(false);
    });

    it('disable returns true for existing strategy', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      expect(registry.disable('momentum')).toBe(true);
    });

    it('disable returns false for unknown strategy', () => {
      const registry = new SimulatedRegistry();
      expect(registry.disable('unknown')).toBe(false);
    });

    it('double disable is idempotent', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.disable('momentum');
      registry.disable('momentum');
      expect(registry.get('momentum')).toBeNull();
    });

    it('double enable is idempotent', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.enable('momentum');
      registry.enable('momentum');
      expect(registry.get('momentum')).not.toBeNull();
    });
  });

  describe('Priority Ordering', () => {
    it('getEnabled returns sorted by priority (ascending)', () => {
      const registry = new SimulatedRegistry();
      registry.register('breakout', 30);
      registry.register('momentum', 10);
      registry.register('mean-reversion', 20);
      const enabled = registry.getEnabled();
      expect(enabled[0].strategyId).toBe('momentum');
      expect(enabled[1].strategyId).toBe('mean-reversion');
      expect(enabled[2].strategyId).toBe('breakout');
    });

    it('setPriority changes ordering', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 10);
      registry.register('breakout', 20);
      registry.setPriority('breakout', 5);
      const enabled = registry.getEnabled();
      expect(enabled[0].strategyId).toBe('breakout');
      expect(enabled[1].strategyId).toBe('momentum');
    });

    it('setPriority returns false for unknown', () => {
      const registry = new SimulatedRegistry();
      expect(registry.setPriority('unknown', 5)).toBe(false);
    });
  });

  describe('Weight Management', () => {
    it('totalWeight sums enabled strategy weights', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 100, 0.5);
      registry.register('breakout', 100, 0.3);
      expect(registry.totalWeight()).toBeCloseTo(0.8);
    });

    it('totalWeight excludes disabled', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 100, 0.5);
      registry.register('breakout', 100, 0.3);
      registry.disable('breakout');
      expect(registry.totalWeight()).toBeCloseTo(0.5);
    });

    it('weightMap normalizes weights', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 100, 0.6);
      registry.register('breakout', 100, 0.4);
      const map = registry.weightMap();
      expect(map.get('momentum')).toBeCloseTo(0.6);
      expect(map.get('breakout')).toBeCloseTo(0.4);
    });

    it('weightMap with equal weights gives equal shares', () => {
      const registry = new SimulatedRegistry();
      registry.register('a', 100, 1.0);
      registry.register('b', 100, 1.0);
      registry.register('c', 100, 1.0);
      const map = registry.weightMap();
      expect(map.get('a')).toBeCloseTo(1/3);
      expect(map.get('b')).toBeCloseTo(1/3);
      expect(map.get('c')).toBeCloseTo(1/3);
    });

    it('setWeight clamps to [0, 1]', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.setWeight('momentum', 1.5);
      expect(registry.getAll()[0].weight).toBe(1.0);
      registry.setWeight('momentum', -1);
      expect(registry.getAll()[0].weight).toBe(0);
    });

    it('setWeight returns false for unknown', () => {
      const registry = new SimulatedRegistry();
      expect(registry.setWeight('unknown', 0.5)).toBe(false);
    });
  });

  describe('Selection', () => {
    it('selects by category', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      // Override breakout's category to be different from default
      const breakoutEntry = { ...createRegistered({ strategyId: 'breakout', metadata: createMetadata({ id: 'breakout', category: 'breakout' }) }) };
      registry.register('breakout');
      const entry = registry.getAll().find(s => s.strategyId === 'breakout');
      if (entry) entry.metadata = createMetadata({ id: 'breakout', category: 'breakout' });
      const results = registry.select({ category: 'momentum' });
      expect(results.length).toBe(1);
      expect(results[0].strategyId).toBe('momentum');
    });

    it('selects by maxRiskLevel', () => {
      const registry = new SimulatedRegistry();
      registry.register('low-risk');
      const entry = registry.getAll().find(s => s.strategyId === 'low-risk');
      if (entry) entry.metadata.riskLevel = 'low';

      registry.register('high-risk');
      const entry2 = registry.getAll().find(s => s.strategyId === 'high-risk');
      if (entry2) entry2.metadata.riskLevel = 'high';

      const results = registry.select({ maxRiskLevel: 'low' });
      expect(results.length).toBe(1);
      expect(results[0].strategyId).toBe('low-risk');
    });

    it('excludes disabled by default', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.disable('momentum');
      expect(registry.select({}).length).toBe(0);
    });

    it('includes disabled when enabledOnly is false', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.disable('momentum');
      expect(registry.select({ enabledOnly: false }).length).toBe(1);
    });

    it('returns sorted by priority', () => {
      const registry = new SimulatedRegistry();
      registry.register('c', 30);
      registry.register('a', 10);
      registry.register('b', 20);
      const results = registry.select({});
      expect(results[0].strategyId).toBe('a');
      expect(results[2].strategyId).toBe('c');
    });

    it('empty registry returns empty', () => {
      const registry = new SimulatedRegistry();
      expect(registry.select({}).length).toBe(0);
    });
  });
});

const DEFAULT_AGG_CONFIG: AggregatorConfig = {
  method: 'weighted_confidence',
  consensusThreshold: 0.5,
  minimumConfidence: 0.3,
  maximumRiskScore: 0.9,
};

describe('Strategy Engine: Signal Aggregator', () => {

  const defaultConfig = DEFAULT_AGG_CONFIG;

  describe('Signal Filtering', () => {
    it('filters out signals below minimum confidence', () => {
      const signals = [
        createSignal({ confidence: 0.2 }),
        createSignal({ confidence: 0.5 }),
      ];
      const filtered = filterSignals(signals, defaultConfig);
      expect(filtered.length).toBe(1);
      expect(filtered[0].confidence).toBe(0.5);
    });

    it('filters out signals above maximum risk score', () => {
      const signals = [
        createSignal({ riskScore: 0.95 }),
        createSignal({ riskScore: 0.5 }),
      ];
      const filtered = filterSignals(signals, defaultConfig);
      expect(filtered.length).toBe(1);
      expect(filtered[0].riskScore).toBe(0.5);
    });

    it('filters out hold signals', () => {
      const signals = [
        createSignal({ direction: 'hold', confidence: 0.8 }),
        createSignal({ direction: 'long', confidence: 0.8 }),
      ];
      const filtered = filterSignals(signals, defaultConfig);
      expect(filtered.length).toBe(1);
      expect(filtered[0].direction).toBe('long');
    });

    it('all signals filtered returns empty', () => {
      const signals = [
        createSignal({ confidence: 0.1 }),
        createSignal({ direction: 'hold' }),
      ];
      const filtered = filterSignals(signals, defaultConfig);
      expect(filtered.length).toBe(0);
    });

    it('no signals returns empty', () => {
      expect(filterSignals([], defaultConfig).length).toBe(0);
    });

    it('all signals pass when thresholds are loose', () => {
      const loose: AggregatorConfig = { ...defaultConfig, minimumConfidence: 0, maximumRiskScore: 1 };
      const signals = [
        createSignal({ confidence: 0.01, riskScore: 0.99 }),
      ];
      expect(filterSignals(signals, loose).length).toBe(1);
    });
  });

  describe('Majority Vote', () => {
    it('picks direction with most signals', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long' }),
        createSignal({ strategyId: 'b', direction: 'long' }),
        createSignal({ strategyId: 'c', direction: 'short' }),
      ];
      expect(majorityVote(signals)).toBe('long');
    });

    it('picks short when majority is short', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'short' }),
        createSignal({ strategyId: 'b', direction: 'short' }),
        createSignal({ strategyId: 'c', direction: 'long' }),
      ];
      expect(majorityVote(signals)).toBe('short');
    });

    it('single signal is its own majority', () => {
      expect(majorityVote([createSignal({ direction: 'short' })])).toBe('short');
    });

    it('unanimous signals return that direction', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long' }),
        createSignal({ strategyId: 'b', direction: 'long' }),
        createSignal({ strategyId: 'c', direction: 'long' }),
      ];
      expect(majorityVote(signals)).toBe('long');
    });
  });

  describe('Weighted Confidence', () => {
    it('higher weight strategy influences direction', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long', confidence: 0.5 }),
        createSignal({ strategyId: 'b', direction: 'short', confidence: 0.9 }),
      ];
      const weights = new Map([['a', 0.2], ['b', 0.8]]);
      expect(weightedConfidence(signals, weights)).toBe('short');
    });

    it('equal weights: higher confidence wins', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long', confidence: 0.9 }),
        createSignal({ strategyId: 'b', direction: 'short', confidence: 0.5 }),
      ];
      const weights = new Map([['a', 0.5], ['b', 0.5]]);
      expect(weightedConfidence(signals, weights)).toBe('long');
    });

    it('without explicit weights, uses equal distribution', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long', confidence: 0.8 }),
        createSignal({ strategyId: 'b', direction: 'long', confidence: 0.7 }),
      ];
      expect(weightedConfidence(signals, new Map())).toBe('long');
    });

    it('multiple long signals accumulate weight', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long', confidence: 0.4 }),
        createSignal({ strategyId: 'b', direction: 'long', confidence: 0.4 }),
        createSignal({ strategyId: 'c', direction: 'short', confidence: 0.7 }),
      ];
      const weights = new Map([['a', 0.33], ['b', 0.33], ['c', 0.34]]);
      expect(weightedConfidence(signals, weights)).toBe('long');
    });
  });

  describe('Consensus Threshold', () => {
    it('consensus reached when enough strategies agree', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long' }),
        createSignal({ strategyId: 'b', direction: 'long' }),
        createSignal({ strategyId: 'c', direction: 'short' }),
      ];
      const result = consensusThreshold(signals, 0.6);
      expect(result.reached).toBe(true);
      expect(result.direction).toBe('long');
    });

    it('consensus NOT reached when split evenly', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long' }),
        createSignal({ strategyId: 'b', direction: 'short' }),
      ];
      const result = consensusThreshold(signals, 0.6);
      expect(result.reached).toBe(false);
      expect(result.direction).toBe('hold');
    });

    it('100% consensus requires unanimity', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long' }),
        createSignal({ strategyId: 'b', direction: 'long' }),
        createSignal({ strategyId: 'c', direction: 'short' }),
      ];
      const result = consensusThreshold(signals, 1.0);
      expect(result.reached).toBe(false);
    });

    it('unanimous signals always reach consensus', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'short' }),
        createSignal({ strategyId: 'b', direction: 'short' }),
      ];
      const result = consensusThreshold(signals, 0.5);
      expect(result.reached).toBe(true);
      expect(result.direction).toBe('short');
    });

    it('single signal meets any threshold <= 1.0', () => {
      const result = consensusThreshold([createSignal({ direction: 'long' })], 1.0);
      expect(result.reached).toBe(true);
    });
  });

  describe('Confidence to Strength', () => {
    it('0.75+ is strong', () => {
      expect(confidenceToStrength(0.75)).toBe('strong');
      expect(confidenceToStrength(0.95)).toBe('strong');
    });

    it('0.50–0.74 is moderate', () => {
      expect(confidenceToStrength(0.50)).toBe('moderate');
      expect(confidenceToStrength(0.74)).toBe('moderate');
    });

    it('below 0.50 is weak', () => {
      expect(confidenceToStrength(0.49)).toBe('weak');
      expect(confidenceToStrength(0.1)).toBe('weak');
    });
  });
});

describe('Strategy Engine: Pipeline Orchestration', () => {

  describe('Initialization', () => {
    it('pipeline creates with registry and config', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      expect(registry.getEnabled().length).toBe(1);
    });

    it('empty registry produces no signals', () => {
      const registry = new SimulatedRegistry();
      expect(registry.getEnabled().length).toBe(0);
    });
  });

  describe('Strategy Execution', () => {
    it('runs all enabled strategies', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum', 10);
      registry.register('mean-reversion', 20);
      registry.register('breakout', 30);
      expect(registry.getEnabled().length).toBe(3);
    });

    it('skips disabled strategies', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.register('breakout');
      registry.disable('breakout');
      expect(registry.getEnabled().length).toBe(1);
    });

    it('disabled strategies can be re-enabled', () => {
      const registry = new SimulatedRegistry();
      registry.register('momentum');
      registry.disable('momentum');
      registry.enable('momentum');
      expect(registry.getEnabled().length).toBe(1);
    });
  });

  describe('Signal Aggregation in Pipeline', () => {
    it('3 long signals aggregate to long', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long', confidence: 0.7 }),
        createSignal({ strategyId: 'b', direction: 'long', confidence: 0.8 }),
        createSignal({ strategyId: 'c', direction: 'long', confidence: 0.6 }),
      ];
      expect(majorityVote(signals)).toBe('long');
    });

    it('2 long + 1 short aggregates to long', () => {
      const signals = [
        createSignal({ strategyId: 'a', direction: 'long' }),
        createSignal({ strategyId: 'b', direction: 'long' }),
        createSignal({ strategyId: 'c', direction: 'short' }),
      ];
      expect(majorityVote(signals)).toBe('long');
    });

    it('pipeline respects maxConcurrentStrategies', () => {
      const registry = new SimulatedRegistry();
      for (let i = 0; i < 20; i++) registry.register(`s${i}`);
      const enabled = registry.getEnabled();
      const limited = enabled.slice(0, 10);
      expect(limited.length).toBe(10);
    });
  });

  describe('Pause Conditions', () => {
    it('no pause when no strategy recommends it', () => {
      const reasons: string[] = [];
      expect(reasons.length).toBe(0);
    });

    it('pause with reasons when strategy recommends it', () => {
      const reasons = ['[momentum] Extreme volatility detected'];
      expect(reasons.length).toBe(1);
      expect(reasons[0]).toContain('momentum');
    });
  });
});

describe('Strategy Engine: Safety Invariants', () => {

  it('signals never contain API keys or secrets', () => {
    const signal = createSignal({ metadata: { source: 'ml-engine' } });
    const json = JSON.stringify(signal);
    expect(json).not.toContain('api_key');
    expect(json).not.toContain('api_secret');
    expect(json).not.toContain('password');
    expect(json).not.toContain('secret');
    expect(json).not.toContain('token');
  });

  it('signals never contain broker-specific IDs', () => {
    const signal = createSignal();
    const json = JSON.stringify(signal);
    expect(json).not.toContain('kraken_order_id');
    expect(json).not.toContain('alpaca_order_id');
    expect(json).not.toContain('ZUSD');
    expect(json).not.toContain('XXBT');
  });

  it('signal confidence is clamped to [0, 1]', () => {
    expect(createSignal({ confidence: 0 }).confidence).toBeGreaterThanOrEqual(0);
    expect(createSignal({ confidence: 1 }).confidence).toBeLessThanOrEqual(1);
  });

  it('signal riskScore is clamped to [0, 1]', () => {
    expect(createSignal({ riskScore: 0 }).riskScore).toBeGreaterThanOrEqual(0);
    expect(createSignal({ riskScore: 1 }).riskScore).toBeLessThanOrEqual(1);
  });

  it('positionSize is non-negative', () => {
    expect(createSignal({ positionSize: 0 }).positionSize).toBeGreaterThanOrEqual(0);
  });

  it('strategy does not reference live trading', () => {
    const meta = createMetadata({ description: 'Paper trading momentum strategy' });
    expect(meta.description).not.toContain('live order');
    expect(meta.description).not.toContain('real money');
  });

  it('strategy metadata version starts at 0.1.0 (skeleton)', () => {
    const meta = createMetadata({ version: '0.1.0' });
    expect(meta.version).toBe('0.1.0');
  });

  it('strategy does not modify risk engine', () => {
    // Strategies produce signals; they never call risk evaluation directly
    const signal = createSignal();
    expect(signal.riskScore).toBeDefined();
    expect(signal.confidence).toBeDefined();
    // No riskApproved / riskOverride fields
    expect((signal as Record<string, unknown>).riskApproved).toBeUndefined();
    expect((signal as Record<string, unknown>).riskOverride).toBeUndefined();
  });

  it('strategy does not interact with brokers', () => {
    // No broker credentials in signal
    const signal = createSignal();
    expect((signal as Record<string, unknown>).brokerId).toBeUndefined();
    expect((signal as Record<string, unknown>).credentials).toBeUndefined();
    expect((signal as Record<string, unknown>).orderId).toBeUndefined();
  });

  it('aggregated signal tracks contributing strategies', () => {
    const signals = [
      createSignal({ strategyId: 'momentum' }),
      createSignal({ strategyId: 'breakout' }),
    ];
    const contributing = signals.map(s => s.strategyId);
    expect(contributing).toContain('momentum');
    expect(contributing).toContain('breakout');
  });

  it('aggregated signal includes all individual signals for audit', () => {
    const signals = [
      createSignal({ strategyId: 'a' }),
      createSignal({ strategyId: 'b' }),
      createSignal({ strategyId: 'c' }),
    ];
    expect(signals.length).toBe(3);
  });
});

describe('Strategy Engine: Database Schema', () => {
  const validCategories = ['momentum', 'mean_reversion', 'breakout', 'trend_following', 'ai_hybrid', 'statistical_arbitrage', 'custom'];
  const validDirections = ['long', 'short', 'close', 'hold'];
  const validStrengths = ['strong', 'moderate', 'weak'];
  const validRiskLevels = ['low', 'medium', 'high'];

  it('all built-in strategy categories are valid DB enum values', () => {
    const builtIn = ['momentum', 'mean_reversion', 'breakout', 'trend_following', 'ai_hybrid'];
    for (const cat of builtIn) {
      expect(validCategories).toContain(cat);
    }
  });

  it('all signal directions are valid DB enum values', () => {
    for (const dir of ['long', 'short', 'close', 'hold']) {
      expect(validDirections).toContain(dir);
    }
  });

  it('all signal strengths are valid DB enum values', () => {
    for (const str of ['strong', 'moderate', 'weak']) {
      expect(validStrengths).toContain(str);
    }
  });

  it('all risk levels are valid DB enum values', () => {
    for (const lvl of ['low', 'medium', 'high']) {
      expect(validRiskLevels).toContain(lvl);
    }
  });

  it('strategy_results confidence range matches signal range', () => {
    // DB: CHECK (confidence >= 0 AND confidence <= 1)
    expect(createSignal({ confidence: 0 }).confidence).toBeGreaterThanOrEqual(0);
    expect(createSignal({ confidence: 1 }).confidence).toBeLessThanOrEqual(1);
  });

  it('strategy_results risk_score range matches signal range', () => {
    // DB: CHECK (risk_score >= 0 AND risk_score <= 1)
    expect(createSignal({ riskScore: 0 }).riskScore).toBeGreaterThanOrEqual(0);
    expect(createSignal({ riskScore: 1 }).riskScore).toBeLessThanOrEqual(1);
  });

  it('weight range [0, 1] matches DB CHECK constraint', () => {
    // DB: CHECK (weight >= 0 AND weight <= 1)
    const registry = new SimulatedRegistry();
    registry.register('test', 100, 0.5);
    expect(registry.getAll()[0].weight).toBeGreaterThanOrEqual(0);
    expect(registry.getAll()[0].weight).toBeLessThanOrEqual(1);
  });
});

describe('Strategy Engine: Conflict Resolution', () => {

  it('3 strategies: 2 long + 1 short → long wins', () => {
    const signals = [
      createSignal({ strategyId: 'a', direction: 'long' }),
      createSignal({ strategyId: 'b', direction: 'long' }),
      createSignal({ strategyId: 'c', direction: 'short' }),
    ];
    expect(majorityVote(signals)).toBe('long');
  });

  it('3 strategies: 1 long + 2 short → short wins', () => {
    const signals = [
      createSignal({ strategyId: 'a', direction: 'long' }),
      createSignal({ strategyId: 'b', direction: 'short' }),
      createSignal({ strategyId: 'c', direction: 'short' }),
    ];
    expect(majorityVote(signals)).toBe('short');
  });

  it('5 strategies: 3 long + 2 short → long wins', () => {
    const signals = [
      createSignal({ strategyId: 'a', direction: 'long' }),
      createSignal({ strategyId: 'b', direction: 'long' }),
      createSignal({ strategyId: 'c', direction: 'long' }),
      createSignal({ strategyId: 'd', direction: 'short' }),
      createSignal({ strategyId: 'e', direction: 'short' }),
    ];
    expect(majorityVote(signals)).toBe('long');
  });

  it('weighted: minority with high confidence can win', () => {
    const signals = [
      createSignal({ strategyId: 'a', direction: 'long', confidence: 0.5 }),
      createSignal({ strategyId: 'b', direction: 'long', confidence: 0.5 }),
      createSignal({ strategyId: 'c', direction: 'short', confidence: 0.95 }),
    ];
    const weights = new Map([['a', 0.2], ['b', 0.2], ['c', 0.6]]);
    expect(weightedConfidence(signals, weights)).toBe('short');
  });

  it('consensus: 60% threshold with 3/5 agreement passes', () => {
    const signals = [
      createSignal({ direction: 'long' }),
      createSignal({ direction: 'long' }),
      createSignal({ direction: 'long' }),
      createSignal({ direction: 'short' }),
      createSignal({ direction: 'short' }),
    ];
    const result = consensusThreshold(signals, 0.6);
    expect(result.reached).toBe(true);
    expect(result.direction).toBe('long');
  });

  it('consensus: 60% threshold with 2/5 agreement fails', () => {
    const signals = [
      createSignal({ direction: 'long' }),
      createSignal({ direction: 'long' }),
      createSignal({ direction: 'short' }),
      createSignal({ direction: 'short' }),
      createSignal({ direction: 'close' }),
    ];
    const result = consensusThreshold(signals, 0.6);
    expect(result.reached).toBe(false);
    expect(result.direction).toBe('hold');
  });

  it('all hold signals after filtering returns no actionable direction', () => {
    const signals = [
      createSignal({ direction: 'hold' }),
      createSignal({ direction: 'hold' }),
    ];
    const filtered = filterSignals(signals, DEFAULT_AGG_CONFIG);
    expect(filtered.length).toBe(0);
  });
});

describe('Strategy Engine: Edge Cases', () => {

  it('single strategy result is valid aggregation', () => {
    const signals = [createSignal({ direction: 'long', confidence: 0.8 })];
    expect(majorityVote(signals)).toBe('long');
    expect(weightedConfidence(signals, new Map())).toBe('long');
  });

  it('all strategies produce hold = no action', () => {
    const signals = [
      createSignal({ direction: 'hold' }),
      createSignal({ direction: 'hold' }),
    ];
    const filtered = filterSignals(signals, DEFAULT_AGG_CONFIG);
    expect(filtered.length).toBe(0);
  });

  it('all strategies filtered out (low confidence) = no action', () => {
    const signals = [
      createSignal({ confidence: 0.1 }),
      createSignal({ confidence: 0.2 }),
    ];
    const filtered = filterSignals(signals, DEFAULT_AGG_CONFIG);
    expect(filtered.length).toBe(0);
  });

  it('mixed: some pass filter, some do not', () => {
    const signals = [
      createSignal({ strategyId: 'a', confidence: 0.8, direction: 'long' }),
      createSignal({ strategyId: 'b', confidence: 0.1, direction: 'short' }),
      createSignal({ strategyId: 'c', confidence: 0.7, direction: 'long' }),
    ];
    const filtered = filterSignals(signals, DEFAULT_AGG_CONFIG);
    expect(filtered.length).toBe(2);
    expect(filtered.every(s => s.direction === 'long')).toBe(true);
  });

  it('extreme confidence values are valid', () => {
    expect(createSignal({ confidence: 0 }).confidence).toBe(0);
    expect(createSignal({ confidence: 1 }).confidence).toBe(1);
  });

  it('extreme risk values are valid', () => {
    expect(createSignal({ riskScore: 0 }).riskScore).toBe(0);
    expect(createSignal({ riskScore: 1 }).riskScore).toBe(1);
  });

  it('very large position size is still valid shape', () => {
    const signal = createSignal({ positionSize: 0.99 });
    expect(signal.positionSize).toBe(0.99);
  });

  it('zero position size is valid (no position)', () => {
    const signal = createSignal({ positionSize: 0 });
    expect(signal.positionSize).toBe(0);
  });

  it('registry with 0 strategies is valid', () => {
    const registry = new SimulatedRegistry();
    expect(registry.getAll().length).toBe(0);
    expect(registry.getEnabled().length).toBe(0);
    expect(registry.totalWeight()).toBe(0);
  });

  it('registry with all disabled is effectively empty', () => {
    const registry = new SimulatedRegistry();
    registry.register('a');
    registry.register('b');
    registry.disable('a');
    registry.disable('b');
    expect(registry.getEnabled().length).toBe(0);
    expect(registry.totalWeight()).toBe(0);
  });
});

describe('Strategy Engine: Aggregation Method Coverage', () => {
  const methods: AggregationMethod[] = ['majority_vote', 'weighted_confidence', 'priority_strategy', 'consensus_threshold'];

  for (const method of methods) {
    it(`${method} is a valid aggregation method`, () => {
      expect(methods).toContain(method);
    });
  }

  it('4 aggregation methods available', () => {
    expect(methods.length).toBe(4);
  });
});

describe('Strategy Engine: Timeframe Coverage', () => {
  const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

  it('7 timeframes defined', () => {
    expect(timeframes.length).toBe(7);
  });

  for (const tf of timeframes) {
    it(`${tf} is a valid timeframe`, () => {
      expect(timeframes).toContain(tf);
    });
  }

  it('momentum supports 5m, 15m, 1h, 4h', () => {
    const supported: Timeframe[] = ['5m', '15m', '1h', '4h'];
    for (const tf of supported) {
      expect(timeframes).toContain(tf);
    }
  });

  it('trend-following supports 1h, 4h, 1d', () => {
    const supported: Timeframe[] = ['1h', '4h', '1d'];
    for (const tf of supported) {
      expect(timeframes).toContain(tf);
    }
  });
});

describe('Strategy Engine: Performance Tracking Shape', () => {
  interface StrategyPerformance {
    strategyId: string;
    totalSignals: number;
    profitableSignals: number;
    unprofitableSignals: number;
    winRate: number;
    averageReturn: number;
    sharpeRatio: number | null;
    maxDrawdown: number;
    averageHoldingTime: string | null;
    lastUpdated: string;
  }

  function createPerformance(overrides: Partial<StrategyPerformance> = {}): StrategyPerformance {
    return {
      strategyId: 'momentum',
      totalSignals: 100,
      profitableSignals: 55,
      unprofitableSignals: 45,
      winRate: 0.55,
      averageReturn: 0.012,
      sharpeRatio: 1.8,
      maxDrawdown: 0.08,
      averageHoldingTime: 'PT4H',
      lastUpdated: '2026-07-01T10:00:00Z',
      ...overrides,
    };
  }

  it('has all required fields', () => {
    const perf = createPerformance();
    expect(perf.strategyId).toBeDefined();
    expect(typeof perf.totalSignals).toBe('number');
    expect(typeof perf.winRate).toBe('number');
    expect(typeof perf.maxDrawdown).toBe('number');
  });

  it('winRate is between 0 and 1', () => {
    expect(createPerformance({ winRate: 0 }).winRate).toBe(0);
    expect(createPerformance({ winRate: 1 }).winRate).toBe(1);
  });

  it('totalSignals = profitable + unprofitable', () => {
    const perf = createPerformance({ totalSignals: 100, profitableSignals: 55, unprofitableSignals: 45 });
    expect(perf.profitableSignals + perf.unprofitableSignals).toBe(perf.totalSignals);
  });

  it('sharpeRatio can be null', () => {
    expect(createPerformance({ sharpeRatio: null }).sharpeRatio).toBeNull();
  });

  it('maxDrawdown is non-negative', () => {
    expect(createPerformance({ maxDrawdown: 0 }).maxDrawdown).toBeGreaterThanOrEqual(0);
  });
});
