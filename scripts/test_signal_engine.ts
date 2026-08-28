import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseOHLCVCSV,
} from '../src/core/market/marketDataReader.ts';

import {
  calculateTechnicalIndicatorSeries,
} from '../src/core/market/technicalIndicatorSeries.ts';

import {
  calculateQuantitativeSignal,
} from '../src/core/market/signalEngine.ts';

const symbol = (
  process.argv[2] ?? 'BEPL'
).trim().toUpperCase();

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

const indicatorSeries =
  calculateTechnicalIndicatorSeries(
    dataset.candles
  );

const latest =
  indicatorSeries[
    indicatorSeries.length - 1
  ];

const signal =
  calculateQuantitativeSignal(
    latest
  );

console.log(
  JSON.stringify(
    {
      symbol,
      candles: dataset.candles.length,
      signal,
    },
    null,
    2
  )
);