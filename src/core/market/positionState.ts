export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  openedAt?: string;
}

export interface PositionState {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;

  investedValue: number;
  marketValue: number;

  unrealizedPnL: number;
  unrealizedPnLPercent: number;

  openedAt?: string;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

export function calculatePositionState(
  position: Position
): PositionState {
  const symbol = position.symbol.trim().toUpperCase();

  if (!symbol) {
    throw new Error('Position symbol is required.');
  }

  if (!Number.isFinite(position.quantity) || position.quantity <= 0) {
    throw new Error('Position quantity must be greater than zero.');
  }

  if (!Number.isFinite(position.averagePrice) || position.averagePrice <= 0) {
    throw new Error('Average purchase price must be greater than zero.');
  }

  if (!Number.isFinite(position.currentPrice) || position.currentPrice < 0) {
    throw new Error('Current price must be zero or greater.');
  }

  const investedValue =
    position.quantity * position.averagePrice;

  const marketValue =
    position.quantity * position.currentPrice;

  const unrealizedPnL =
    marketValue - investedValue;

  const unrealizedPnLPercent =
    investedValue === 0
      ? 0
      : (unrealizedPnL / investedValue) * 100;

  return {
    symbol,
    quantity: position.quantity,
    averagePrice: round(position.averagePrice),
    currentPrice: round(position.currentPrice),

    investedValue: round(investedValue),
    marketValue: round(marketValue),

    unrealizedPnL: round(unrealizedPnL),
    unrealizedPnLPercent: round(unrealizedPnLPercent),

    openedAt: position.openedAt,
  };
}