// =============================================================================
// Broker Registry
//
// Central registry for all broker adapters. Responsible for:
//   - Registering adapters at startup
//   - Selecting the right adapter for a user/asset/strategy
//   - Health-checking registered brokers
//   - Failover when a broker goes down
//
// The registry is broker-agnostic. It only knows adapters by their interface.
// =============================================================================

import type { BrokerAdapter } from './adapter.ts';
import type {
  AssetClass,
  BrokerHealth,
  BrokerCapabilities,
  BrokerResult,
} from './types.ts';

export interface BrokerSelectionCriteria {
  userId: string;
  preferredBrokerId?: string;
  assetClass?: AssetClass;
  symbol?: string;
  requirePaperTrading?: boolean;
}

export interface RegisteredBroker {
  adapter: BrokerAdapter;
  capabilities: BrokerCapabilities;
  lastHealth?: BrokerHealth;
  enabled: boolean;
  priority: number;
}

export class BrokerRegistry {
  private brokers: Map<string, RegisteredBroker> = new Map();

  register(adapter: BrokerAdapter, priority: number = 100): void {
    const capabilities = adapter.getCapabilities();
    this.brokers.set(adapter.brokerId, {
      adapter,
      capabilities,
      enabled: true,
      priority,
    });
  }

  unregister(brokerId: string): void {
    this.brokers.delete(brokerId);
  }

  get(brokerId: string): BrokerAdapter | null {
    const entry = this.brokers.get(brokerId);
    return entry?.enabled ? entry.adapter : null;
  }

  getAll(): RegisteredBroker[] {
    return Array.from(this.brokers.values());
  }

  getEnabled(): RegisteredBroker[] {
    return this.getAll().filter(b => b.enabled);
  }

  /**
   * Select the best broker for the given criteria.
   *
   * Priority order:
   *   1. User's preferred broker (if set and capable)
   *   2. Highest-priority broker that supports the asset/class
   *   3. Any healthy broker as fallback
   */
  select(criteria: BrokerSelectionCriteria): BrokerAdapter | null {
    const candidates = this.getEnabled()
      .filter(b => {
        if (criteria.requirePaperTrading && !b.capabilities.supportsPaperTrading) return false;
        if (criteria.assetClass && !b.capabilities.supportedAssetClasses.includes(criteria.assetClass)) return false;
        if (criteria.symbol && !b.adapter.supportsAsset(criteria.symbol)) return false;
        if (b.lastHealth?.status === 'down') return false;
        return true;
      })
      .sort((a, b) => {
        // Preferred broker gets top priority
        if (criteria.preferredBrokerId) {
          if (a.adapter.brokerId === criteria.preferredBrokerId) return -1;
          if (b.adapter.brokerId === criteria.preferredBrokerId) return 1;
        }
        // Then by priority (lower = higher priority)
        return a.priority - b.priority;
      });

    return candidates.length > 0 ? candidates[0].adapter : null;
  }

  /**
   * Run health checks on all registered brokers.
   * Updates the lastHealth field for selection/failover decisions.
   */
  async healthCheckAll(): Promise<Map<string, BrokerResult<BrokerHealth>>> {
    const results = new Map<string, BrokerResult<BrokerHealth>>();

    for (const [brokerId, entry] of this.brokers) {
      const result = await entry.adapter.healthCheck();
      if (result.success && result.data) {
        entry.lastHealth = result.data;
      }
      results.set(brokerId, result);
    }

    return results;
  }

  /**
   * Get broker capabilities for display or decision-making.
   */
  listCapabilities(): BrokerCapabilities[] {
    return this.getEnabled().map(b => b.capabilities);
  }

  /**
   * Find all brokers that support a given asset class.
   */
  findByAssetClass(assetClass: AssetClass): BrokerAdapter[] {
    return this.getEnabled()
      .filter(b => b.capabilities.supportedAssetClasses.includes(assetClass))
      .map(b => b.adapter);
  }

  /**
   * Attempt failover: returns the next-best broker when the primary fails.
   */
  failover(failedBrokerId: string, criteria: BrokerSelectionCriteria): BrokerAdapter | null {
    const entry = this.brokers.get(failedBrokerId);
    if (entry) {
      entry.lastHealth = {
        status: 'down',
        latencyMs: -1,
        rateLimitRemaining: 0,
        rateLimitTotal: 0,
        checkedAt: new Date().toISOString(),
        message: 'Marked down after failover trigger',
      };
    }

    return this.select(criteria);
  }
}

// Singleton registry instance
export const brokerRegistry = new BrokerRegistry();
