import type { OHLCV } from './marketDataReader.ts';

export interface TechnicalIndicators {
  timestamp: string;

  close: number;

  sma20: number | null;
  sma50: number | null;
  sma200: number | null;

  ema20: number | null;
  ema50: number | null;

  rsi14: number | null;

  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;

  atr14: number | null;

  averageVolume20: number | null;
  relativeVolume20: number | null;

  recentHigh20: number | null;
  recentLow20: number | null;
}

function simpleMovingAverage(
  values: number[],
  period: number
): number | null {
  if (values.length < period) {
    return null;
  }

  const slice = values.slice(-period);

  return (
    slice.reduce((sum, value) => sum + value, 0) /
    period
  );
}

function exponentialMovingAverageSeries(
  values: number[],
  period: number
): Array<number | null> {
  const result: Array<number | null> = new Array(
    values.length
  ).fill(null);

  if (values.length < period) {
    return result;
  }

  const initial =
    values
      .slice(0, period)
      .reduce((sum, value) => sum + value, 0) /
    period;

  result[period - 1] = initial;

  const multiplier = 2 / (period + 1);

  let previous = initial;

  for (let i = period; i < values.length; i++) {
    const current =
      (values[i] - previous) * multiplier +
      previous;

    result[i] = current;
    previous = current;
  }

  return result;
}

function exponentialMovingAverage(
  values: number[],
  period: number
): number | null {
  const series =
    exponentialMovingAverageSeries(
      values,
      period
    );

  const value = series[series.length - 1];

  return value ?? null;
}

function calculateRSISeries(
  closes: number[],
  period: number
): Array<number | null> {
  const result: Array<number | null> =
    new Array(closes.length).fill(null);

  if (closes.length <= period) {
    return result;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const change =
      closes[i] - closes[i - 1];

    if (change >= 0) {
      gainSum += change;
    } else {
      lossSum -= change;
    }
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  result[period] =
    averageLoss === 0
      ? 100
      : 100 -
        100 /
          (1 + averageGain / averageLoss);

  for (
    let i = period + 1;
    i < closes.length;
    i++
  ) {
    const change =
      closes[i] - closes[i - 1];

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      (averageGain * (period - 1) + gain) /
      period;

    averageLoss =
      (averageLoss * (period - 1) + loss) /
      period;

    if (averageLoss === 0) {
      result[i] = 100;
    } else {
      const relativeStrength =
        averageGain / averageLoss;

      result[i] =
        100 -
        100 / (1 + relativeStrength);
    }
  }

  return result;
}

function calculateTrueRange(
  candles: OHLCV[]
): number[] {
  return candles.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose =
      candles[index - 1].close;

    return Math.max(
      candle.high - candle.low,
      Math.abs(
        candle.high - previousClose
      ),
      Math.abs(
        candle.low - previousClose
      )
    );
  });
}

function calculateATR(
  candles: OHLCV[],
  period: number
): number | null {
  const trueRanges =
    calculateTrueRange(candles);

  if (trueRanges.length < period) {
    return null;
  }

  let atr =
    trueRanges
      .slice(0, period)
      .reduce(
        (sum, value) => sum + value,
        0
      ) / period;

  for (
    let i = period;
    i < trueRanges.length;
    i++
  ) {
    atr =
      (atr * (period - 1) +
        trueRanges[i]) /
      period;
  }

  return atr;
}

function calculateAverageVolume(
  volumes: number[],
  period: number
): number | null {
  return simpleMovingAverage(
    volumes,
    period
  );
}

function calculateRecentHigh(
  candles: OHLCV[],
  period: number
): number | null {
  if (candles.length < period) {
    return null;
  }

  return Math.max(
    ...candles
      .slice(-period)
      .map((candle) => candle.high)
  );
}

function calculateRecentLow(
  candles: OHLCV[],
  period: number
): number | null {
  if (candles.length < period) {
    return null;
  }

  return Math.min(
    ...candles
      .slice(-period)
      .map((candle) => candle.low)
  );
}

export function calculateTechnicalIndicators(
  candles: OHLCV[]
): TechnicalIndicators {
  if (candles.length === 0) {
    throw new Error(
      'Cannot calculate technical indicators from empty OHLCV data.'
    );
  }

  const closes = candles.map(
    (candle) => candle.close
  );

  const volumes = candles.map(
    (candle) => candle.volume
  );

  const latest =
    candles[candles.length - 1];

  const sma20 =
    simpleMovingAverage(closes, 20);

  const sma50 =
    simpleMovingAverage(closes, 50);

  const sma200 =
    simpleMovingAverage(closes, 200);

  const ema20 =
    exponentialMovingAverage(closes, 20);

  const ema50 =
    exponentialMovingAverage(closes, 50);

  const rsiSeries =
    calculateRSISeries(closes, 14);

  const rsi14 =
    rsiSeries[rsiSeries.length - 1] ??
    null;

  const ema12Series =
    exponentialMovingAverageSeries(
      closes,
      12
    );

  const ema26Series =
    exponentialMovingAverageSeries(
      closes,
      26
    );

  const macdSeries: Array<number | null> =
    closes.map((_, index) => {
      const ema12 = ema12Series[index];
      const ema26 = ema26Series[index];

      if (
        ema12 === null ||
        ema26 === null
      ) {
        return null;
      }

      return ema12 - ema26;
    });

  const validMacdValues =
    macdSeries.filter(
      (value): value is number =>
        value !== null
    );

  const macdSignalSeries =
    exponentialMovingAverageSeries(
      validMacdValues,
      9
    );

  const macd =
    macdSeries[macdSeries.length - 1] ??
    null;

  const macdSignal =
    macdSignalSeries[
      macdSignalSeries.length - 1
    ] ?? null;

  const macdHistogram =
    macd !== null &&
    macdSignal !== null
      ? macd - macdSignal
      : null;

  const atr14 =
    calculateATR(candles, 14);

  const averageVolume20 =
    calculateAverageVolume(
      volumes,
      20
    );

  const relativeVolume20 =
    averageVolume20 !== null &&
    averageVolume20 > 0
      ? latest.volume /
        averageVolume20
      : null;

  return {
    timestamp: latest.timestamp,

    close: latest.close,

    sma20,
    sma50,
    sma200,

    ema20,
    ema50,

    rsi14,

    macd,
    macdSignal,
    macdHistogram,

    atr14,

    averageVolume20,
    relativeVolume20,

    recentHigh20:
      calculateRecentHigh(candles, 20),

    recentLow20:
      calculateRecentLow(candles, 20),
  };
}