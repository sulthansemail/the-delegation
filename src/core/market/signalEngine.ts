import type { TechnicalIndicatorPoint } from './technicalIndicatorSeries';

export type SignalDirection =
  | 'BUY'
  | 'WAIT'
  | 'SELL';

export type SignalStrength =
  | 'STRONG'
  | 'MODERATE'
  | 'WEAK'
  | 'NONE';

export interface SignalComponent {
  name: string;
  score: number;
  maxScore: number;
  state: string;
  reason: string;
}

export interface QuantitativeSignal {
  timestamp: string;
  close: number;

  direction: SignalDirection;
  strength: SignalStrength;

  score: number;
  maxScore: number;
  normalizedScore: number;

  trend: string;
  momentum: string;
  volume: string;
  volatility: string;
  structure: string;

  components: SignalComponent[];

  riskFlags: string[];
}

function isPositive(value: number | null): boolean {
  return value !== null && value > 0;
}

function isNegative(value: number | null): boolean {
  return value !== null && value < 0;
}

function percentageDistance(
  price: number,
  reference: number | null
): number | null {
  if (reference === null || reference === 0) {
    return null;
  }

  return ((price - reference) / reference) * 100;
}

function classifyTrend(
  point: TechnicalIndicatorPoint
): {
  state: string;
  score: number;
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  if (
    point.sma20 !== null &&
    point.sma50 !== null &&
    point.close > point.sma20
  ) {
    score += 1;
    reasons.push('price above SMA20');
  } else if (
    point.sma20 !== null &&
    point.close < point.sma20
  ) {
    score -= 1;
    reasons.push('price below SMA20');
  }

  if (
    point.sma20 !== null &&
    point.sma50 !== null &&
    point.sma20 > point.sma50
  ) {
    score += 1;
    reasons.push('SMA20 above SMA50');
  } else if (
    point.sma20 !== null &&
    point.sma50 !== null &&
    point.sma20 < point.sma50
  ) {
    score -= 1;
    reasons.push('SMA20 below SMA50');
  }

  if (
    point.sma50 !== null &&
    point.sma200 !== null &&
    point.sma50 > point.sma200
  ) {
    score += 1;
    reasons.push('SMA50 above SMA200');
  } else if (
    point.sma50 !== null &&
    point.sma200 !== null &&
    point.sma50 < point.sma200
  ) {
    score -= 1;
    reasons.push('SMA50 below SMA200');
  }

  if (
    point.ema20 !== null &&
    point.ema50 !== null &&
    point.ema20 > point.ema50
  ) {
    score += 1;
    reasons.push('EMA20 above EMA50');
  } else if (
    point.ema20 !== null &&
    point.ema50 !== null &&
    point.ema20 < point.ema50
  ) {
    score -= 1;
    reasons.push('EMA20 below EMA50');
  }

  let state = 'NEUTRAL';

  if (score >= 3) {
    state = 'BULLISH';
  } else if (score <= -3) {
    state = 'BEARISH';
  } else if (score > 0) {
    state = 'LEANING BULLISH';
  } else if (score < 0) {
    state = 'LEANING BEARISH';
  }

  return {
    state,
    score,
    reason: reasons.join('; '),
  };
}

function classifyMomentum(
  point: TechnicalIndicatorPoint
): {
  state: string;
  score: number;
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  if (point.rsi14 !== null) {
    if (
      point.rsi14 >= 50 &&
      point.rsi14 <= 70
    ) {
      score += 2;
      reasons.push(
        `RSI ${point.rsi14.toFixed(1)} in bullish range`
      );
    } else if (
      point.rsi14 > 70
    ) {
      score -= 1;
      reasons.push(
        `RSI ${point.rsi14.toFixed(1)} overbought`
      );
    } else if (
      point.rsi14 >= 40
    ) {
      score += 1;
      reasons.push(
        `RSI ${point.rsi14.toFixed(1)} neutral-positive`
      );
    } else {
      score -= 2;
      reasons.push(
        `RSI ${point.rsi14.toFixed(1)} weak`
      );
    }
  }

  if (
    point.macd !== null &&
    point.macdSignal !== null
  ) {
    if (point.macd > point.macdSignal) {
      score += 1;
      reasons.push('MACD above signal');
    } else {
      score -= 1;
      reasons.push('MACD below signal');
    }
  }

  if (point.macdHistogram !== null) {
    if (point.macdHistogram > 0) {
      score += 1;
      reasons.push('MACD histogram positive');
    } else {
      score -= 1;
      reasons.push('MACD histogram negative');
    }
  }

  let state = 'NEUTRAL';

  if (score >= 3) {
    state = 'POSITIVE';
  } else if (score <= -2) {
    state = 'NEGATIVE';
  } else if (score > 0) {
    state = 'LEANING POSITIVE';
  } else if (score < 0) {
    state = 'LEANING NEGATIVE';
  }

  return {
    state,
    score,
    reason: reasons.join('; '),
  };
}

