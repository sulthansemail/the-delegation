import { calculatePortfolioState } from '../src/core/market/portfolioState.ts';

const portfolio = {
  positions: [
    {
      symbol: 'CASTROLIND',
      quantity: 80,
      averagePrice: 188.78,
      currentPrice: 185.27,
    },
    {
      symbol: 'BEPL',
      quantity: 50,
      averagePrice: 115,
      currentPrice: 121.43,
    },
  ],
};

const result = calculatePortfolioState(portfolio);

console.log(JSON.stringify(result, null, 2));