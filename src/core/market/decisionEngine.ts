import type { QuantitativeSignal } from './signalEngine.ts';
import type {
  BacktestResult,
  BacktestStatistics,
} from './backtester.ts';
import type { PositionState } from './positionState.ts';

export type DecisionAction =
  | 'BUY'
  | 'WAIT'
  | 'AVOID'
  | 'HOLD'
  | 'SELL';

export type DecisionConfidence =
  | 'HIGH'
  | 'MODERATE'
  | 'LOW'
  | 'NONE';

export interface DecisionEvidence {
  action: DecisionAction;
  confidence: DecisionConfidence;

  summary: string;

  reasons: string[];
  riskFlags: string[];

  currentSignal: {
    direction: QuantitativeSignal['direction'];
    strength: QuantitativeSignal['strength'];
    score: number;
    maxScore: number;
    normalizedScore: number;
    trend: string;
    momentum: string;
    volume: string;
    volatility: string;
    structure: string;
  };

  historicalEvidence: {
    horizon5d: BacktestStatistics;
    horizon10d: BacktestStatistics;
    horizon20d: BacktestStatistics;
    observations: number;
  };

  positionContext: PositionState | null;

  decisionBasis: {
    currentSignal: string;
    historicalValidation: string;
    positionImpact: string;
    riskAssessment: string;
    decisionRule: string;
  };
}

type Direction = 'BUY' | 'SELL';

interface HistoricalAssessment {
  positiveHorizons: number;
  strongHorizons: number;

  validated: boolean;
  stronglyValidated: boolean;

  averageExpectancy: number | null;
  averageProfitFactor: number | null;
  averageWinRate: number | null;
}

/**
 * ------------------------------------------------------------
 * HISTORICAL VALIDATION
 * ------------------------------------------------------------
 *
 * The Backtester already separates BUY and SELL observations.
 *
 * Therefore:
 *
 * BUY:
 *   positive expectancy = favorable
 *
 * SELL:
 *   positive expectancy in backtest.sell = favorable
 *
 * We intentionally do NOT invert the statistics here.
 *
 * The important rule is that the backtester must have
 * constructed sell returns as favorable-to-sell observations.
 */

/**
 * Basic positive edge.
 *
 * Requirements:
 * - enough observations
 * - positive expectancy
 * - profit factor > 1
 * - win rate >= 45%
 */
function hasPositiveEdge(
  statistics: BacktestStatistics
): boolean {
  return (
    statistics.observations >= 50 &&
    statistics.expectancy !== null &&
    statistics.expectancy > 0 &&
    statistics.profitFactor !== null &&
    statistics.profitFactor > 1 &&
    statistics.winRate !== null &&
    statistics.winRate >= 45
  );
}

/**
 * Strong historical evidence.
 *
 * We deliberately require more than simply
 * positive expectancy.
 *
 * Requirements:
 * - >= 100 observations
 * - expectancy >= 0.25%
 * - profit factor >= 1.10
 * - win rate >= 45%
 */
function hasStrongHistoricalEvidence(
  statistics: BacktestStatistics
): boolean {
  return (
    statistics.observations >= 100 &&
    statistics.expectancy !== null &&
    statistics.expectancy >= 0.25 &&
    statistics.profitFactor !== null &&
    statistics.profitFactor >= 1.10 &&
    statistics.winRate !== null &&
    statistics.winRate >= 45
  );
}

function getHistoricalStatistics(
  backtest: BacktestResult,
  direction: Direction
) {
  if (direction === 'BUY') {
    return {
      horizon5d: backtest.buy.horizon5d,
      horizon10d: backtest.buy.horizon10d,
      horizon20d: backtest.buy.horizon20d,
    };
  }

  return {
    horizon5d: backtest.sell.horizon5d,
    horizon10d: backtest.sell.horizon10d,
    horizon20d: backtest.sell.horizon20d,
  };
}