function classifyVolume(
  point: TechnicalIndicatorPoint
): {
  state: string;
  score: number;
  reason: string;
} {
  if (point.relativeVolume20 === null) {
    return {
      state: 'UNKNOWN',
      score: 0,
      reason: 'Relative volume unavailable',
    };
  }

  const relativeVolume =
    point.relativeVolume20;

  if (relativeVolume >= 1.5) {
    return {
      state: 'STRONG',
      score: 2,
      reason: `relative volume ${relativeVolume.toFixed(2)}x`,
    };
  }

  if (relativeVolume >= 1.0) {
    return {
      state: 'NORMAL',
      score: 1,
      reason: `relative volume ${relativeVolume.toFixed(2)}x`,
    };
  }

  return {
    state: 'LOW',
    score: -1,
    reason: `relative volume ${relativeVolume.toFixed(2)}x`,
  };
}

function classifyVolatility(
  point: TechnicalIndicatorPoint
): {
  state: string;
  score: number;
  reason: string;
} {
  if (
    point.atr14 === null ||
    point.close <= 0
  ) {
    return {
      state: 'UNKNOWN',
      score: 0,
      reason: 'ATR unavailable',
    };
  }

  const atrPercent =
    (point.atr14 / point.close) * 100;

  /*
   * Volatility itself is not inherently bullish or bearish.
   * This score therefore rewards a tradable but not extreme
   * volatility regime and penalizes unusually large ranges.
   */
  if (atrPercent <= 2) {
    return {
      state: 'LOW',
      score: 0,
      reason: `ATR is ${atrPercent.toFixed(2)}% of price`,
    };
  }

  if (atrPercent <= 5) {
    return {
      state: 'MODERATE',
      score: 1,
      reason: `ATR is ${atrPercent.toFixed(2)}% of price`,
    };
  }

  if (atrPercent <= 8) {
    return {
      state: 'HIGH',
      score: 0,
      reason: `ATR is ${atrPercent.toFixed(2)}% of price`,
    };
  }

  return {
    state: 'EXTREME',
    score: -1,
    reason: `ATR is ${atrPercent.toFixed(2)}% of price`,
  };
}

function classifyStructure(
  point: TechnicalIndicatorPoint
): {
  state: string;
  score: number;
  reason: string;
} {
  let score = 0;
  const reasons: string[] = [];

  if (
    point.recentHigh20 !== null &&
    point.close > point.recentHigh20
  ) {
    score += 3;
    reasons.push('breakout above previous 20-day high');
  } else if (
    point.recentHigh20 !== null
  ) {
    const distance =
      percentageDistance(
        point.close,
        point.recentHigh20
      );

    if (
      distance !== null &&
      distance >= -3
    ) {
      score += 1;
      reasons.push(
        `close ${Math.abs(distance).toFixed(1)}% below 20-day high`
      );
    }
  }

  if (
    point.recentLow20 !== null &&
    point.close < point.recentLow20
  ) {
    score -= 3;
    reasons.push('breakdown below previous 20-day low');
  }

  if (
    point.recentHigh20 !== null &&
    point.recentLow20 !== null
  ) {
    const range =
      point.recentHigh20 -
      point.recentLow20;

    if (range > 0) {
      const location =
        (point.close -
          point.recentLow20) /
        range;

      if (location >= 0.7) {
        score += 1;
        reasons.push(
          'price in upper part of recent range'
        );
      } else if (location <= 0.3) {
        score -= 1;
        reasons.push(
          'price in lower part of recent range'
        );
      }
    }
  }

  let state = 'NEUTRAL';

  if (score >= 3) {
    state = 'BREAKOUT / BULLISH';
  } else if (score <= -3) {
    state = 'BREAKDOWN / BEARISH';
  } else if (score > 0) {
    state = 'BULLISH STRUCTURE';
  } else if (score < 0) {
    state = 'BEARISH STRUCTURE';
  }

  return {
    state,
    score,
    reason: reasons.join('; '),
  };
}

