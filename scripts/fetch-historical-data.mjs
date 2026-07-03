#!/usr/bin/env node
// =============================================================================
// Historical Data Fetcher (no credentials required)
//
// Usage:
//   node scripts/fetch-historical-data.mjs [PAIR ...]           # Kraken, recent
//   node scripts/fetch-historical-data.mjs --deep [PAIR ...]    # Binance, full history
//
// Default mode fetches Kraken public OHLC for XBTUSD and ETHUSD at 1d, 4h,
// and 1h intervals. Writes JSON datasets to data/historical/<PAIR>_<interval>m.json.
//
// KRAKEN LIMITATION: the OHLC endpoint returns at most 720 candles per
// pair/interval (~2 years of daily data). That is enough for an initial
// go/no-go backtest but NOT for multi-regime validation.
//
// --deep mode paginates Binance public klines (1000 candles/request) back to
// 2017 for BTCUSDT/ETHUSDT at 1d and 4h. Binance is used as a DATA SOURCE
// ONLY — no account, no keys, no trading integration. Basis risk vs Kraken
// prices is small for BTC/ETH majors but nonzero; validate final candidates
// on Kraken data before any go-live decision.
//
// NOTE: This script needs egress to api.kraken.com / api.binance.com.
// Sandboxed CI environments may block it — run from a machine with network.
// =============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const DEEP = args.includes('--deep');
const pairArgs = args.filter((a) => !a.startsWith('--'));
const PAIRS = pairArgs.length > 0 ? pairArgs : (DEEP ? ['BTCUSDT', 'ETHUSDT'] : ['XBTUSD', 'ETHUSD']);
const INTERVALS = DEEP ? [1440, 240] : [1440, 240, 60]; // minutes
const OUT_DIR = path.join(process.cwd(), 'data', 'historical');

const BINANCE_INTERVAL = { 1440: '1d', 240: '4h', 60: '1h' };
const BINANCE_START_MS = Date.UTC(2017, 7, 1); // Binance spot launch era

async function fetchBinanceDeep(symbol, interval) {
  const candles = [];
  let startTime = BINANCE_START_MS;
  const intervalMs = interval * 60 * 1000;
  for (;;) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${BINANCE_INTERVAL[interval]}&limit=1000&startTime=${startTime}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${symbol}@${interval}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`Binance error for ${symbol}: ${JSON.stringify(rows).slice(0, 200)}`);
    if (rows.length === 0) break;
    for (const r of rows) {
      candles.push({
        t: new Date(r[0]).toISOString(),
        o: parseFloat(r[1]),
        h: parseFloat(r[2]),
        l: parseFloat(r[3]),
        c: parseFloat(r[4]),
        v: parseFloat(r[5]),
      });
    }
    startTime = rows[rows.length - 1][0] + intervalMs;
    if (rows.length < 1000) break;
    await new Promise((r) => setTimeout(r, 350)); // stay far under rate limits
  }
  // Drop the still-forming final candle
  if (candles.length > 0) candles.pop();
  return candles;
}

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
      const candles = DEEP ? await fetchBinanceDeep(pair, interval) : await fetchOHLC(pair, interval);
      const dataset = {
        pair,
        interval,
        source: DEEP ? 'binance-public-klines-deep' : 'kraken-public-ohlc',
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
