import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseOHLCVCSV,
} from '../src/core/market/marketDataReader.ts';

import {
  calculateTechnicalIndicators,
} from '../src/core/market/technicalIndicators.ts';

const symbol = (
  process.argv[2] ?? 'BEPL'
).trim().toUpperCase();

if (!/^[A-Z0-9._-]+$/.test(symbol)) {
  throw new Error(
    `Invalid symbol: ${symbol}`
  );
}

const file = path.join(
  'data',
  'market_data',
  `${symbol}_OHLCV.csv`
);

const csv = readFileSync(
  file,
  'utf8'
);

const dataset = parseOHLCVCSV(
  csv,
  symbol
);

const indicators =
  calculateTechnicalIndicators(
    dataset.candles
  );

console.log(
  JSON.stringify(
    {
      symbol: dataset.symbol,
      candles: dataset.candles.length,
      indicators,
    },
    null,
    2
  )
);