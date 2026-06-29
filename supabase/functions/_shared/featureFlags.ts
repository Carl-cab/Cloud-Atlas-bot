// =============================================================================
// Feature Flags
//
// Environment-variable-based feature flags for safe, incremental rollout.
// All flags default to OFF (false) unless explicitly set to 'true'.
// =============================================================================

export function useBrokerAdapters(): boolean {
  return Deno.env.get('USE_BROKER_ADAPTERS') === 'true';
}