function assessHistoricalEvidence(
  statistics: ReturnType<typeof getHistoricalStatistics>
): HistoricalAssessment {
  const horizons = [
    statistics.horizon5d,
    statistics.horizon10d,
    statistics.horizon20d,
  ];

  const positiveHorizons =
    horizons.filter(
      hasPositiveEdge
    ).length;

  const strongHorizons =
    horizons.filter(
      hasStrongHistoricalEvidence
    ).length;

  const expectancyValues =
    horizons
      .map(
        statistics =>
          statistics.expectancy
      )
      .filter(
        (
          value
        ): value is number =>
          value !== null
      );

  const profitFactorValues =
    horizons
      .map(
        statistics =>
          statistics.profitFactor
      )
      .filter(
        (
          value
        ): value is number =>
          value !== null
      );

  const winRateValues =
    horizons
      .map(
        statistics =>
          statistics.winRate
      )
      .filter(
        (
          value
        ): value is number =>
          value !== null
      );

  return {
    positiveHorizons,

    strongHorizons,

    validated:
      positiveHorizons >= 2,

    stronglyValidated:
      strongHorizons >= 2,

    averageExpectancy:
      expectancyValues.length > 0
        ? expectancyValues.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / expectancyValues.length
        : null,

    averageProfitFactor:
      profitFactorValues.length > 0
        ? profitFactorValues.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / profitFactorValues.length
        : null,

    averageWinRate:
      winRateValues.length > 0
        ? winRateValues.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / winRateValues.length
        : null,
  };
}

function buildCurrentSignalEvidence(
  signal: QuantitativeSignal
) {
  return {
    direction: signal.direction,
    strength: signal.strength,
    score: signal.score,
    maxScore: signal.maxScore,
    normalizedScore: signal.normalizedScore,
    trend: signal.trend,
    momentum: signal.momentum,
    volume: signal.volume,
    volatility: signal.volatility,
    structure: signal.structure,
  };
}

function buildHistoricalEvidence(
  statistics: {
    horizon5d: BacktestStatistics;
    horizon10d: BacktestStatistics;
    horizon20d: BacktestStatistics;
  },
  observations: number
) {
  return {
    horizon5d:
      statistics.horizon5d,

    horizon10d:
      statistics.horizon10d,

    horizon20d:
      statistics.horizon20d,

    observations,
  };
}

function getSignalStrengthScore(
  signal: QuantitativeSignal
): number {
  switch (signal.strength) {
    case 'STRONG':
      return 3;

    case 'MODERATE':
      return 2;

    case 'WEAK':
      return 1;

    case 'NONE':
    default:
      return 0;
  }
}

function countMajorRiskFlags(
  signal: QuantitativeSignal
): number {
  const majorRiskKeywords = [
    'below-average volume',
    'MACD below signal',
    'bearish',
    'negative',
  ];

  return signal.riskFlags.filter(
    flag =>
      majorRiskKeywords.some(
        keyword =>
          flag
            .toLowerCase()
            .includes(
              keyword.toLowerCase()
            )
      )
  ).length;
}

function getRiskAssessment(
  signal: QuantitativeSignal
): string {
  const majorRiskFlags =
    countMajorRiskFlags(signal);

  if (majorRiskFlags >= 2) {
    return 'HIGH';
  }

  if (majorRiskFlags === 1) {
    return 'MODERATE';
  }

  return 'LOW';
}

function calculateConfidence(
  signal: QuantitativeSignal,
  historical: HistoricalAssessment,
  action: DecisionAction
): DecisionConfidence {
  if (action === 'AVOID') {
    if (
      historical.stronglyValidated &&
      getSignalStrengthScore(signal) >= 2
    ) {
      return 'MODERATE';
    }

    return 'LOW';
  }

  if (action === 'WAIT') {
    return 'LOW';
  }

  if (action === 'HOLD') {
    if (
      historical.stronglyValidated &&
      signal.riskFlags.length === 0
    ) {
      return 'MODERATE';
    }

    return 'LOW';
  }

  const riskFlags =
    countMajorRiskFlags(signal);

  if (
    historical.stronglyValidated &&
    riskFlags === 0
  ) {
    return 'HIGH';
  }

  if (
    historical.validated &&
    getSignalStrengthScore(signal) >= 2
  ) {
    return 'MODERATE';
  }

  return 'LOW';
}

/**
 * ------------------------------------------------------------
 * WAIT
 * ------------------------------------------------------------
 */
