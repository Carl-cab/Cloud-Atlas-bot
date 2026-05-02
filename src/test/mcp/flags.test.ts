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
