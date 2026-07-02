#!/usr/bin/env node
// =============================================================================
// Historical Data Fetcher — Kraken public OHLC (no credentials required)
//
// Usage:
//   node scripts/fetch-historical-data.mjs [PAIR ...]
//
// Defaults to XBTUSD and ETHUSD at 1d, 4h, and 1h intervals. Writes JSON
// datasets to data/historical/<PAIR>_<interval>m.json.
//
// LIMITATION: Kraken's OHLC endpoint returns at most 720 candles per
// pair/interval (~2 years of daily data). That is enough for an initial
// go/no-go backtest but NOT for multi-regime validation. Treat results
// accordingly and extend history before any live-trading decision.
//
// NOTE: This script needs egress to api.kraken.com. Sandboxed CI
// environments may block it — run it from a machine with network access.
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PAIRS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['XBTUSD', 'ETHUSD'];
const INTERVALS = [1440, 240, 60]; // minutes
const OUT_DIR = path.join(process.cwd(), 'data', 'historical');

async function fetchOHLC(pair, interval) {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pair}@${interval}`);
  const body = await res.json();
  if (body.error && body.error.length > 0) {
    throw new Error(`Kraken error for ${pair}@${interval}: ${body.error.join(', ')}`);
  }
  const key = Object.keys(body.result).find((k) => k !== 'last');
  const raw = body.result[key];
  return raw.map((c) => ({
    t: new Date(c[0] * 1000).toISOString(),
    o: parseFloat(c[1]),
    h: parseFloat(c[2]),
    l: parseFloat(c[3]),
    c: parseFloat(c[4]),
    v: parseFloat(c[6]),
  }));
}

await mkdir(OUT_DIR, { recursive: true });

let failures = 0;
for (const pair of PAIRS) {
  for (const interval of INTERVALS) {
    try {
      const candles = await fetchOHLC(pair, interval);
      const dataset = {
        pair,
        interval,
        source: 'kraken-public-ohlc',
        fetchedAt: new Date().toISOString(),
        candles,
      };
      const file = path.join(OUT_DIR, `${pair}_${interval}m.json`);
      await writeFile(file, JSON.stringify(dataset));
      console.log(`OK  ${pair} @ ${interval}m — ${candles.length} candles (${candles[0]?.t} → ${candles[candles.length - 1]?.t}) → ${file}`);
      // Be polite to the public API
      await new Promise((r) => setTimeout(r, 1100));
    } catch (err) {
      failures++;
      console.error(`FAIL ${pair} @ ${interval}m — ${err.message}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} fetch(es) failed. Backtests need real data — do not substitute synthetic candles.`);
  process.exit(1);
}
console.log('\nDone. Run: npx vite-node scripts/run-backtest.ts');