function makeWaitDecision(
  signal: QuantitativeSignal,
  backtest: BacktestResult,
  position: PositionState | null
): DecisionEvidence {
  const action: DecisionAction =
    position
      ? 'HOLD'
      : 'WAIT';

  const reasons = [
    'The current technical setup does not provide a sufficiently directional signal.',
  ];

  if (position) {
    reasons.push(
      `The position is currently ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`
    );
  }

  const combinedStatistics = {
    horizon5d:
      backtest.combined.horizon5d,

    horizon10d:
      backtest.combined.horizon10d,

    horizon20d:
      backtest.combined.horizon20d,
  };

  return {
    action,

    confidence:
      'LOW',

    summary:
      position
        ? 'The evidence does not currently justify exiting the existing position.'
        : 'There is not enough evidence to initiate a new position.',

    reasons,

    riskFlags:
      signal.riskFlags,

    currentSignal:
      buildCurrentSignalEvidence(
        signal
      ),

    historicalEvidence:
      buildHistoricalEvidence(
        combinedStatistics,
        backtest.totalSignals
      ),

    positionContext:
      position,

    decisionBasis: {
      currentSignal:
        'NON_DIRECTIONAL',

      historicalValidation:
        'NOT_DIRECTIONALLY_APPLIED',

      positionImpact:
        position
          ? 'EXISTING_POSITION'
          : 'NO_POSITION',

      riskAssessment:
        getRiskAssessment(
          signal
        ),

      decisionRule:
        position
          ? 'WAIT_SIGNAL_WITH_POSITION_EQUALS_HOLD'
          : 'WAIT_SIGNAL_WITHOUT_POSITION_EQUALS_WAIT',
    },
  };
}

/**
 * ------------------------------------------------------------
 * NEW POSITION
 * ------------------------------------------------------------
 */
function decideNewPosition(
  signal: QuantitativeSignal,
  historical: HistoricalAssessment
): {
  action: DecisionAction;
  rule: string;
  reasons: string[];
} {
  const strength =
    getSignalStrengthScore(
      signal
    );

  const majorRiskFlags =
    countMajorRiskFlags(
      signal
    );

  /*
   * ----------------------------------------------------------
   * BUY
   * ----------------------------------------------------------
   */
  if (
    signal.direction === 'BUY'
  ) {
    if (
      strength >= 2 &&
      historical.stronglyValidated &&
      majorRiskFlags === 0
    ) {
      return {
        action: 'BUY',

        rule:
          'STRONG_BUY_SIGNAL_WITH_STRONG_HISTORICAL_VALIDATION',

        reasons: [
          'The current BUY signal is sufficiently strong.',
          'Historical BUY outcomes are strongly validated across multiple horizons.',
          'No major technical risk flags are currently present.',
        ],
      };
    }

    if (
      strength >= 2 &&
      historical.validated &&
      majorRiskFlags <= 1
    ) {
      return {
        action: 'BUY',

        rule:
          'BUY_SIGNAL_WITH_VALIDATED_HISTORICAL_EDGE',

        reasons: [
          'The current BUY signal has meaningful strength.',
          'Historical BUY outcomes show a positive edge across multiple horizons.',
        ],
      };
    }

    return {
      action: 'WAIT',

      rule:
        'DIRECTIONAL_BUY_WITHOUT_SUFFICIENT_VALIDATION',

      reasons: [
        'The current signal points upward, but historical evidence does not sufficiently validate the setup.',
      ],
    };
  }

  /*
   * ----------------------------------------------------------
   * SELL
   * ----------------------------------------------------------
   *
   * Without a position we NEVER issue SELL.
   *
   * SELL here means:
   *
   * "Avoid entering a long position."
   */
  if (
    signal.direction === 'SELL'
  ) {
    if (
      strength >= 3 &&
      historical.stronglyValidated
    ) {
      return {
        action: 'AVOID',

        rule:
          'STRONG_SELL_SIGNAL_WITH_STRONG_HISTORICAL_VALIDATION',

        reasons: [
          'The current setup is strongly bearish.',
          'Historical SELL outcomes are strongly validated across multiple horizons.',
          'The evidence strongly supports avoiding a new long position.',
        ],
      };
    }

    if (
      strength >= 2 &&
      historical.validated
    ) {
      return {
        action: 'AVOID',

        rule:
          'SELL_SIGNAL_WITH_VALIDATED_HISTORICAL_EDGE',

        reasons: [
          'The current setup is bearish.',
          'Historical SELL outcomes provide supporting evidence for avoiding a new long position.',
        ],
      };
    }

    return {
      action: 'AVOID',

      rule:
        'BEARISH_SIGNAL_WITHOUT_SUFFICIENT_VALIDATION',

      reasons: [
        'The current signal is not suitable for initiating a long position.',
      ],
    };
  }

  return {
    action: 'WAIT',

    rule:
      'NO_ACTIONABLE_DIRECTION',

    reasons: [
      'The current signal does not provide an actionable setup.',
    ],
  };
}

