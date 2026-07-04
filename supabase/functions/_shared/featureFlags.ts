// =============================================================================
// Feature Flags
//
// Environment-variable-based feature flags for safe, incremental rollout.
// All flags default to OFF (false) unless explicitly set to 'true'.
// =============================================================================

export function useBrokerAdapters(): boolean {
  return Deno.env.get('USE_BROKER_ADAPTERS') === 'true';
}

/**
 * Gate for the Strategy Engine paper experiment. Default OFF. When on, the
 * validated volatility-expansion strategy generates signals in PAPER mode
 * only (the wiring hard-guards on bot mode). This flag must NEVER enable any
 * behavior in live mode — it is a zero-capital forward-evidence experiment.
 */
export function useStrategyEngine(): boolean {
  return Deno.env.get('USE_STRATEGY_ENGINE') === 'true';
}
