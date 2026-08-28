import { readFileSync } from 'node:fs';

import {
  parseOHLCVCSV,
} from '../src/core/market/marketDataReader.ts';

const file =
  'data/market_data/BEPL_OHLCV.csv';

const csv = readFileSync(
  file,
  'utf8'
);

const dataset = parseOHLCVCSV(
  csv,
  'BEPL'
);

console.log(
  `Symbol: ${dataset.symbol}`
);

console.log(
  `Rows: ${dataset.candles.length}`
);

console.log(
  'First candle:',
  dataset.candles[0]
);

console.log(
  'Last candle:',
  dataset.candles[
    dataset.candles.length - 1
  ]
);