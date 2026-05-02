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
