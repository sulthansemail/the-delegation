import { readFileSync } from 'node:fs';

import { parseOHLCVCSV } from '../src/core/market/marketDataReader.ts';
import { calculateTechnicalIndicatorSeries } from '../src/core/market/technicalIndicatorSeries.ts';
import { calculateQuantitativeSignalSeries } from '../src/core/market/signalEngine.ts';
import { backtestQuantitativeSignals } from '../src/core/market/backtester.ts';
import {
  calculatePositionState,
  type PositionState,
} from '../src/core/market/positionState.ts';
import { makeDecision } from '../src/core/market/decisionEngine.ts';

const symbol =
  (process.argv[2] ?? 'CASTROLIND')
    .trim()
    .toUpperCase();

const quantity =
  Number(process.argv[3] ?? 0);

const averagePrice =
  Number(process.argv[4] ?? 0);

const filePath =
  `data/market_data/${symbol}_OHLCV.csv`;

const csv =
  readFileSync(filePath, 'utf8');

const dataset =
  parseOHLCVCSV(csv, symbol);

const candles =
  dataset.candles;

if (candles.length === 0) {
  throw new Error(
    `No market data found for ${symbol}.`
  );
}

const indicatorSeries =
  calculateTechnicalIndicatorSeries(
    candles
  );

const signals =
  calculateQuantitativeSignalSeries(
    indicatorSeries
  );

const backtest =
  backtestQuantitativeSignals(
    candles,
    signals,
    symbol
  );

const latestIndex =
  signals.length - 1;

const latestSignal =
  signals[latestIndex];

const latestIndicators =
  indicatorSeries[latestIndex];

const currentPrice =
  candles[candles.length - 1].close;

let position:
  PositionState | null = null;

if (
  quantity > 0 &&
  averagePrice > 0
) {
  position =
    calculatePositionState({
      symbol,
      quantity,
      averagePrice,
      currentPrice,
    });
}

const decision =
  makeDecision(
    latestSignal,
    backtest,
    position
  );

console.log(
  JSON.stringify(
    {
      symbol,

      market: {
        timestamp:
          latestIndicators.timestamp,

        currentPrice,
      },

      signal: latestSignal,

      position,

      decision,
    },
    null,
    2
  )
);