import type { OHLCV } from './marketDataReader';
import type { QuantitativeSignal } from './signalEngine';

export interface BacktestTrade {
  signalTimestamp: string;
  entryTimestamp: string;

  direction: 'BUY' | 'SELL';

  signalScore: number;
  signalStrength: QuantitativeSignal['strength'];

  entryPrice: number;

  return5d: number | null;
  return10d: number | null;
  return20d: number | null;

  maxFavorableExcursion5d: number | null;
  maxAdverseExcursion5d: number | null;

  maxFavorableExcursion10d: number | null;
  maxAdverseExcursion10d: number | null;

  maxFavorableExcursion20d: number | null;
  maxAdverseExcursion20d: number | null;
}

export interface BacktestStatistics {
  observations: number;

  winRate: number | null;

  averageReturn: number | null;
  medianReturn: number | null;

  expectancy: number | null;

  averageWin: number | null;
  averageLoss: number | null;

  bestReturn: number | null;
  worstReturn: number | null;

  totalReturn: number | null;

  profitFactor: number | null;
}

export interface SignalBucketStatistics {
  observations: number;
  winRate: number | null;
  averageReturn: number | null;
  medianReturn: number | null;
  expectancy: number | null;
  profitFactor: number | null;
}

export interface BacktestResult {
  symbol?: string;

  totalCandles: number;
  totalSignals: number;

  buySignals: number;
  sellSignals: number;
  waitSignals: number;

  buy: {
    horizon5d: BacktestStatistics;
    horizon10d: BacktestStatistics;
    horizon20d: BacktestStatistics;
  };

  sell: {
    horizon5d: BacktestStatistics;
    horizon10d: BacktestStatistics;
    horizon20d: BacktestStatistics;
  };

  combined: {
    horizon5d: BacktestStatistics;
    horizon10d: BacktestStatistics;
    horizon20d: BacktestStatistics;
  };

  buyScoreBuckets: Record<
    string,
    SignalBucketStatistics
  >;

  sellScoreBuckets: Record<
    string,
    SignalBucketStatistics
  >;

  trades: BacktestTrade[];
}

function calculateReturn(
  entryPrice: number,
  exitPrice: number,
  direction: 'BUY' | 'SELL'
): number {
  if (entryPrice === 0) {
    return 0;
  }

  const raw =
    ((exitPrice - entryPrice) /
      entryPrice) *
    100;

  return direction === 'BUY'
    ? raw
    : -raw;
}

function median(
  values: number[]
): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort(
    (a, b) => a - b
  );

  const middle =
    Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (
      (sorted[middle - 1] +
        sorted[middle]) /
      2
    );
  }

  return sorted[middle];
}

function buildStatistics(
  returns: number[]
): BacktestStatistics {
  if (returns.length === 0) {
    return {
      observations: 0,
      winRate: null,
      averageReturn: null,
      medianReturn: null,
      expectancy: null,
      averageWin: null,
      averageLoss: null,
      bestReturn: null,
      worstReturn: null,
      totalReturn: null,
      profitFactor: null,
    };
  }

  const wins =
    returns.filter(
      value => value > 0
    );

  const losses =
    returns.filter(
      value => value < 0
    );

  const averageReturn =
    returns.reduce(
      (sum, value) => sum + value,
      0
    ) / returns.length;

  const averageWin =
    wins.length > 0
      ? wins.reduce(
          (sum, value) => sum + value,
          0
        ) / wins.length
      : null;

  const averageLoss =
    losses.length > 0
      ? losses.reduce(
          (sum, value) => sum + value,
          0
        ) / losses.length
      : null;

  const grossProfit =
    wins.reduce(
      (sum, value) => sum + value,
      0
    );

  const grossLoss =
    Math.abs(
      losses.reduce(
        (sum, value) => sum + value,
        0
      )
    );

  return {
    observations: returns.length,

    winRate:
      (wins.length / returns.length) *
      100,

    averageReturn,

    medianReturn:
      median(returns),

    expectancy:
      averageReturn,

    averageWin,

    averageLoss,

    bestReturn:
      Math.max(...returns),

    worstReturn:
      Math.min(...returns),

    totalReturn:
      returns.reduce(
        (sum, value) => sum + value,
        0
      ),

    profitFactor:
      grossLoss > 0
        ? grossProfit / grossLoss
        : grossProfit > 0
          ? Infinity
          : null,
  };
}