/**
 * ------------------------------------------------------------
 * EXISTING POSITION
 * ------------------------------------------------------------
 */
function decideExistingPosition(
  signal: QuantitativeSignal,
  historical: HistoricalAssessment,
  position: PositionState
): {
  action: DecisionAction;
  rule: string;
  reasons: string[];
} {
  const strength =
    getSignalStrengthScore(
      signal
    );

  const majorRiskFlags =
    countMajorRiskFlags(
      signal
    );

  /*
   * ----------------------------------------------------------
   * BUY WHILE HOLDING
   * ----------------------------------------------------------
   */
  if (
    signal.direction === 'BUY'
  ) {
    if (
      historical.validated &&
      strength >= 2
    ) {
      return {
        action: 'HOLD',

        rule:
          'EXISTING_POSITION_WITH_VALIDATED_BULLISH_SIGNAL',

        reasons: [
          'The current signal remains bullish enough to continue holding the position.',
          'Historical BUY outcomes provide supporting evidence.',
          `The position is ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`,
        ],
      };
    }

    return {
      action: 'HOLD',

      rule:
        'EXISTING_POSITION_WITHOUT_EXIT_SIGNAL',

      reasons: [
        'The current signal does not provide sufficient evidence to exit the existing position.',
        `The position is ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`,
      ],
    };
  }

  /*
   * ----------------------------------------------------------
   * WAIT WHILE HOLDING
   * ----------------------------------------------------------
   */
  if (
    signal.direction === 'WAIT'
  ) {
    return {
      action: 'HOLD',

      rule:
        'WAIT_SIGNAL_WITH_EXISTING_POSITION',

      reasons: [
        'The current signal is not sufficiently directional to justify an exit.',
        `The position is ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`,
      ],
    };
  }

  /*
   * ----------------------------------------------------------
   * SELL WHILE HOLDING
   * ----------------------------------------------------------
   */

  /*
   * Strongest possible exit condition.
   */
  if (
    strength >= 3 &&
    historical.stronglyValidated
  ) {
    return {
      action: 'SELL',

      rule:
        'STRONG_SELL_SIGNAL_WITH_STRONG_HISTORICAL_VALIDATION',

      reasons: [
        'The current SELL signal is strong.',
        'Historical SELL outcomes provide strong validation across multiple horizons.',
        'The evidence is sufficiently strong to justify exiting the existing position.',
        `The position is ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`,
      ],
    };
  }

  /*
   * Moderate SELL + validated history + risk.
   */
  if (
    strength >= 2 &&
    historical.validated &&
    majorRiskFlags >= 1
  ) {
    return {
      action: 'SELL',

      rule:
        'MODERATE_SELL_SIGNAL_WITH_VALIDATED_HISTORY_AND_RISK',

      reasons: [
        'The current SELL signal has meaningful strength.',
        'Historical SELL outcomes provide positive validation.',
        'Additional technical risk flags strengthen the case for exiting.',
        `The position is ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`,
      ],
    };
  }

  /*
   * Moderate SELL + strong historical evidence.
   */
  if (
    strength >= 2 &&
    historical.stronglyValidated
  ) {
    return {
      action: 'SELL',

      rule:
        'MODERATE_SELL_SIGNAL_WITH_STRONG_HISTORY',

      reasons: [
        'The current SELL signal has meaningful strength.',
        'Historical SELL outcomes are strongly validated across multiple horizons.',
        `The position is ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`,
      ],
    };
  }

  /*
   * Weak / insufficient SELL.
   */
  return {
    action: 'HOLD',

    rule:
      'SELL_SIGNAL_WITHOUT_SUFFICIENT_EXIT_VALIDATION',

    reasons: [
      'The current signal is bearish, but the evidence is not strong enough to justify exiting the existing position.',
      'Historical validation is insufficient for a high-confidence exit.',
      `The position is ${position.unrealizedPnLPercent.toFixed(2)}% from its average purchase price.`,
    ],
  };
}

