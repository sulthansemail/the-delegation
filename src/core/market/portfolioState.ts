import {
  calculatePositionState,
  type Position,
  type PositionState,
} from './positionState.ts';

export interface Portfolio {
  positions: Position[];
}

export interface PortfolioState {
  positions: PositionState[];

  totalInvestedValue: number;
  totalMarketValue: number;

  totalUnrealizedPnL: number;
  totalUnrealizedPnLPercent: number;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function calculatePortfolioState(
  portfolio: Portfolio
): PortfolioState {
  const positions = portfolio.positions.map(
    calculatePositionState
  );

  const totalInvestedValue = positions.reduce(
    (sum, position) => sum + position.investedValue,
    0
  );

  const totalMarketValue = positions.reduce(
    (sum, position) => sum + position.marketValue,
    0
  );

  const totalUnrealizedPnL =
    totalMarketValue - totalInvestedValue;

  const totalUnrealizedPnLPercent =
    totalInvestedValue === 0
      ? 0
      : (totalUnrealizedPnL / totalInvestedValue) * 100;

  return {
    positions,

    totalInvestedValue: round(totalInvestedValue),
    totalMarketValue: round(totalMarketValue),

    totalUnrealizedPnL: round(totalUnrealizedPnL),
    totalUnrealizedPnLPercent: round(
      totalUnrealizedPnLPercent
    ),
  };
}

export function getPortfolioPosition(
  portfolioState: PortfolioState,
  symbol: string
): PositionState | null {
  const normalizedSymbol = symbol.trim().toUpperCase();

  return (
    portfolioState.positions.find(
      position => position.symbol === normalizedSymbol
    ) ?? null
  );
}