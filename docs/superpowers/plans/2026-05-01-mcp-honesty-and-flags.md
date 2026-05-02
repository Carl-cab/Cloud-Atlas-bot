# MCP Honesty Pass + Feature Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `docs/MCP_IMPLEMENTATION.md` match reality (honesty pass) and wire up the four `ENABLE_*` feature flags the doc claims exist but never had implementations (config infrastructure).

**Architecture:** Two thin flag-helper modules — one for Vite (`import.meta.env`), one for Deno (`Deno.env.get`) — each exporting a typed `MCPFlags` object derived via a pure parser function (testable without env mocking). Gating happens at the public API surface of `MCPServer` (`listResources`, `listTools`, `readResource`, `callTool`) and at the action switch in the edge function — placeholder implementations themselves are left intact and gain `simulated: true` markers in their responses. All flags default OFF; the dashboard already tolerates `null` resource values via `Promise.allSettled`.

**Tech Stack:** TypeScript, Vite, Deno (Supabase Edge Functions), Vitest (jsdom), Supabase JS client.

**Spec:** [docs/superpowers/specs/2026-05-01-mcp-honesty-and-flags-design.md](../specs/2026-05-01-mcp-honesty-and-flags-design.md)

**Convention note:** Tests live under `src/test/` in this codebase (e.g., `src/test/components/`, `src/test/integration/`). New MCP tests go in `src/test/mcp/`. The spec's reference to `src/mcp/flags.test.ts` is overridden by this codebase convention.

---

## Task 1: Create the Vite-side flag module with TDD

**Files:**
- Create: `src/mcp/flags.ts`
- Create: `src/test/mcp/flags.test.ts`

- [ ] **Step 1: Create the test directory**

Run: `mkdir -p src/test/mcp`
Expected: directory created (silent on success)

- [ ] **Step 2: Write failing tests for `parseFlags`**

Create `src/test/mcp/flags.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFlags } from '@/mcp/flags';

describe('parseFlags', () => {
  it('returns true only when env var is the literal string "true"', () => {
    const flags = parseFlags({
      VITE_ENABLE_MULTI_EXCHANGE_DATA: 'true',
      VITE_ENABLE_SENTIMENT_ANALYSIS: 'true',
      VITE_ENABLE_ONCHAIN_METRICS: 'true',
      VITE_ENABLE_ECONOMIC_CALENDAR: 'true',
    });
    expect(flags).toEqual({
      multiExchange: true,
      sentiment: true,
      onchain: true,
      economicCalendar: true,
    });
  });

  it('treats unset env vars as false', () => {
    const flags = parseFlags({});
    expect(flags).toEqual({
      multiExchange: false,
      sentiment: false,
      onchain: false,
      economicCalendar: false,
    });
  });

  it.each([
    ['false'],
    [''],
    ['1'],
    ['yes'],
    ['TRUE'],
    ['True'],
    [undefined],
  ])('treats %j as false (no coercion)', (value) => {
    const flags = parseFlags({
      VITE_ENABLE_SENTIMENT_ANALYSIS: value as string | undefined,
    });
    expect(flags.sentiment).toBe(false);
  });

  it('treats individual flags independently', () => {
    const flags = parseFlags({
      VITE_ENABLE_MULTI_EXCHANGE_DATA: 'true',
      VITE_ENABLE_SENTIMENT_ANALYSIS: 'false',
    });
    expect(flags.multiExchange).toBe(true);
    expect(flags.sentiment).toBe(false);
    expect(flags.onchain).toBe(false);
    expect(flags.economicCalendar).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npx vitest run src/test/mcp/flags.test.ts`
Expected: FAIL — module `@/mcp/flags` not found / `parseFlags is not a function`.

- [ ] **Step 4: Implement `flags.ts`**

Create `src/mcp/flags.ts`:

```typescript
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
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run src/test/mcp/flags.test.ts`
Expected: 4 passing tests (the `it.each` counts as one suite producing 7 sub-cases — also pass).

- [ ] **Step 6: Commit**

```bash
git add src/mcp/flags.ts src/test/mcp/flags.test.ts
git commit -m "feat(mcp): add typed feature-flag parser for Vite-side MCP gating"
```

---

## Task 2: Create the Deno-side flag module

**Files:**
- Create: `supabase/functions/mcp-integration/flags.ts`

No tests for this file — the repo has no Deno test infrastructure (only Vitest/jsdom for the browser bundle). The parser function is identical in shape to the Vitest-tested `parseFlags`, so the logic is exercised by Task 1.

- [ ] **Step 1: Create the Deno flag module**

Create `supabase/functions/mcp-integration/flags.ts`:

```typescript
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
```

- [ ] **Step 2: Verify the file is syntactically valid**

Run: `npx tsc --noEmit --target esnext --module esnext --moduleResolution bundler --skipLibCheck supabase/functions/mcp-integration/flags.ts`
Expected: no output (success). If `tsc` complains about `Deno`, that's expected — the file ships to a Deno runtime, not Node. As long as the only complaint is `Cannot find name 'Deno'`, it's fine; the edge function deploys with Deno's globals available.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/mcp-integration/flags.ts
git commit -m "feat(mcp): add Deno-side feature-flag reader for edge function"
```

---

## Task 3: Add `MCPDisabledError`, flag maps, and gate `listResources`/`listTools`

**Files:**
- Modify: `src/mcp/mcp-server.ts`
- Create: `src/test/mcp/mcp-server.test.ts`

- [ ] **Step 1: Write failing tests for `listResources` and `listTools` filtering**

Create `src/test/mcp/mcp-server.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MCPServer, MCPDisabledError } from '@/mcp/mcp-server';
import type { MCPFlags } from '@/mcp/flags';