/**
 * ------------------------------------------------------------
 * PUBLIC DECISION ENGINE
 * ------------------------------------------------------------
 */
export function makeDecision(
  signal: QuantitativeSignal,
  backtest: BacktestResult,
  position: PositionState | null = null
): DecisionEvidence {
  /*
   * WAIT is explicitly non-directional.
   */
  if (
    signal.direction === 'WAIT'
  ) {
    return makeWaitDecision(
      signal,
      backtest,
      position
    );
  }

  const direction =
    signal.direction as Direction;

  const historicalStatistics =
    getHistoricalStatistics(
      backtest,
      direction
    );

  const historical =
    assessHistoricalEvidence(
      historicalStatistics
    );

  /*
   * ----------------------------------------------------------
   * NO POSITION
   * ----------------------------------------------------------
   */
  if (!position) {
    const decision =
      decideNewPosition(
        signal,
        historical
      );

    return {
      action:
        decision.action,

      confidence:
        calculateConfidence(
          signal,
          historical,
          decision.action
        ),

      summary:
        decision.action === 'BUY'
          ? 'The current setup provides sufficient evidence to consider initiating a position.'
          : decision.action === 'AVOID'
            ? 'The current setup does not justify initiating a position.'
            : 'The current setup should be monitored rather than acted upon immediately.',

      reasons:
        decision.reasons,

      riskFlags:
        signal.riskFlags,

      currentSignal:
        buildCurrentSignalEvidence(
          signal
        ),

      historicalEvidence:
        buildHistoricalEvidence(
          historicalStatistics,
          signal.direction === 'BUY'
            ? backtest.buy.horizon5d.observations
            : backtest.sell.horizon5d.observations
        ),

      positionContext:
        null,

      decisionBasis: {
        currentSignal:
          `${signal.direction}_${signal.strength}`,

        historicalValidation:
          historical.stronglyValidated
            ? 'STRONG'
            : historical.validated
              ? 'VALIDATED'
              : 'INSUFFICIENT',

        positionImpact:
          'NO_POSITION',

        riskAssessment:
          getRiskAssessment(
            signal
          ),

        decisionRule:
          decision.rule,
      },
    };
  }

  /*
   * ----------------------------------------------------------
   * EXISTING POSITION
   * ----------------------------------------------------------
   */
  const decision =
    decideExistingPosition(
      signal,
      historical,
      position
    );

  return {
    action:
      decision.action,

    confidence:
      calculateConfidence(
        signal,
        historical,
        decision.action
      ),

    summary:
      decision.action === 'SELL'
        ? 'The evidence is sufficiently bearish to justify exiting the existing position.'
        : 'The evidence does not currently justify exiting the existing position.',

    reasons:
      decision.reasons,

    riskFlags:
      signal.riskFlags,

    currentSignal:
      buildCurrentSignalEvidence(
        signal
      ),

    historicalEvidence:
      buildHistoricalEvidence(
        historicalStatistics,
        signal.direction === 'BUY'
          ? backtest.buy.horizon5d.observations
          : backtest.sell.horizon5d.observations
      ),

    positionContext:
      position,

    decisionBasis: {
      currentSignal:
        `${signal.direction}_${signal.strength}`,

      historicalValidation:
        historical.stronglyValidated
          ? 'STRONG'
          : historical.validated
            ? 'VALIDATED'
            : 'INSUFFICIENT',

      positionImpact:
        `EXISTING_POSITION_${
          position.unrealizedPnLPercent >= 0
            ? 'PROFIT'
            : 'LOSS'
        }`,

      riskAssessment:
        getRiskAssessment(
          signal
        ),

      decisionRule:
        decision.rule,
    },
  };
}