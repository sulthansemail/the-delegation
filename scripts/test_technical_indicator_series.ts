import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseOHLCVCSV,
} from '../src/core/market/marketDataReader.ts';

import {
  calculateTechnicalIndicatorSeries,
} from '../src/core/market/technicalIndicatorSeries.ts';

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

const series =
  calculateTechnicalIndicatorSeries(
    dataset.candles
  );

console.log(
  `Symbol: ${dataset.symbol}`
);

console.log(
  `Candles: ${dataset.candles.length}`
);

console.log(
  `Indicator points: ${series.length}`
);

console.log();

console.log(
  'First point:',
  series[0]
);

console.log();

console.log(
  'First fully-developed point:',
  series[200]
);

console.log();

console.log(
  'Latest point:',
  series[series.length - 1]
);

console.log();

const latest = series[series.length - 1];

console.log(
  `Latest RSI: ${latest.rsi14}`
);

console.log(
  `Latest MACD: ${latest.macd}`
);

console.log(
  `Latest ATR: ${latest.atr14}`
);

console.log(
  `Latest Relative Volume: ${latest.relativeVolume20}`
);