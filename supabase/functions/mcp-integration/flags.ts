export interface MCPFlags {
  multiExchange: boolean;
  sentiment: boolean;
  onchain: boolean;
  economicCalendar: boolean;
}

type EnvSource = { get(key: string): string | undefined };

export function parseFlags(env: EnvSource): MCPFlags {
  return {
    multiExchange: env.get('ENABLE_MULTI_EXCHANGE_DATA') === 'true',
    sentiment: env.get('ENABLE_SENTIMENT_ANALYSIS') === 'true',
    onchain: env.get('ENABLE_ONCHAIN_METRICS') === 'true',
    economicCalendar: env.get('ENABLE_ECONOMIC_CALENDAR') === 'true',
  };
}

export const flags: MCPFlags = parseFlags(Deno.env);
