import { getHistoricalMarketData } from '../agent/tools/marketData';
import { parseOHLCVCSV, type OHLCV } from './marketDataReader';
import { calculateTechnicalIndicatorSeries, type TechnicalIndicatorPoint } from './technicalIndicatorSeries';

export interface MarketSnapshot {
  symbol: string;
  source: 'yfinance';
  retrievedAt: string;
  historicalPeriod: string;
  interval: string;
  latestMarketTimestamp: string;
  currentPrice: number;
  candles: OHLCV[];
  indicatorSeries: TechnicalIndicatorPoint[];
  indicators: TechnicalIndicatorPoint;
  week52High: number;
  week52Low: number;
  volumeTrend: 'above_average' | 'below_average' | 'average' | 'unavailable';
  trendState: string;
  support: number | null;
  resistance: number | null;
}

export interface MarketSnapshotFailure {
  symbol: string;
  source: 'yfinance';
  retrievedAt: string;
  error: string;
}

export type MarketSnapshotResult =
  | { success: true; snapshot: MarketSnapshot }
  | { success: false; failure: MarketSnapshotFailure };

const inFlightSnapshots = new Map<string, Promise<MarketSnapshotResult>>();

function getDatasetUrl(symbol: string): string {
  return `${import.meta.env.BASE_URL}data/market_data/${symbol}_OHLCV.csv`;
}

function trendState(point: TechnicalIndicatorPoint): string {
  if (point.sma20 === null || point.sma50 === null || point.sma200 === null) return 'unavailable';
  if (point.close > point.sma20 && point.sma20 > point.sma50 && point.sma50 > point.sma200) return 'bullish';
  if (point.close < point.sma20 && point.sma20 < point.sma50 && point.sma50 < point.sma200) return 'bearish';
  return 'mixed';
}

function volumeTrend(relativeVolume: number | null): MarketSnapshot['volumeTrend'] {
  if (relativeVolume === null) return 'unavailable';
  if (relativeVolume > 1.1) return 'above_average';
  if (relativeVolume < 0.9) return 'below_average';
  return 'average';
}

async function retrieveMarketSnapshot(symbol: string, period: string, interval: string): Promise<MarketSnapshotResult> {
  const retrievedAt = new Date().toISOString();
  const dataResult = await getHistoricalMarketData({ symbol, period, interval });
  if (!dataResult.success) {
    return { success: false, failure: { symbol, source: 'yfinance', retrievedAt, error: dataResult.error || 'Market data unavailable.' } };
  }

  try {
    const response = await fetch(getDatasetUrl(symbol), { cache: 'no-store' });
    if (!response.ok) throw new Error(`OHLCV dataset returned HTTP ${response.status}.`);
    const dataset = parseOHLCVCSV(await response.text(), symbol);
    const candles = dataset.candles;
    const indicators = calculateTechnicalIndicatorSeries(candles);
    const latest = indicators[indicators.length - 1];
    if (!latest) throw new Error('OHLCV dataset contains no usable candles.');
    const trailingYear = candles.slice(-252);
    const week52High = Math.max(...trailingYear.map(candle => candle.high));
    const week52Low = Math.min(...trailingYear.map(candle => candle.low));

    return {
      success: true,
      snapshot: {
        symbol,
        source: 'yfinance',
        retrievedAt,
        historicalPeriod: period,
        interval,
        latestMarketTimestamp: latest.timestamp,
        currentPrice: latest.close,
        candles,
        indicatorSeries: indicators,
        indicators: latest,
        week52High,
        week52Low,
        volumeTrend: volumeTrend(latest.relativeVolume20),
        trendState: trendState(latest),
        support: latest.recentLow20,
        resistance: latest.recentHigh20,
      },
    };
  } catch (error) {
    return {
      success: false,
      failure: {
        symbol,
        source: 'yfinance',
        retrievedAt,
        error: error instanceof Error ? error.message : 'Unable to read yfinance OHLCV data.',
      },
    };
  }
}

/**
 * Retrieves a fresh yfinance dataset for each analysis run. Concurrent callers
 * share the same in-flight request so specialists see identical, sourced values.
 */
export function getMarketSnapshot(symbolInput: string, period = '5y', interval = '1d'): Promise<MarketSnapshotResult> {
  const symbol = symbolInput.trim().toUpperCase();
  if (!/^[A-Z0-9._-]+$/.test(symbol)) {
    return Promise.resolve({
      success: false,
      failure: { symbol, source: 'yfinance', retrievedAt: new Date().toISOString(), error: 'Invalid stock symbol.' },
    });
  }
  const key = `${symbol}:${period}:${interval}`;
  const existing = inFlightSnapshots.get(key);
  if (existing) return existing;
  const request = retrieveMarketSnapshot(symbol, period, interval).finally(() => inFlightSnapshots.delete(key));
  inFlightSnapshots.set(key, request);
  return request;
}

export function formatMarketSnapshotForAgent(result: MarketSnapshotResult): string {
  if (result.success === false) {
    return `CURRENT MARKET DATA: UNAVAILABLE\nSource: yfinance\nRetrieved at: ${result.failure.retrievedAt}\nReason: ${result.failure.error}\nDo not invent current prices or technical values; explicitly mark them unavailable.`;
  }
  const { snapshot } = result;
  const point = snapshot.indicators;
  return `CURRENT MARKET SNAPSHOT (deterministic; LLM knowledge is not market data)
Source: yfinance
Retrieved at: ${snapshot.retrievedAt}
Latest market session: ${snapshot.latestMarketTimestamp}
Symbol: ${snapshot.symbol}
CMP: ${snapshot.currentPrice}
SMA20 / SMA50 / SMA200: ${point.sma20 ?? 'unavailable'} / ${point.sma50 ?? 'unavailable'} / ${point.sma200 ?? 'unavailable'}
RSI(14): ${point.rsi14 ?? 'unavailable'}
MACD / signal / histogram: ${point.macd ?? 'unavailable'} / ${point.macdSignal ?? 'unavailable'} / ${point.macdHistogram ?? 'unavailable'}
Volume trend: ${snapshot.volumeTrend}; relative volume 20: ${point.relativeVolume20 ?? 'unavailable'}
Support / resistance (20-session): ${snapshot.support ?? 'unavailable'} / ${snapshot.resistance ?? 'unavailable'}
52-week high / low: ${snapshot.week52High} / ${snapshot.week52Low}
Trend state: ${snapshot.trendState}
All technical values above are calculated from the retrieved yfinance OHLCV dataset.`;
}
