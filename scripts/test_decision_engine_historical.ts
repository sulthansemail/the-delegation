import fs from 'node:fs';

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

import {
  calculatePositionState,
} from '../src/core/market/positionState.ts';

import {
  makeDecision,
} from '../src/core/market/decisionEngine.ts';

const symbol =
  (process.argv[2] ?? 'BEPL')
    .trim()
    .toUpperCase();

const quantityArg =
  process.argv[3];

const averagePriceArg =
  process.argv[4];

const filePath =
  `data/market_data/${symbol}_OHLCV.csv`;

if (!fs.existsSync(filePath)) {
  throw new Error(
    `Market data file not found: ${filePath}`
  );
}

const csv =
  fs.readFileSync(
    filePath,
    'utf8'
  );

const dataset =
  parseOHLCVCSV(
    csv,
    symbol
  );

const candles =
  dataset.candles;

if (candles.length === 0) {
  throw new Error(
    `No candles found for ${symbol}.`
  );
}

/*
 * Build the technical indicator series.
 *
 * The signal engine operates on
 * TechnicalIndicatorPoint[], not raw OHLCV.
 */
const indicatorSeries =
  calculateTechnicalIndicatorSeries(
    candles
  );

/*
 * Generate the complete historical
 * quantitative signal series.
 */
const signals =
  calculateQuantitativeSignalSeries(
    indicatorSeries
  );

/*
 * Backtest the historical signals.
 *
 * This gives us the historical evidence
 * that the decision engine uses.
 */
const backtest =
  backtestQuantitativeSignals(
    candles,
    signals,
    symbol
  );

/*
 * Find historical BUY and SELL signals.
 *
 * We deliberately search the signal history
 * rather than using today's signal, because
 * today's signal may simply be WAIT.
 */
const buySignalIndex =
  signals.findIndex(
    (signal) =>
      signal.direction === 'BUY'
  );

const sellSignalIndex =
  signals.findIndex(
    (signal) =>
      signal.direction === 'SELL'
  );

if (buySignalIndex === -1) {
  throw new Error(
    `No historical BUY signal found for ${symbol}.`
  );
}

if (sellSignalIndex === -1) {
  throw new Error(
    `No historical SELL signal found for ${symbol}.`
  );
}

/*
 * Helper to evaluate a historical signal.
 *
 * Position is optional:
 *
 * no position
 *     → tests BUY / WAIT / AVOID behavior
 *
 * existing position
 *     → tests HOLD / SELL behavior
 */
function evaluateHistoricalSignal(
  index: number,
  position: ReturnType<
    typeof calculatePositionState
  > | null
) {
  const signal =
    signals[index];

  return {
    index,

    timestamp:
      signal.timestamp,

    close:
      candles[index].close,

    signal,

    decision:
      makeDecision(
        signal,
        backtest,
        position
      ),
  };
}

/*
 * ------------------------------------------------------------
 * BUY SIGNAL
 * ------------------------------------------------------------
 */

const buySignal =
  signals[buySignalIndex];

const buyPrice =
  candles[buySignalIndex].close;

const buyNoPosition =
  evaluateHistoricalSignal(
    buySignalIndex,
    null
  );

const buyExistingPosition =
  evaluateHistoricalSignal(
    buySignalIndex,
    calculatePositionState({
      symbol,
      quantity: 50,
      averagePrice: buyPrice * 0.90,
      currentPrice: buyPrice,
    })
  );

/*
 * ------------------------------------------------------------
 * SELL SIGNAL
 * ------------------------------------------------------------
 */

const sellSignal =
  signals[sellSignalIndex];

const sellPrice =
  candles[sellSignalIndex].close;

const sellNoPosition =
  evaluateHistoricalSignal(
    sellSignalIndex,
    null
  );

const sellExistingPosition =
  evaluateHistoricalSignal(
    sellSignalIndex,
    calculatePositionState({
      symbol,
      quantity: 50,
      averagePrice: sellPrice * 0.90,
      currentPrice: sellPrice,
    })
  );

/*
 * ------------------------------------------------------------
 * OPTIONAL USER POSITION
 * ------------------------------------------------------------
 *
 * If the user supplies:
 *
 *   symbol quantity averagePrice
 *
 * we also evaluate the CURRENT signal
 * against that real position.
 */
let currentPosition = null;

if (
  quantityArg !== undefined ||
  averagePriceArg !== undefined
) {
  if (
    quantityArg === undefined ||
    averagePriceArg === undefined
  ) {
    throw new Error(
      'Both quantity and average price are required when providing a position.'
    );
  }

  const quantity =
    Number(quantityArg);

  const averagePrice =
    Number(averagePriceArg);

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      'Quantity must be greater than zero.'
    );
  }

  if (
    !Number.isFinite(averagePrice) ||
    averagePrice <= 0
  ) {
    throw new Error(
      'Average price must be greater than zero.'
    );
  }

  const latestIndex =
    candles.length - 1;

  currentPosition =
    calculatePositionState({
      symbol,
      quantity,
      averagePrice,
      currentPrice:
        candles[latestIndex].close,
    });
}

/*
 * ------------------------------------------------------------
 * OUTPUT
 * ------------------------------------------------------------
 */

console.log(
  JSON.stringify(
    {
      symbol,

      dataset: {
        candles:
          candles.length,

        firstDate:
          candles[0].timestamp,

        lastDate:
          candles[candles.length - 1]
            .timestamp,
      },

      historicalSignals: {
        buy: {
          index:
            buySignalIndex,

          timestamp:
            buySignal.timestamp,

          close:
            buyPrice,

          strength:
            buySignal.strength,

          score:
            buySignal.score,

          direction:
            buySignal.direction,
        },

        sell: {
          index:
            sellSignalIndex,

          timestamp:
            sellSignal.timestamp,

          close:
            sellPrice,

          strength:
            sellSignal.strength,

          score:
            sellSignal.score,

          direction:
            sellSignal.direction,
        },
      },

      tests: {
        buyWithoutPosition:
          buyNoPosition,

        buyWithPosition:
          buyExistingPosition,

        sellWithoutPosition:
          sellNoPosition,

        sellWithPosition:
          sellExistingPosition,
      },

      currentPosition,

      currentSignal:
        signals[signals.length - 1],

      currentDecision:
        makeDecision(
          signals[signals.length - 1],
          backtest,
          currentPosition
        ),
    },
    null,
    2
  )
);