function calculateExcursions(
  candles: OHLCV[],
  entryIndex: number,
  horizon: number,
  entryPrice: number,
  direction: 'BUY' | 'SELL'
): {
  mfe: number | null;
  mae: number | null;
} {
  const endIndex =
    Math.min(
      candles.length - 1,
      entryIndex + horizon
    );

  if (entryIndex >= endIndex) {
    return {
      mfe: null,
      mae: null,
    };
  }

  let mfe: number | null = null;
  let mae: number | null = null;

  for (
    let i = entryIndex + 1;
    i <= endIndex;
    i++
  ) {
    const candle =
      candles[i];

    const highReturn =
      calculateReturn(
        entryPrice,
        candle.high,
        direction
      );

    const lowReturn =
      calculateReturn(
        entryPrice,
        candle.low,
        direction
      );

    const favorable =
      Math.max(
        highReturn,
        lowReturn
      );

    const adverse =
      Math.min(
        highReturn,
        lowReturn
      );

    mfe =
      mfe === null
        ? favorable
        : Math.max(
            mfe,
            favorable
          );

    mae =
      mae === null
        ? adverse
        : Math.min(
            mae,
            adverse
          );
  }

  return {
    mfe,
    mae,
  };
}

function getScoreBucket(
  score: number
): string {
  const absolute =
    Math.abs(score);

  if (absolute <= 8) {
    return '7-8';
  }

  if (absolute <= 10) {
    return '9-10';
  }

  if (absolute <= 12) {
    return '11-12';
  }

  return '13-16';
}

function buildBucketStatistics(
  returns: number[]
): SignalBucketStatistics {
  const statistics =
    buildStatistics(returns);

  return {
    observations:
      statistics.observations,

    winRate:
      statistics.winRate,

    averageReturn:
      statistics.averageReturn,

    medianReturn:
      statistics.medianReturn,

    expectancy:
      statistics.expectancy,

    profitFactor:
      statistics.profitFactor,
  };
}

/**
 * Backtests quantitative signals without look-ahead bias.
 *
 * Signal is generated using candle T.
 *
 * Entry/exit occurs at candle T+1 OPEN.
 *
 * Future performance is then measured
 * from that execution point.
 *
 * BUY:
 *   Measures hypothetical long-entry performance.
 *
 * SELL:
 *   Measures what happened after a long-holder
 *   received an exit signal.
 *
 * SELL is NOT treated as a short trade.
 */
