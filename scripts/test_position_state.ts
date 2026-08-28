import { calculatePositionState } from '../src/core/market/positionState.ts';

const position = {
  symbol: 'CASTROLIND',
  quantity: 80,
  averagePrice: 188.78,
  currentPrice: 185.27,
};

const result = calculatePositionState(position);

console.log(JSON.stringify(result, null, 2));