export function calculateQuantitativeSignal(
  point: TechnicalIndicatorPoint
): QuantitativeSignal {
  const trend =
    classifyTrend(point);

  const momentum =
    classifyMomentum(point);

  const volume =
    classifyVolume(point);

  const volatility =
    classifyVolatility(point);

  const structure =
    classifyStructure(point);

  /*
   * Maximum possible score:
   *
   * Trend      4
   * Momentum   4
   * Volume     2
   * Volatility 1
   * Structure  5
   *
   * Total     16
   */
  const maxScore = 16;

  const rawScore =
    trend.score +
    momentum.score +
    volume.score +
    volatility.score +
    structure.score;

  const score =
    Math.max(
      -maxScore,
      Math.min(maxScore, rawScore)
    );

  const normalizedScore =
    ((score + maxScore) /
      (maxScore * 2)) *
    10;

  let direction: SignalDirection;

  if (score >= 7) {
    direction = 'BUY';
  } else if (score <= -7) {
    direction = 'SELL';
  } else {
    direction = 'WAIT';
  }

  let strength: SignalStrength;

  const absoluteScore =
    Math.abs(score);

  if (absoluteScore >= 10) {
    strength = 'STRONG';
  } else if (absoluteScore >= 7) {
    strength = 'MODERATE';
  } else if (absoluteScore >= 3) {
    strength = 'WEAK';
  } else {
    strength = 'NONE';
  }

  const riskFlags: string[] = [];

  if (
    point.rsi14 !== null &&
    point.rsi14 > 70
  ) {
    riskFlags.push('RSI overbought');
  }

  if (
    point.rsi14 !== null &&
    point.rsi14 < 30
  ) {
    riskFlags.push('RSI oversold');
  }

  if (
    point.atr14 !== null &&
    point.close > 0 &&
    point.atr14 / point.close > 0.08
  ) {
    riskFlags.push(
      'extreme volatility'
    );
  }

  if (
    point.relativeVolume20 !== null &&
    point.relativeVolume20 < 0.75
  ) {
    riskFlags.push(
      'below-average volume'
    );
  }

  if (
    point.macd !== null &&
    point.macdSignal !== null &&
    point.macd < point.macdSignal
  ) {
    riskFlags.push(
      'MACD below signal'
    );
  }

  return {
    timestamp: point.timestamp,
    close: point.close,

    direction,
    strength,

    score,
    maxScore,
    normalizedScore,

    trend: trend.state,
    momentum: momentum.state,
    volume: volume.state,
    volatility: volatility.state,
    structure: structure.state,

    components: [
      {
        name: 'Trend',
        score: trend.score,
        maxScore: 4,
        state: trend.state,
        reason: trend.reason,
      },
      {
        name: 'Momentum',
        score: momentum.score,
        maxScore: 4,
        state: momentum.state,
        reason: momentum.reason,
      },
      {
        name: 'Volume',
        score: volume.score,
        maxScore: 2,
        state: volume.state,
        reason: volume.reason,
      },
      {
        name: 'Volatility',
        score: volatility.score,
        maxScore: 1,
        state: volatility.state,
        reason: volatility.reason,
      },
      {
        name: 'Structure',
        score: structure.score,
        maxScore: 5,
        state: structure.state,
        reason: structure.reason,
      },
    ],

    riskFlags,
  };
}

export function calculateQuantitativeSignalSeries(
  series: TechnicalIndicatorPoint[]
): QuantitativeSignal[] {
  return series.map(
    calculateQuantitativeSignal
  );
}