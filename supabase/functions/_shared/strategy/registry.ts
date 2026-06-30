// =============================================================================
// Strategy Registry
//
// Central registry for all trading strategies. Mirrors the BrokerRegistry
// pattern. Responsible for:
//   - Registering strategies at startup
//   - Discovering available strategies
//   - Enabling/disabling strategies
//   - Strategy health tracking
//   - Priority ordering
//   - Conflict resolution (when strategies disagree)
//   - Weighted voting for signal aggregation
//
// The registry is strategy-agnostic. It only knows adapters by their interface.
// =============================================================================

import type { StrategyAdapter } from './adapter.ts';
import type {
  StrategyMetadata,
  StrategyHealth,
  StrategyResult,
  StrategyCategory,
  Timeframe,
} from './types.ts';

// ---------------------------------------------------------------------------
// Registration Types
// ---------------------------------------------------------------------------

export interface RegisteredStrategy {
  adapter: StrategyAdapter;
  metadata: StrategyMetadata;
  lastHealth?: StrategyHealth;
  enabled: boolean;
  priority: number;  // lower = higher priority
  weight: number;    // 0.0 – 1.0, used by weighted aggregation
}

export interface StrategySelectionCriteria {
  symbol?: string;
  category?: StrategyCategory;
  timeframe?: Timeframe;
  maxRiskLevel?: 'low' | 'medium' | 'high';
  enabledOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class StrategyRegistry {
  private strategies: Map<string, RegisteredStrategy> = new Map();

  /**
   * Register a strategy adapter with optional priority and weight.
   * Lower priority = checked first. Weight affects aggregation voting.
   */
  register(
    adapter: StrategyAdapter,
    priority: number = 100,
    weight: number = 1.0
  ): void {
    const metadata = adapter.getMetadata();
    this.strategies.set(adapter.strategyId, {
      adapter,
      metadata,
      enabled: true,
      priority,
      weight: Math.max(0, Math.min(1, weight)),
    });
  }

  /**
   * Remove a strategy from the registry entirely.
   */
  unregister(strategyId: string): void {
    this.strategies.delete(strategyId);
  }

  /**
   * Get a single strategy by ID. Returns null if not found or disabled
   * (unless includeDisabled is true).
   */
  get(strategyId: string, includeDisabled: boolean = false): StrategyAdapter | null {
    const entry = this.strategies.get(strategyId);
    if (!entry) return null;
    if (!entry.enabled && !includeDisabled) return null;
    return entry.adapter;
  }

  /**
   * Get the full registration record for a strategy.
   */
  getRegistration(strategyId: string): RegisteredStrategy | null {
    return this.strategies.get(strategyId) ?? null;
  }

  /**
   * Get all registered strategies (including disabled).
   */
  getAll(): RegisteredStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get only enabled strategies, sorted by priority (lowest first).
   */
  getEnabled(): RegisteredStrategy[] {
    return this.getAll()
      .filter(s => s.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Enable a strategy.
   */
  enable(strategyId: string): boolean {
    const entry = this.strategies.get(strategyId);
    if (!entry) return false;
    entry.enabled = true;
    return true;
  }

  /**
   * Disable a strategy (keeps it registered but excluded from selection).
   */
  disable(strategyId: string): boolean {
    const entry = this.strategies.get(strategyId);
    if (!entry) return false;
    entry.enabled = false;
    return true;
  }

  /**
   * Update a strategy's priority.
   */
  setPriority(strategyId: string, priority: number): boolean {
    const entry = this.strategies.get(strategyId);
    if (!entry) return false;
    entry.priority = priority;
    return true;
  }

  /**
   * Update a strategy's weight for aggregation.
   */
  setWeight(strategyId: string, weight: number): boolean {
    const entry = this.strategies.get(strategyId);
    if (!entry) return false;
    entry.weight = Math.max(0, Math.min(1, weight));
    return true;
  }

  /**
   * Select strategies matching the given criteria, sorted by priority.
   */
  select(criteria: StrategySelectionCriteria): StrategyAdapter[] {
    const riskOrder: Record<string, number> = { low: 1, medium: 2, high: 3 };

    return this.getAll()
      .filter(s => {
        if (criteria.enabledOnly !== false && !s.enabled) return false;
        if (criteria.category && s.metadata.category !== criteria.category) return false;
        if (criteria.symbol && s.metadata.supportedSymbols.length > 0 &&
            !s.metadata.supportedSymbols.includes(criteria.symbol)) return false;
        if (criteria.timeframe && !s.metadata.supportedTimeframes.includes(criteria.timeframe)) return false;
        if (criteria.maxRiskLevel) {
          const maxRisk = riskOrder[criteria.maxRiskLevel] ?? 3;
          const stratRisk = riskOrder[s.metadata.riskLevel] ?? 3;
          if (stratRisk > maxRisk) return false;
        }
        if (s.lastHealth?.status === 'error') return false;
        return true;
      })
      .sort((a, b) => a.priority - b.priority)
      .map(s => s.adapter);
  }

  /**
   * Run health checks on all registered strategies.
   */
  async healthCheckAll(): Promise<Map<string, StrategyHealth>> {
    const results = new Map<string, StrategyHealth>();

    for (const [strategyId, entry] of this.strategies) {
      const health = entry.adapter.getHealth();
      entry.lastHealth = health;
      results.set(strategyId, health);
    }

    return results;
  }

  /**
   * Get metadata for all enabled strategies.
   */
  listMetadata(): StrategyMetadata[] {
    return this.getEnabled().map(s => s.metadata);
  }

  /**
   * Find strategies by category.
   */
  findByCategory(category: StrategyCategory): StrategyAdapter[] {
    return this.getEnabled()
      .filter(s => s.metadata.category === category)
      .map(s => s.adapter);
  }

  /**
   * Get the total weight of all enabled strategies (for normalization).
   */
  totalWeight(): number {
    return this.getEnabled().reduce((sum, s) => sum + s.weight, 0);
  }

  /**
   * Get the weight map for aggregation: strategyId -> normalized weight.
   */
  weightMap(): Map<string, number> {
    const total = this.totalWeight();
    const map = new Map<string, number>();
    for (const s of this.getEnabled()) {
      map.set(s.adapter.strategyId, total > 0 ? s.weight / total : 0);
    }
    return map;
  }
}

// Singleton registry instance
export const strategyRegistry = new StrategyRegistry();
