export interface MCPFlags {
  multiExchange: boolean;
  sentiment: boolean;
  onchain: boolean;
  economicCalendar: boolean;
}

type EnvSource = Record<string, string | undefined>;

export function parseFlags(env: EnvSource): MCPFlags {
  return {
    multiExchange: env.VITE_ENABLE_MULTI_EXCHANGE_DATA === 'true',
    sentiment: env.VITE_ENABLE_SENTIMENT_ANALYSIS === 'true',
    onchain: env.VITE_ENABLE_ONCHAIN_METRICS === 'true',
    economicCalendar: env.VITE_ENABLE_ECONOMIC_CALENDAR === 'true',
  };
}

export const flags: MCPFlags = parseFlags(
  import.meta.env as unknown as EnvSource
);