const allOff: MCPFlags = {
  multiExchange: false,
  sentiment: false,
  onchain: false,
  economicCalendar: false,
};

const allOn: MCPFlags = {
  multiExchange: true,
  sentiment: true,
  onchain: true,
  economicCalendar: true,
};

describe('MCPServer.listResources', () => {
  it('filters out gated resources when their flags are off', async () => {
    const server = new MCPServer({ flags: allOff });
    const uris = (await server.listResources()).map((r) => r.uri);

    expect(uris).toContain('mcp://market-data/kraken'); // always on
    expect(uris).toContain('mcp://news/crypto'); // always on
    expect(uris).not.toContain('mcp://market-data/binance'); // multiExchange
    expect(uris).not.toContain('mcp://sentiment/social'); // sentiment
    expect(uris).not.toContain('mcp://blockchain/metrics'); // onchain
    expect(uris).not.toContain('mcp://economic/calendar'); // economicCalendar
  });

  it('includes gated resources when their flags are on', async () => {
    const server = new MCPServer({ flags: allOn });
    const uris = (await server.listResources()).map((r) => r.uri);

    expect(uris).toContain('mcp://market-data/binance');
    expect(uris).toContain('mcp://sentiment/social');
    expect(uris).toContain('mcp://blockchain/metrics');
    expect(uris).toContain('mcp://economic/calendar');
  });
});

describe('MCPServer.listTools', () => {
  it('filters out gated tools when their flags are off', async () => {
    const server = new MCPServer({ flags: allOff });
    const names = (await server.listTools()).map((t) => t.name);

    expect(names).toContain('analyze-correlation'); // always on
    expect(names).toContain('calculate-portfolio-var'); // always on
    expect(names).toContain('retrain-ml-model'); // always on
    expect(names).toContain('check-regulatory-compliance'); // always on
    expect(names).not.toContain('fetch-news-sentiment'); // sentiment
    expect(names).not.toContain('analyze-onchain-metrics'); // onchain
  });

  it('includes gated tools when their flags are on', async () => {
    const server = new MCPServer({ flags: allOn });
    const names = (await server.listTools()).map((t) => t.name);

    expect(names).toContain('fetch-news-sentiment');
    expect(names).toContain('analyze-onchain-metrics');
  });
});

