export interface MarketDataRequest {
  symbol: string;
  period?: string;
  interval?: string;
}

export interface MarketDataResult {
  success: boolean;
  symbol: string;
  file?: string;
  rows?: number;
  firstDate?: string;
  lastDate?: string;
  error?: string;
}

export async function getHistoricalMarketData(
  request: MarketDataRequest
): Promise<MarketDataResult> {
  const symbol = request.symbol.trim().toUpperCase();

  if (!/^[A-Z0-9._-]+$/.test(symbol)) {
    return {
      success: false,
      symbol,
      error: "Invalid stock symbol.",
    };
  }

  const response = await fetch("/api/market-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      symbol,
      period: request.period ?? "5y",
      interval: request.interval ?? "1d",
    }),
  });

  let result: MarketDataResult;

  try {
    result = (await response.json()) as MarketDataResult;
  } catch {
    return {
      success: false,
      symbol,
      error: `Market-data server returned HTTP ${response.status}.`,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      symbol,
      error:
        result.error ??
        `Market-data request failed with HTTP ${response.status}.`,
    };
  }

  return result;
}