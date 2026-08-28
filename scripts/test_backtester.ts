import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  parseOHLCVCSV,
} from '../src/core/market/marketDataReader.ts';

import {
  calculateTechnicalIndicatorSeries,
} from '../src/core/market/technicalIndicatorSeries.ts';

import {
  calculateQuantitativeSignalSeries,
} from '../src/core/market/signalEngine.ts';

import {
  backtestQuantitativeSignals,
} from '../src/core/market/backtester.ts';

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

const indicatorSeries =
  calculateTechnicalIndicatorSeries(
    dataset.candles
  );

const signalSeries =
  calculateQuantitativeSignalSeries(
    indicatorSeries
  );

const result =
  backtestQuantitativeSignals(
    dataset.candles,
    signalSeries,
    symbol
  );

console.log(
  JSON.stringify(
    {
      symbol: result.symbol,

      candles: result.totalCandles,

      signals: {
        buy: result.buySignals,
        sell: result.sellSignals,
        wait: result.waitSignals,
      },

      buy: result.buy,

      sell: result.sell,

      combined: result.combined,

      buyScoreBuckets:
        result.buyScoreBuckets,

      sellScoreBuckets:
        result.sellScoreBuckets,

      firstTrades:
        result.trades.slice(0, 5),
    },
    null,
    2
  )
);