export function backtestQuantitativeSignals(
  candles: OHLCV[],
  signals: QuantitativeSignal[],
  symbol?: string
): BacktestResult {
  if (
    candles.length !==
    signals.length
  ) {
    throw new Error(
      `Candle/signal length mismatch: ${candles.length} candles, ${signals.length} signals.`
    );
  }

  const trades: BacktestTrade[] =
    [];

  const buyReturns5: number[] =
    [];
  const buyReturns10: number[] =
    [];
  const buyReturns20: number[] =
    [];

  const sellReturns5: number[] =
    [];
  const sellReturns10: number[] =
    [];
  const sellReturns20: number[] =
    [];

  let buySignals = 0;
  let sellSignals = 0;
  let waitSignals = 0;

  const buyScoreBuckets: Record<
    string,
    number[]
  > = {};

  const sellScoreBuckets: Record<
    string,
    number[]
  > = {};

  for (
    let signalIndex = 0;
    signalIndex < signals.length;
    signalIndex++
  ) {
    const signal =
      signals[signalIndex];

    if (
      signal.direction ===
      'WAIT'
    ) {
      waitSignals++;
      continue;
    }

    const entryIndex =
      signalIndex + 1;

    if (
      entryIndex >=
      candles.length
    ) {
      continue;
    }

    const entryCandle =
      candles[entryIndex];

    const direction =
      signal.direction;

    const entryPrice =
      entryCandle.open;

    if (direction === 'BUY') {
      buySignals++;
    } else {
      sellSignals++;
    }

    const returns: Record<
      5 | 10 | 20,
      number | null
    > = {
      5: null,
      10: null,
      20: null,
    };

    for (
      const horizon of [5, 10, 20] as const
    ) {
      const exitIndex =
        entryIndex + horizon;

      if (
        exitIndex <
        candles.length
      ) {
        returns[horizon] =
          calculateReturn(
            entryPrice,
            candles[exitIndex].close,
            direction
          );
      }
    }

    if (
      returns[5] !== null
    ) {
      if (direction === 'BUY') {
        buyReturns5.push(
          returns[5]
        );
      } else {
        sellReturns5.push(
          returns[5]
        );
      }
    }

    if (
      returns[10] !== null
    ) {
      if (direction === 'BUY') {
        buyReturns10.push(
          returns[10]
        );
      } else {
        sellReturns10.push(
          returns[10]
        );
      }
    }

    if (
      returns[20] !== null
    ) {
      if (direction === 'BUY') {
        buyReturns20.push(
          returns[20]
        );
      } else {
        sellReturns20.push(
          returns[20]
        );
      }
    }

    const scoreBucket =
      getScoreBucket(
        signal.score
      );

    if (returns[10] !== null) {
      const bucket =
        direction === 'BUY'
          ? buyScoreBuckets
          : sellScoreBuckets;

      if (!bucket[scoreBucket]) {
        bucket[scoreBucket] =
          [];
      }

      bucket[scoreBucket].push(
        returns[10]
      );
    }

    const mfe5 =
      calculateExcursions(
        candles,
        entryIndex,
        5,
        entryPrice,
        direction
      );

    const mfe10 =
      calculateExcursions(
        candles,
        entryIndex,
        10,
        entryPrice,
        direction
      );

    const mfe20 =
      calculateExcursions(
        candles,
        entryIndex,
        20,
        entryPrice,
        direction
      );

    trades.push({
      signalTimestamp:
        signal.timestamp,

      entryTimestamp:
        entryCandle.timestamp,

      direction,

      signalScore:
        signal.score,

      signalStrength:
        signal.strength,

      entryPrice,

      return5d:
        returns[5],

      return10d:
        returns[10],

      return20d:
        returns[20],

      maxFavorableExcursion5d:
        mfe5.mfe,

      maxAdverseExcursion5d:
        mfe5.mae,

      maxFavorableExcursion10d:
        mfe10.mfe,

      maxAdverseExcursion10d:
        mfe10.mae,

      maxFavorableExcursion20d:
        mfe20.mfe,

      maxAdverseExcursion20d:
        mfe20.mae,
    });
  }

  const buyScoreBucketStatistics =
    Object.fromEntries(
      Object.entries(
        buyScoreBuckets
      ).map(
        ([bucket, returns]) => [
          bucket,
          buildBucketStatistics(
            returns
          ),
        ]
      )
    );

  const sellScoreBucketStatistics =
    Object.fromEntries(
      Object.entries(
        sellScoreBuckets
      ).map(
        ([bucket, returns]) => [
          bucket,
          buildBucketStatistics(
            returns
          ),
        ]
      )
    );

  return {
    symbol,

    totalCandles:
      candles.length,

    totalSignals:
      signals.length,

    buySignals,

    sellSignals,

    waitSignals,

    buy: {
      horizon5d:
        buildStatistics(
          buyReturns5
        ),

      horizon10d:
        buildStatistics(
          buyReturns10
        ),

      horizon20d:
        buildStatistics(
          buyReturns20
        ),
    },

    sell: {
      horizon5d:
        buildStatistics(
          sellReturns5
        ),

      horizon10d:
        buildStatistics(
          sellReturns10
        ),

      horizon20d:
        buildStatistics(
          sellReturns20
        ),
    },

    combined: {
      horizon5d:
        buildStatistics([
          ...buyReturns5,
          ...sellReturns5,
        ]),

      horizon10d:
        buildStatistics([
          ...buyReturns10,
          ...sellReturns10,
        ]),

      horizon20d:
        buildStatistics([
          ...buyReturns20,
          ...sellReturns20,
        ]),
    },

    buyScoreBuckets:
      buyScoreBucketStatistics,

    sellScoreBuckets:
      sellScoreBucketStatistics,

    trades,
  };
}