describe('MCPDisabledError', () => {
  it('exposes the feature name and optional uri', () => {
    const err = new MCPDisabledError('sentiment', 'mcp://sentiment/social');
    expect(err.feature).toBe('sentiment');
    expect(err.uri).toBe('mcp://sentiment/social');
    expect(err.name).toBe('MCPDisabledError');
    expect(err.message).toContain('sentiment');
    expect(err.message).toContain('mcp://sentiment/social');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/test/mcp/mcp-server.test.ts`
Expected: FAIL — `MCPDisabledError` not exported, `MCPServer` constructor doesn't accept `{ flags }`, gating doesn't happen.

- [ ] **Step 3: Add `MCPDisabledError`, flag map constants, and constructor option to `mcp-server.ts`**

In `src/mcp/mcp-server.ts`, just below the existing imports (after line 6), add:

```typescript
import { flags as defaultFlags, type MCPFlags } from './flags';

export class MCPDisabledError extends Error {
  constructor(public feature: keyof MCPFlags, public uri?: string) {
    super(
      `MCP feature disabled: ${feature}${uri ? ` (${uri})` : ''}`
    );
    this.name = 'MCPDisabledError';
  }
}

const RESOURCE_FLAG_MAP: Record<string, keyof MCPFlags> = {
  'mcp://market-data/binance': 'multiExchange',
  'mcp://sentiment/social': 'sentiment',
  'mcp://blockchain/metrics': 'onchain',
  'mcp://economic/calendar': 'economicCalendar',
};

const TOOL_FLAG_MAP: Record<string, keyof MCPFlags> = {
  'fetch-news-sentiment': 'sentiment',
  'analyze-onchain-metrics': 'onchain',
};
```

- [ ] **Step 4: Update `MCPServer` constructor to accept flags**

Replace the existing constructor in `src/mcp/mcp-server.ts` (currently `constructor() { ... }` at lines 39–42):

```typescript
  private flags: MCPFlags;

  constructor(opts: { flags?: MCPFlags } = {}) {
    this.flags = opts.flags ?? defaultFlags;
    this.initializeResources();
    this.initializeTools();
  }
```

- [ ] **Step 5: Gate `listResources` and `listTools`**

Replace the existing `listResources` method (around lines 195–197):

```typescript
  async listResources(): Promise<MCPResource[]> {
    return Array.from(this.resources.values()).filter((r) => {
      const flag = RESOURCE_FLAG_MAP[r.uri];
      return flag === undefined || this.flags[flag];
    });
  }
```

Replace the existing `listTools` method (around lines 199–201):

```typescript
  async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values()).filter((t) => {
      const flag = TOOL_FLAG_MAP[t.name];
      return flag === undefined || this.flags[flag];
    });
  }
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npx vitest run src/test/mcp/mcp-server.test.ts`
Expected: 5 passing tests (2 listResources, 2 listTools, 1 MCPDisabledError).

- [ ] **Step 7: Commit**

```bash
git add src/mcp/mcp-server.ts src/test/mcp/mcp-server.test.ts
git commit -m "feat(mcp): gate listResources/listTools by feature flags

Add MCPDisabledError, flag→resource/tool maps, and a constructor option
for injecting flags. Resources and tools without a flag mapping remain
always-on (Kraken, news/crypto, correlation, VaR, retrain-ml-model,
compliance). All four gated mappings default off via flags.ts."
```

---

## Task 4: Gate `readResource` and add `simulated` markers to placeholder resource methods

**Files:**
- Modify: `src/mcp/mcp-server.ts`
- Modify: `src/test/mcp/mcp-server.test.ts`

- [ ] **Step 1: Append failing tests for `readResource` gating + simulated markers**

Append to `src/test/mcp/mcp-server.test.ts`:

```typescript
describe('MCPServer.readResource', () => {
  it('throws MCPDisabledError when the URI maps to an off flag', async () => {
    const server = new MCPServer({ flags: allOff });
    await expect(
      server.readResource('mcp://sentiment/social')
    ).rejects.toBeInstanceOf(MCPDisabledError);
  });

  it('throws MCPDisabledError carrying the feature name', async () => {
    const server = new MCPServer({ flags: allOff });
    try {
      await server.readResource('mcp://blockchain/metrics');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MCPDisabledError);
      expect((err as MCPDisabledError).feature).toBe('onchain');
      expect((err as MCPDisabledError).uri).toBe('mcp://blockchain/metrics');
    }
  });

  it('returns simulated:true for the social sentiment placeholder', async () => {
    const server = new MCPServer({ flags: allOn });
    const data = await server.readResource('mcp://sentiment/social');
    expect(data.simulated).toBe(true);
  });

  it('returns simulated:true for the crypto news placeholder', async () => {
    const server = new MCPServer({ flags: allOn });
    const data = await server.readResource('mcp://news/crypto');
    expect(data.simulated).toBe(true);
  });

  it('returns simulated:true for the economic calendar placeholder', async () => {
    const server = new MCPServer({ flags: allOn });
    const data = await server.readResource('mcp://economic/calendar');
    expect(data.simulated).toBe(true);
  });

  it('returns simulated:true for the on-chain metrics placeholder', async () => {
    const server = new MCPServer({ flags: allOn });
    const data = await server.readResource('mcp://blockchain/metrics');
    expect(data.simulated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `npx vitest run src/test/mcp/mcp-server.test.ts -t "readResource"`
Expected: FAIL — gating not implemented; `simulated` field absent.

- [ ] **Step 3: Gate `readResource`**

Replace the existing `readResource` method in `src/mcp/mcp-server.ts` (around lines 203–225):

```typescript
  async readResource(uri: string): Promise<any> {
    const resource = Array.from(this.resources.values()).find(
      (r) => r.uri === uri
    );
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const flag = RESOURCE_FLAG_MAP[uri];
    if (flag !== undefined && !this.flags[flag]) {
      throw new MCPDisabledError(flag, uri);
    }

    switch (uri) {
      case 'mcp://market-data/kraken':
        return await this.fetchKrakenData();
      case 'mcp://market-data/binance':
        return await this.fetchBinanceData();
      case 'mcp://news/crypto':
        return await this.fetchCryptoNews();
      case 'mcp://sentiment/social':
        return await this.fetchSocialSentiment();
      case 'mcp://economic/calendar':
        return await this.fetchEconomicCalendar();
      case 'mcp://blockchain/metrics':
        return await this.fetchOnchainMetrics();
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }
```

- [ ] **Step 4: Add `simulated: true` to placeholder resource implementations**

Replace `fetchCryptoNews` (around lines 272–284):

```typescript
  private async fetchCryptoNews(): Promise<any> {
    return {
      simulated: true,
      news: [
        {
          title: 'Sample Crypto News',
          summary: 'This would be real news from external sources',
          sentiment: 'neutral',
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
```

Replace `fetchSocialSentiment` (around lines 286–294):

```typescript
  private async fetchSocialSentiment(): Promise<any> {
    return {
      simulated: true,
      sentiment_score: 0.65,
      mentions: 1234,
      positive_ratio: 0.7,
      analysis: 'Generally positive sentiment detected',
    };
  }
```

Replace `fetchEconomicCalendar` (around lines 296–308):

```typescript
  private async fetchEconomicCalendar(): Promise<any> {
    return {
      simulated: true,
      events: [
        {
          title: 'Federal Reserve Interest Rate Decision',
          impact: 'high',
          date: new Date().toISOString(),
          currency: 'USD',
        },
      ],
    };
  }
```

Replace `fetchOnchainMetrics` (around lines 310–318):

```typescript
  private async fetchOnchainMetrics(): Promise<any> {
    return {
      simulated: true,
      network_value: 1000000000,
      active_addresses: 50000,
      transaction_volume: 5000000000,
      timestamp: new Date().toISOString(),
    };
  }
```

(Note: `fetchKrakenData` and `fetchBinanceData` hit live public APIs and are not simulated — leave them as-is.)

- [ ] **Step 5: Run all `mcp-server.test.ts` tests to confirm pass**

Run: `npx vitest run src/test/mcp/mcp-server.test.ts`
Expected: all tests pass (the originals from Task 3 plus the 6 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/mcp/mcp-server.ts src/test/mcp/mcp-server.test.ts
git commit -m "feat(mcp): gate readResource and mark placeholder responses simulated

readResource throws MCPDisabledError for URIs whose flag is off. The
four placeholder resource methods (crypto news, social sentiment,
economic calendar, on-chain metrics) now return { simulated: true, ...}
so callers can tell real data from stubbed data programmatically."
```

---

## Task 5: Gate `callTool` and add simulated markers to placeholder tool methods

**Files:**
- Modify: `src/mcp/mcp-server.ts`
- Modify: `src/test/mcp/mcp-server.test.ts`

- [ ] **Step 1: Append failing tests for `callTool` gating + simulated/partially_simulated markers**

Append to `src/test/mcp/mcp-server.test.ts`:

```typescript
describe('MCPServer.callTool', () => {
  it('throws MCPDisabledError when the tool maps to an off flag', async () => {
    const server = new MCPServer({ flags: allOff });
    await expect(
      server.callTool('fetch-news-sentiment', { symbols: ['BTCUSD'] })
    ).rejects.toBeInstanceOf(MCPDisabledError);
  });

  it('throws MCPDisabledError carrying the feature name for analyze-onchain-metrics', async () => {
    const server = new MCPServer({ flags: allOff });
    try {
      await server.callTool('analyze-onchain-metrics', {
        asset: 'BTC',
        metrics: ['network_value'],
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MCPDisabledError);
      expect((err as MCPDisabledError).feature).toBe('onchain');
    }
  });

  it('returns simulated:true for fetch-news-sentiment', async () => {
    const server = new MCPServer({ flags: allOn });
    const result = await server.callTool('fetch-news-sentiment', {
      symbols: ['BTCUSD'],
    });
    expect(result.simulated).toBe(true);
  });

  it('returns simulated:true for analyze-onchain-metrics', async () => {
    const server = new MCPServer({ flags: allOn });
    const result = await server.callTool('analyze-onchain-metrics', {
      asset: 'BTC',
      metrics: ['network_value'],
    });
    expect(result.simulated).toBe(true);
  });

  it('returns simulated:true for check-regulatory-compliance (always-on placeholder)', async () => {
    const server = new MCPServer({ flags: allOff });
    const result = await server.callTool('check-regulatory-compliance', {
      jurisdiction: 'US',
      activity_type: 'trading',
    });
    expect(result.simulated).toBe(true);
  });

  it('marks analyze-correlation as partially_simulated with the simulated field listed', async () => {
    const server = new MCPServer({ flags: allOff });
    const result = await server.callTool('analyze-correlation', {
      pairs: ['BTCUSD', 'ETHUSD'],
    });
    expect(result.partially_simulated).toBe(true);
    expect(result.simulated_fields).toContain('correlation_matrix');
  });

  it('marks calculate-portfolio-var as partially_simulated with the simulated field listed', async () => {
    const server = new MCPServer({ flags: allOff });
    const result = await server.callTool('calculate-portfolio-var', {
      confidence_level: 0.95,
    });
    expect(result.partially_simulated).toBe(true);
    expect(result.simulated_fields).toContain('var_estimate');
  });
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `npx vitest run src/test/mcp/mcp-server.test.ts -t "callTool"`
Expected: FAIL — `callTool` doesn't gate; markers absent.

- [ ] **Step 3: Gate `callTool`**

Replace the existing `callTool` method in `src/mcp/mcp-server.ts` (around lines 227–249):

```typescript
  async callTool(name: string, arguments_: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    const flag = TOOL_FLAG_MAP[name];
    if (flag !== undefined && !this.flags[flag]) {
      throw new MCPDisabledError(flag);
    }

    switch (name) {
      case 'analyze-correlation':
        return await this.analyzeCorrelation(arguments_);
      case 'calculate-portfolio-var':
        return await this.calculatePortfolioVaR(arguments_);
      case 'fetch-news-sentiment':
        return await this.fetchNewsSentiment(arguments_);
      case 'analyze-onchain-metrics':
        return await this.analyzeOnchainMetrics(arguments_);
      case 'retrain-ml-model':
        return await this.retrainMLModel(arguments_);
      case 'check-regulatory-compliance':
        return await this.checkRegulatoryCompliance(arguments_);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
```

- [ ] **Step 4: Add markers to tool implementations**

Replace `analyzeCorrelation` (around lines 321–351):

```typescript
  private async analyzeCorrelation(args: any): Promise<any> {
    const { pairs, timeframes = ['1h', '1d'], period = 30 } = args;

    try {
      const { data: marketData } = await supabase
        .from('market_data')
        .select('*')
        .in('symbol', pairs)
        .gte(
          'timestamp',
          new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()
        );

      const correlations: Record<string, number> = {};
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const pair1 = pairs[i];
          const pair2 = pairs[j];
          correlations[`${pair1}_${pair2}`] = Math.random() * 2 - 1;
        }
      }

      return {
        partially_simulated: true,
        simulated_fields: ['correlation_matrix'],
        correlations,
        period,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error analyzing correlation:', error);
      throw error;
    }
  }
```

Replace `calculatePortfolioVaR` (around lines 353–381):

```typescript
  private async calculatePortfolioVaR(args: any): Promise<any> {
    const { confidence_level, time_horizon = 1, method = 'historical' } = args;

    try {
      const { data: positions } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('status', 'open');

      const portfolio_value =
        positions?.reduce(
          (sum, pos) => sum + pos.quantity * pos.current_price,
          0
        ) || 0;

      const var_estimate = portfolio_value * 0.05 * Math.sqrt(time_horizon);

      return {
        partially_simulated: true,
        simulated_fields: ['var_estimate'],
        var_estimate,
        confidence_level,
        time_horizon,
        method,
        portfolio_value,
        calculation_time: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error calculating VaR:', error);
      throw error;
    }
  }
```

Replace `fetchNewsSentiment` (around lines 383–400):

```typescript
  private async fetchNewsSentiment(args: any): Promise<any> {
    const { symbols, sources = ['general'], timeframe = '1d' } = args;

    return {
      simulated: true,
      symbols,
      sentiment_scores: symbols.reduce((acc: any, symbol: string) => {
        acc[symbol] = {
          score: Math.random() * 2 - 1,
          confidence: Math.random(),
          article_count: Math.floor(Math.random() * 50),
        };
        return acc;
      }, {}),
      timeframe,
      timestamp: new Date().toISOString(),
    };
  }
```

Replace `analyzeOnchainMetrics` (around lines 402–421):

```typescript
  private async analyzeOnchainMetrics(args: any): Promise<any> {
    const { asset, metrics, period = '7d' } = args;

    const results: any = {
      simulated: true,
      asset,
      period,
      metrics: {},
    };

    for (const metric of metrics) {
      results.metrics[metric] = {
        current_value: Math.random() * 1000000,
        change_24h: (Math.random() - 0.5) * 0.2,
        trend: ['bullish', 'bearish', 'neutral'][Math.floor(Math.random() * 3)],
      };
    }

    return results;
  }
```

Replace `checkRegulatoryCompliance` (around lines 453–468):

```typescript
  private async checkRegulatoryCompliance(args: any): Promise<any> {
    const { jurisdiction, activity_type, check_type = 'real_time' } = args;

    return {
      simulated: true,
      jurisdiction,
      activity_type,
      check_type,
      status: 'compliant',
      recommendations: [
        'Maintain current transaction logging',
        'Review position limits weekly',
      ],
      last_checked: new Date().toISOString(),
    };
  }
```

(`retrainMLModel` is left untouched — it delegates to a real edge function, not a placeholder.)

- [ ] **Step 5: Run the full mcp-server test suite**

Run: `npx vitest run src/test/mcp/mcp-server.test.ts`
Expected: all tests pass (Tasks 3, 4, 5 combined).

- [ ] **Step 6: Commit**

```bash
git add src/mcp/mcp-server.ts src/test/mcp/mcp-server.test.ts
git commit -m "feat(mcp): gate callTool and mark placeholder tool responses

callTool throws MCPDisabledError for tools whose flag is off. The four
fully-placeholder tools (fetch-news-sentiment, analyze-onchain-metrics,
check-regulatory-compliance) get simulated:true; analyze-correlation
and calculate-portfolio-var, which use real DB data but simplified
math, get partially_simulated:true with simulated_fields naming what's
fake."
```

---

## Task 6: Update `mcp-client.ts` to handle disabled features quietly

**Files:**
- Modify: `src/mcp/mcp-client.ts`

No new test file — the changes here are log-suppression and dead-URI skipping; behavior is exercised end-to-end by Task 3's `listResources` filter (the convenience methods in `mcp-client` are wrappers and were already fault-tolerant via `Promise.allSettled`).

- [ ] **Step 1: Import `MCPDisabledError` in `mcp-client.ts`**

In `src/mcp/mcp-client.ts`, replace the existing import (line 6):

```typescript
import { MCPServer, MCPDisabledError } from './mcp-server';
```

- [ ] **Step 2: Make `refreshCriticalResources` skip URIs whose flag is off**

Replace the existing `refreshCriticalResources` method (around lines 41–57):

```typescript
  private async refreshCriticalResources() {
    const criticalResources = [
      'mcp://market-data/kraken',
      'mcp://sentiment/social',
      'mcp://blockchain/metrics',
    ];

    const enabledUris = new Set(
      (await this.server.listResources()).map((r) => r.uri)
    );

    for (const uri of criticalResources) {
      if (!enabledUris.has(uri)) continue;
      try {
        await this.getResource(uri, true);
      } catch (error) {
        if (
          this.config.enableLogging &&
          !(error instanceof MCPDisabledError)
        ) {
          console.warn(`Failed to refresh resource ${uri}:`, error);
        }
      }
    }
  }
```

- [ ] **Step 3: Suppress error log for `MCPDisabledError` in `getResource`**

Replace the existing `getResource` method (around lines 59–78):

```typescript
  async getResource(uri: string, forceRefresh = false): Promise<any> {
    const cached = this.resourceCache.get(uri);
    const now = Date.now();

    if (!forceRefresh && cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const data = await this.server.readResource(uri);
      this.resourceCache.set(uri, { data, timestamp: now });
      return data;
    } catch (error) {
      if (
        this.config.enableLogging &&
        !(error instanceof MCPDisabledError)
      ) {
        console.error(`Error fetching resource ${uri}:`, error);
      }
      return cached?.data || null;
    }
  }
```

- [ ] **Step 4: Suppress error log for `MCPDisabledError` in `callTool`**

Replace the existing `callTool` method (around lines 80–99):

```typescript
  async callTool(name: string, arguments_: any): Promise<any> {
    if (this.config.enableLogging) {
      console.log(`Calling MCP tool: ${name}`, arguments_);
    }

    try {
      const result = await this.server.callTool(name, arguments_);

      if (this.config.enableLogging) {
        console.log(`MCP tool ${name} completed successfully`);
      }

      return result;
    } catch (error) {
      if (
        this.config.enableLogging &&
        !(error instanceof MCPDisabledError)
      ) {
        console.error(`MCP tool ${name} failed:`, error);
      }
      throw error;
    }
  }
```

- [ ] **Step 5: Run all MCP tests to confirm nothing regressed**

Run: `npx vitest run src/test/mcp/`
Expected: all flag and server tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/mcp-client.ts
git commit -m "feat(mcp): skip disabled URIs in auto-refresh and silence disabled-feature logs

refreshCriticalResources consults listResources() so it never tries to
poll a flagged-off URI. getResource and callTool still swallow errors
for graceful degradation, but no longer log MCPDisabledError as an
error — disabled is a known state, not a failure."
```

---

## Task 7: Gate the edge-function action switch and add simulated markers

**Files:**
- Modify: `supabase/functions/mcp-integration/index.ts`

No automated tests — the repo has no Deno test infrastructure. Verification is by reading the code change and confirming the action switch returns the expected error shape.

- [ ] **Step 1: Import the flag module at the top of `index.ts`**

In `supabase/functions/mcp-integration/index.ts`, add this import after line 2 (after the supabase client import):

```typescript
import { flags } from "./flags.ts";
```

- [ ] **Step 2: Add a flag map and gating in the action switch**

In `supabase/functions/mcp-integration/index.ts`, replace the existing `switch (action)` block (around lines 32–51):

```typescript
    const ACTION_FLAG_MAP: Record<string, keyof typeof flags> = {
      fetch_external_data: 'multiExchange',
      analyze_sentiment: 'sentiment',
      get_economic_calendar: 'economicCalendar',
      fetch_onchain_data: 'onchain',
    };

    const requiredFlag = ACTION_FLAG_MAP[action];
    if (requiredFlag !== undefined && !flags[requiredFlag]) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'feature_disabled',
          feature: requiredFlag,
          action,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    let result: any = {};

    switch (action) {
      case 'fetch_external_data':
        result = await fetchExternalMarketData(params);
        break;

      case 'analyze_sentiment':
        result = await analyzeSentiment(params);
        break;

      case 'get_economic_calendar':
        result = await getEconomicCalendar(params);
        break;

      case 'fetch_onchain_data':
        result = await fetchOnchainData(params);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
```

- [ ] **Step 3: Add `simulated: true` to `analyzeSentiment` response**

Replace the `return` block at the end of `analyzeSentiment` (around lines 215–220):

```typescript
  return {
    simulated: true,
    sentiment_analysis: sentimentData,
    timeframe,
    analysis_time: new Date().toISOString(),
    note: "This is simulated sentiment data. In production, integrate with real sentiment APIs."
  };
```

- [ ] **Step 4: Add `simulated: true` to `getEconomicCalendar` response**

Replace the `return` block at the end of `getEconomicCalendar` (around lines 259–265):

```typescript
  return {
    simulated: true,
    events: filteredEvents,
    date_range,
    currencies,
    retrieved_at: new Date().toISOString(),
    note: "This is simulated economic calendar data. In production, integrate with real economic calendar APIs."
  };
```

- [ ] **Step 5: Add `simulated: true` to `fetchOnchainData` response**

Replace the `return` block at the end of `fetchOnchainData` (around lines 290–297):

```typescript
  return {
    simulated: true,
    onchain_analysis: onchainData,
    assets,
    metrics,
    period,
    analysis_time: new Date().toISOString(),
    note: "This is simulated on-chain data. In production, integrate with real blockchain analytics APIs."
  };
```

- [ ] **Step 6: Type-check the edge function**

Run: `npx tsc --noEmit --target esnext --module esnext --moduleResolution bundler --skipLibCheck supabase/functions/mcp-integration/index.ts supabase/functions/mcp-integration/flags.ts`
Expected: any complaints about `Deno`, `serve`, or remote URL imports are expected (Deno globals + URL imports aren't visible to local `tsc`). The change is acceptable as long as no new errors reference the new code we just added (action map, flag gating, return shapes).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/mcp-integration/index.ts
git commit -m "feat(mcp-integration): gate edge-function actions by feature flags

The four actions (fetch_external_data, analyze_sentiment,
get_economic_calendar, fetch_onchain_data) now check Deno-side env
flags before dispatching. Disabled action returns
{ success: false, error: 'feature_disabled', feature, action } with
HTTP 200 — known state, not an error. Simulated handlers also tag
their response with simulated:true alongside the existing note string."
```

---

## Task 8: Append flag declarations to `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append the MCP flag block**

Append to `.env.example` (after the last existing line, line 13):

```bash

# ─── MCP feature flags ─────────────────────────────────────────────
# All flags default to false (off-by-default). Set to "true" to expose
# simulated data in the dashboard for development/demo. In production,
# leave these unset.
#
# - VITE_ENABLE_MULTI_EXCHANGE_DATA: enables the Binance market-data
#   resource and the edge-function fetch_external_data action
#   (Binance/Coinbase/CoinGecko aggregation).
# - VITE_ENABLE_SENTIMENT_ANALYSIS: enables the social sentiment
#   resource, the fetch-news-sentiment tool, and the edge-function
#   analyze_sentiment action.
# - VITE_ENABLE_ONCHAIN_METRICS: enables the blockchain metrics
#   resource, the analyze-onchain-metrics tool, and the edge-function
#   fetch_onchain_data action.
# - VITE_ENABLE_ECONOMIC_CALENDAR: enables the economic calendar
#   resource and the edge-function get_economic_calendar action.
#
# Edge-function counterparts (set as Supabase secrets, not in .env):
# ENABLE_MULTI_EXCHANGE_DATA, ENABLE_SENTIMENT_ANALYSIS,
# ENABLE_ONCHAIN_METRICS, ENABLE_ECONOMIC_CALENDAR.
VITE_ENABLE_MULTI_EXCHANGE_DATA=false
VITE_ENABLE_SENTIMENT_ANALYSIS=false
VITE_ENABLE_ONCHAIN_METRICS=false
VITE_ENABLE_ECONOMIC_CALENDAR=false
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document MCP feature flags in .env.example

Lists the four VITE_ENABLE_* flags that gate simulated MCP data, their
default-off values, what each one enables, and the Deno-side env var
names that should be set as Supabase secrets for the edge function."
```

---

## Task 9: Update `docs/MCP_IMPLEMENTATION.md` — surgical edits

**Files:**
- Modify: `docs/MCP_IMPLEMENTATION.md`

This task is a series of targeted text edits. Each step is a single Edit operation against the file.

- [ ] **Step 1: Fix the wrong sentiment-score example**

Replace exact match:

```typescript
const overview = await client.getMarketOverview();
console.log(overview.sentiment.score); // Overall market sentiment
```

with:

```typescript
const overview = await client.getMarketOverview();
console.log(overview.sentiment.sentiment_score); // Overall market sentiment (returned field is `sentiment_score`)
```

- [ ] **Step 2: Add a "Simulated Data" subsection between "MCP Tools" and "Integration Points"**

Replace exact match:

```markdown
### Model Management Tools
- `retrain-ml-model` - Trigger ML model retraining
- `check-regulatory-compliance` - Compliance validation

## Integration Points
```

with:

```markdown
### Model Management Tools
- `retrain-ml-model` - Trigger ML model retraining (delegates to the `enhanced-ml-engine` edge function — real)
- `check-regulatory-compliance` - Compliance validation (returns simulated data)

## Simulated Data

Several MCP tools and resources currently return simulated (placeholder) data, marked at the top of every response:

- `simulated: true` — the entire response is fabricated. Resources: `mcp://news/crypto`, `mcp://sentiment/social`, `mcp://economic/calendar`, `mcp://blockchain/metrics`. Tools: `fetch-news-sentiment`, `analyze-onchain-metrics`, `check-regulatory-compliance`. Edge-function actions: `analyze_sentiment`, `get_economic_calendar`, `fetch_onchain_data`.
- `partially_simulated: true` with a `simulated_fields` array — the response uses real underlying data, but specific computed fields are placeholder math. Tools: `analyze-correlation` (real market_data, simulated correlation matrix), `calculate-portfolio-var` (real positions, simplified VaR formula).
- `mcp://market-data/kraken`, `mcp://market-data/binance`, and `retrain-ml-model` hit live external APIs / real ML pipeline — no `simulated` marker.

When a feature flag is off (the default), the corresponding resource/tool/action is removed from `listResources()`/`listTools()` and throws `MCPDisabledError` (client) or returns `{ success: false, error: 'feature_disabled' }` (edge function) instead of returning simulated data.

## Integration Points
```

- [ ] **Step 3: Document the missing edge-function actions in "Backend Integration"**

Replace exact match:

```markdown
### Backend Integration
```typescript
// Call MCP integration edge function
const { data } = await supabase.functions.invoke('mcp-integration', {
  body: {
    action: 'fetch_external_data',
    params: { sources: ['binance', 'coingecko'], symbols: ['BTCUSDT'] }
  }
});
```
```

with:

```markdown
### Backend Integration

The `mcp-integration` edge function exposes four actions:

- `fetch_external_data` — multi-exchange ticker fetch (Binance/Coinbase/CoinGecko). Real public APIs.
- `analyze_sentiment` — sentiment scoring per symbol. Simulated.
- `get_economic_calendar` — upcoming economic events filtered by currency/importance. Simulated.
- `fetch_onchain_data` — on-chain metrics per asset. Simulated.

Each action is gated by the corresponding feature flag and returns `{ success: false, error: 'feature_disabled', feature, action }` when its flag is off.

```typescript
// Call MCP integration edge function
const { data } = await supabase.functions.invoke('mcp-integration', {
  body: {
    action: 'fetch_external_data',
    params: { sources: ['binance', 'coingecko'], symbols: ['BTCUSDT'] }
  }
});
```
```

- [ ] **Step 4: Replace "Security Considerations" — drop unimplemented claims**

Replace exact match:

```markdown
## Security Considerations

### API Key Management
- Secure credential storage via Supabase secrets
- Rate limiting for external APIs
- Request validation and sanitization

### Data Privacy
- No sensitive data in logs
- Encrypted data transmission
- Minimal data retention
```

with:

```markdown
## Security Considerations

### API Key Management
- Secure credential storage via Supabase secrets (used by other edge functions; the MCP edge function currently calls only public, unauthenticated endpoints).

### Data Privacy
- All external API traffic uses HTTPS.

> **Not yet implemented:** rate limiting for external APIs, request validation/sanitization on edge-function inputs, configurable data-retention policy.
```

- [ ] **Step 5: Replace "Monitoring & Observability" — keep what's true, demote the rest**

Replace exact match:

```markdown
## Monitoring & Observability

### Metrics Tracked
- API response times
- Success/failure rates
- Cache hit ratios
- Resource utilization

### Alerting
- External API failures
- Performance degradation
- Data quality issues
```

with:

```markdown
## Monitoring & Observability

Each MCP edge-function call is logged to the `log_trading_event` RPC with the action name, params, and a `MCP_INTEGRATION` category — that is the entire telemetry surface today.

> **Future Enhancements:** API response time tracking, success/failure rate metrics, cache hit ratios, resource utilization, and alerting on external API failures, performance degradation, and data quality issues.
```

- [ ] **Step 6: Replace "Environment Variables" section**

Replace exact match:

```markdown
### Environment Variables
```bash
# External API Keys (stored in Supabase secrets)
BINANCE_API_KEY=your_binance_key
COINBASE_API_KEY=your_coinbase_key
COINGECKO_API_KEY=your_coingecko_key
TWITTER_BEARER_TOKEN=your_twitter_token
```
```

with:

```markdown
### Environment Variables

The MCP edge function calls only public, unauthenticated endpoints today, so no external API keys are required. When real integrations land (e.g., Glassnode, Twitter, CoinGecko Pro), secrets will follow the existing pattern in `supabase/functions/_shared/config.ts`.

The browser bundle reads four flag env vars (Vite-prefixed); the edge function reads four equivalents via `Deno.env`. See `.env.example` for the full list and `Feature Flags` below.
```

- [ ] **Step 7: Replace "Feature Flags" section with real flag documentation**

Replace exact match:

```markdown
### Feature Flags
- `ENABLE_SENTIMENT_ANALYSIS`
- `ENABLE_ONCHAIN_METRICS`
- `ENABLE_ECONOMIC_CALENDAR`
- `ENABLE_MULTI_EXCHANGE_DATA`
```

with:

```markdown
### Feature Flags

All flags are read once per process and **default to off**. Set the env var to the literal string `"true"` to enable.

| Vite var (browser)                  | Deno var (edge function)        | Gates                                                                                                |
|-------------------------------------|---------------------------------|------------------------------------------------------------------------------------------------------|
| `VITE_ENABLE_MULTI_EXCHANGE_DATA`   | `ENABLE_MULTI_EXCHANGE_DATA`    | `mcp://market-data/binance` resource; edge-function `fetch_external_data` action                     |
| `VITE_ENABLE_SENTIMENT_ANALYSIS`    | `ENABLE_SENTIMENT_ANALYSIS`     | `mcp://sentiment/social` resource; `fetch-news-sentiment` tool; edge-function `analyze_sentiment`    |
| `VITE_ENABLE_ONCHAIN_METRICS`       | `ENABLE_ONCHAIN_METRICS`        | `mcp://blockchain/metrics` resource; `analyze-onchain-metrics` tool; edge-function `fetch_onchain_data` |
| `VITE_ENABLE_ECONOMIC_CALENDAR`     | `ENABLE_ECONOMIC_CALENDAR`      | `mcp://economic/calendar` resource; edge-function `get_economic_calendar` action                     |

Disabled resources/tools are filtered out of `listResources()` / `listTools()`. Direct calls to `readResource()` / `callTool()` for a disabled feature throw `MCPDisabledError`. The edge function returns `{ success: false, error: 'feature_disabled', feature, action }` with HTTP 200 for disabled actions.

Always-on (no flag): Kraken market data, crypto news placeholder, `analyze-correlation`, `calculate-portfolio-var`, `retrain-ml-model`, `check-regulatory-compliance`.
```

- [ ] **Step 8: Reframe "Common Issues" from prescriptive to descriptive**

Replace exact match:

```markdown
### Common Issues
1. **API Rate Limits**: Implement exponential backoff
2. **Network Timeouts**: Configure appropriate timeouts
3. **Data Quality**: Validate and sanitize external data
4. **Cache Misses**: Monitor cache performance metrics
```

with:

```markdown
### Known Limitations
1. **API Rate Limits** — not currently handled. If/when external APIs start rate-limiting calls, exponential backoff is the recommended pattern.
2. **Network Timeouts** — `fetch` calls run with the runtime default. No configurable timeout today.
3. **Data Quality** — external responses are passed through without validation/sanitization. Callers should defend against malformed payloads.
4. **Cache Misses** — cache hit ratios are not measured. Monitoring would need to be added before tuning the 5-minute TTL is meaningful.
```

- [ ] **Step 9: Verify the doc still parses cleanly**

Run: `wc -l docs/MCP_IMPLEMENTATION.md`
Expected: line count is reasonably similar to or larger than the pre-edit value (~249 → ~270-300 — we added a Simulated Data section and a flag table, replaced shorter sections with longer accurate ones).

- [ ] **Step 10: Commit**

```bash
git add docs/MCP_IMPLEMENTATION.md
git commit -m "docs(mcp): align MCP_IMPLEMENTATION.md with the implementation

- Fix wrong sentiment_score field reference in usage example.
- Add 'Simulated Data' section listing every placeholder resource/tool
  and how callers can detect them via simulated/partially_simulated.
- Document the four edge-function actions (3 were missing).
- Drop unimplemented claims about rate limiting, request validation,
  metrics tracking, and alerting; demote them to 'Future Enhancements'.
- Replace the unused API-key list with a note that no external keys
  are required today.
- Document the four real feature flags (Vite + Deno names) and what
  each one gates.
- Reframe 'Common Issues' as known limitations rather than as recipes
  for solutions that don't exist."
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full MCP test suite**

Run: `npx vitest run src/test/mcp/`
Expected: all tests pass (Tasks 1, 3, 4, 5).

- [ ] **Step 2: Run the project type checker**

Run: `npx tsc --noEmit -p tsconfig.json` (or the project's existing typecheck script — `cat package.json | grep -A1 '"scripts"' | head -20` to find it)
Expected: no new type errors. Pre-existing errors are not this PR's concern; flag any that originated in files this plan touched (`src/mcp/*.ts`, `supabase/functions/mcp-integration/*.ts`).

- [ ] **Step 3: Sanity-check `git status` and `git log`**

Run: `git status && git log --oneline -10`
Expected: working tree clean, ten commits visible (or however many tasks were completed) with messages matching the per-task `git commit` invocations above.

- [ ] **Step 4: Manual smoke test of dashboard with all flags off**

Run: `npm run dev` (or `bun run dev` if the project uses bun based on `bun.lockb`)

Open the dashboard route that mounts `MCPDashboard.tsx`. Expected: only the always-on resources and tools render in the lists (Kraken market data, news/crypto, correlation, VaR, retrain-ml-model, regulatory-compliance). The dashboard does NOT crash on missing sentiment/onchain/economic-calendar/multi-exchange.

- [ ] **Step 5: Manual smoke test of dashboard with all flags on**

Stop the dev server. Create or edit `.env` (NOT `.env.example`) at the repo root and set:

```bash
VITE_ENABLE_MULTI_EXCHANGE_DATA=true
VITE_ENABLE_SENTIMENT_ANALYSIS=true
VITE_ENABLE_ONCHAIN_METRICS=true
VITE_ENABLE_ECONOMIC_CALENDAR=true
```

Re-run `npm run dev` (or `bun run dev`). Reload the dashboard. Expected: full resource and tool lists render. Triggering "Comprehensive Analysis" returns data with `simulated: true` / `partially_simulated: true` markers visible in the response (open browser devtools network tab or inspect the rendered analysis output).

- [ ] **Step 6: Final commit/cleanup if anything changed during smoke test**

If the smoke test required changes, commit them as a follow-up. Otherwise nothing to do — the work is complete.
