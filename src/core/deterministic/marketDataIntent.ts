export interface MarketDataIntent {
  symbol: string;
  period: string;
  interval: string;
}

const PERIODS = [
  '1mo',
  '3mo',
  '6mo',
  '1y',
  '2y',
  '5y',
  '10y',
  'max',
] as const;

function extractPeriod(text: string): string {
  const match = text.match(
    /\b(1mo|3mo|6mo|1y|2y|5y|10y|max)\b/i
  );

  return match ? match[1].toLowerCase() : '5y';
}

function extractInterval(text: string): string {
  if (/\b(weekly|week|1wk)\b/i.test(text)) {
    return '1wk';
  }

  if (/\b(monthly|month|1mo)\b/i.test(text)) {
    return '1mo';
  }

  return '1d';
}

export function getMarketDataIntent(
  input: string
): MarketDataIntent | null {
  const text = input.trim();

  if (!text) return null;

  const isMarketDataRequest =
    /\b(historical|history|historical data|ohlcv|price data|candles|candlestick|market data|stock data)\b/i.test(
      text
    );

  if (!isMarketDataRequest) {
    return null;
  }

  // Explicitly look for an NSE-style stock symbol.
  // We deliberately require a capitalized token so normal
  // prose does not accidentally trigger the downloader.
  const symbolMatch = text.match(
    /\b[A-Z][A-Z0-9.-]{1,14}\b/
  );

  if (!symbolMatch) {
    return null;
  }

  const symbol = symbolMatch[0].toUpperCase();

  const period = extractPeriod(text);
  const interval = extractInterval(text);

  if (!PERIODS.includes(period as any)) {
    return null;
  }

  return {
    symbol,
    period,
    interval,
  };
}