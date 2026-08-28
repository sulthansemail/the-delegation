import type { OHLCV } from './marketDataReader';

export interface TechnicalIndicatorPoint {
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

function smaSeries(
  values: number[],
  period: number
): Array<number | null> {
  const result: Array<number | null> =
    new Array(values.length).fill(null);

  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];

    if (i >= period) {
      sum -= values[i - period];
    }

    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }

  return result;
}

function emaSeries(
  values: number[],
  period: number
): Array<number | null> {
  const result: Array<number | null> =
    new Array(values.length).fill(null);

  if (values.length < period) {
    return result;
  }

  let sum = 0;

  for (let i = 0; i < period; i++) {
    sum += values[i];
  }

  let ema = sum / period;

  result[period - 1] = ema;

  const multiplier = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    ema =
      (values[i] - ema) * multiplier + ema;

    result[i] = ema;
  }

  return result;
}

function rsiSeries(
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

    if (change > 0) {
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
      const rs =
        averageGain / averageLoss;

      result[i] =
        100 - 100 / (1 + rs);
    }
  }

  return result;
}

function trueRangeSeries(
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

function atrSeries(
  candles: OHLCV[],
  period: number
): Array<number | null> {
  const result: Array<number | null> =
    new Array(candles.length).fill(null);

  const trueRanges =
    trueRangeSeries(candles);

  if (trueRanges.length < period) {
    return result;
  }

  let atr =
    trueRanges
      .slice(0, period)
      .reduce(
        (sum, value) => sum + value,
        0
      ) / period;

  result[period - 1] = atr;

  for (
    let i = period;
    i < trueRanges.length;
    i++
  ) {
    atr =
      (atr * (period - 1) +
        trueRanges[i]) /
      period;

    result[i] = atr;
  }

  return result;
}

/**
 * Rolling high/low of the PREVIOUS N candles.
 *
 * The current candle is deliberately excluded.
 * This is important for backtesting because including
 * the current candle can introduce look-ahead bias
 * when detecting breakouts.
 */
function previousHighSeries(
  candles: OHLCV[],
  period: number
): Array<number | null> {
  const result: Array<number | null> =
    new Array(candles.length).fill(null);

  for (let i = period; i < candles.length; i++) {
    let high = -Infinity;

    for (
      let j = i - period;
      j < i;
      j++
    ) {
      high = Math.max(
        high,
        candles[j].high
      );
    }

    result[i] = high;
  }

  return result;
}

function previousLowSeries(
  candles: OHLCV[],
  period: number
): Array<number | null> {
  const result: Array<number | null> =
    new Array(candles.length).fill(null);

  for (let i = period; i < candles.length; i++) {
    let low = Infinity;

    for (
      let j = i - period;
      j < i;
      j++
    ) {
      low = Math.min(
        low,
        candles[j].low
      );
    }

    result[i] = low;
  }

  return result;
}

function macdSeries(
  closes: number[]
): {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
} {
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);

  const macd: Array<number | null> =
    new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (
      ema12[i] !== null &&
      ema26[i] !== null
    ) {
      macd[i] =
        ema12[i]! - ema26[i]!;
    }
  }

  /*
   * The MACD signal is a 9-period EMA of valid
   * MACD values. We calculate it on the compact
   * valid MACD sequence and then map it back to
   * the original candle indices.
   */
  const validMacd: number[] = [];
  const validIndices: number[] = [];

  for (let i = 0; i < macd.length; i++) {
    if (macd[i] !== null) {
      validMacd.push(macd[i]!);
      validIndices.push(i);
    }
  }

  const signalCompact =
    emaSeries(validMacd, 9);

  const signal: Array<number | null> =
    new Array(closes.length).fill(null);

  for (
    let i = 0;
    i < validIndices.length;
    i++
  ) {
    const value =
      signalCompact[i];

    if (value !== null) {
      signal[validIndices[i]] = value;
    }
  }

  const histogram: Array<number | null> =
    new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i++) {
    if (
      macd[i] !== null &&
      signal[i] !== null
    ) {
      histogram[i] =
        macd[i]! - signal[i]!;
    }
  }

  return {
    macd,
    signal,
    histogram,
  };
}

export function calculateTechnicalIndicatorSeries(
  candles: OHLCV[]
): TechnicalIndicatorPoint[] {
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

  const sma20 = smaSeries(closes, 20);
  const sma50 = smaSeries(closes, 50);
  const sma200 = smaSeries(closes, 200);

  const ema20 = emaSeries(closes, 20);
  const ema50 = emaSeries(closes, 50);

  const rsi14 = rsiSeries(closes, 14);

  const {
    macd,
    signal: macdSignal,
    histogram: macdHistogram,
  } = macdSeries(closes);

  const atr14 = atrSeries(candles, 14);

  const averageVolume20 =
    smaSeries(volumes, 20);

  const relativeVolume20:
    Array<number | null> =
    new Array(candles.length).fill(null);

  for (
    let i = 0;
    i < candles.length;
    i++
  ) {
    if (
      averageVolume20[i] !== null &&
      averageVolume20[i]! > 0
    ) {
      relativeVolume20[i] =
        volumes[i] /
        averageVolume20[i]!;
    }
  }

  const recentHigh20 =
    previousHighSeries(candles, 20);

  const recentLow20 =
    previousLowSeries(candles, 20);

  return candles.map(
    (candle, index) => ({
      timestamp: candle.timestamp,

      close: candle.close,

      sma20: sma20[index],
      sma50: sma50[index],
      sma200: sma200[index],

      ema20: ema20[index],
      ema50: ema50[index],

      rsi14: rsi14[index],

      macd: macd[index],
      macdSignal: macdSignal[index],
      macdHistogram:
        macdHistogram[index],

      atr14: atr14[index],

      averageVolume20:
        averageVolume20[index],

      relativeVolume20:
        relativeVolume20[index],

      recentHigh20:
        recentHigh20[index],

      recentLow20:
        recentLow20[index],
    })
  );
}