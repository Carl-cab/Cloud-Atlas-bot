// =============================================================================
// Broker Abstraction Layer — Public API
//
// Import everything from this barrel module:
//   import { BrokerAdapter, BrokerRegistry, KrakenBrokerAdapter, ... } from '../_shared/broker/mod.ts';
// =============================================================================

// Core types
export type {
  AssetClass,
  AssetInfo,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  OrderRequest,
  Order,
  PositionSide,
  Position,
  Balance,
  AccountBalances,
  Ticker,
  OHLCV,
  Trade,
  FeeEstimate,
  BrokerHealthStatus,
  BrokerHealth,
  BrokerCapabilities,
  BrokerCredentials,
  BrokerResult,
} from './types.ts';

// Adapter interface
export type { BrokerAdapter } from './adapter.ts';

// Registry
export { BrokerRegistry, brokerRegistry } from './registry.ts';
export type { BrokerSelectionCriteria, RegisteredBroker } from './registry.ts';

// Built-in adapters
export { KrakenBrokerAdapter } from './adapters/kraken.ts';
export { PaperBrokerAdapter } from './adapters/paper.ts';

// Audit
export { emitBrokerAudit } from './audit.ts';
export type { BrokerAuditAction, BrokerAuditEvent } from './audit.ts';
