import { useCallback } from 'react';
import { useMarketStore } from '../store/marketStore';
import type { DecisionEvidence } from '../../core/market/decisionEngine';
import { getMarketSnapshot } from '../../core/market/marketDataService';
import { calculateQuantitativeSignalSeries } from '../../core/market/signalEngine';
import { backtestQuantitativeSignals } from '../../core/market/backtester';
import { calculatePositionState } from '../../core/market/positionState';
import { makeDecision } from '../../core/market/decisionEngine';
import { useCoreStore } from '../store/coreStore';

export interface AnalysisRequest {
  symbol: string;
  quantity?: number;
  averagePrice?: number;
}

export interface AnalysisResponse {
  success: boolean;
  symbol: string;
  latestDate?: string;
  currentPrice?: number;
  decision?: DecisionEvidence;
  error?: string;
}

export function useMarketAnalysis() {
  const { setCurrentAnalysis, setAnalysisLoading, setAnalysisDataLoading } = useMarketStore();
  const { recordRunMarketSnapshot, recordRunAnalysis } = useCoreStore();

  const analyze = useCallback(
    async (request: AnalysisRequest) => {
      setAnalysisDataLoading(request.symbol, true);

      try {
        const snapshotResult = await getMarketSnapshot(request.symbol);
        if (snapshotResult.success === false) {
          recordRunMarketSnapshot({
            source: 'yfinance',
            requestedBy: 'market-analysis-panel',
            symbol: snapshotResult.failure.symbol,
            retrievedAt: snapshotResult.failure.retrievedAt,
            error: snapshotResult.failure.error,
          });

          recordRunAnalysis({
            symbol: request.symbol,
            decision: null,
            error: snapshotResult.failure.error,
          });

          setCurrentAnalysis({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            symbol: request.symbol,
            timestamp: Date.now(),
            decision: null,
            error: snapshotResult.failure.error,
            isLoading: false,
            isLoadingData: false,
          });
          return;
        }

        const { snapshot } = snapshotResult;
        recordRunMarketSnapshot({
          source: 'yfinance',
          requestedBy: 'market-analysis-panel',
          symbol: snapshot.symbol,
          historicalPeriod: snapshot.historicalPeriod,
          interval: snapshot.interval,
          retrievedAt: snapshot.retrievedAt,
          latestMarketTimestamp: snapshot.latestMarketTimestamp,
          currentPrice: snapshot.currentPrice,
          trendState: snapshot.trendState,
          support: snapshot.support,
          resistance: snapshot.resistance,
          week52High: snapshot.week52High,
          week52Low: snapshot.week52Low,
          indicators: {
            close: snapshot.indicators.close,
            sma20: snapshot.indicators.sma20,
            sma50: snapshot.indicators.sma50,
            sma200: snapshot.indicators.sma200,
            rsi14: snapshot.indicators.rsi14,
            macd: snapshot.indicators.macd,
            macdSignal: snapshot.indicators.macdSignal,
            macdHistogram: snapshot.indicators.macdHistogram,
            relativeVolume20: snapshot.indicators.relativeVolume20,
          },
        });

        const signals = calculateQuantitativeSignalSeries(snapshot.indicatorSeries);
        const latestSignal = signals[signals.length - 1];
        if (!latestSignal) throw new Error('No technical signal could be calculated from yfinance data.');
        const backtest = backtestQuantitativeSignals(snapshot.candles, signals, snapshot.symbol);
        const position = request.quantity && request.averagePrice
          ? calculatePositionState({ symbol: snapshot.symbol, quantity: request.quantity, averagePrice: request.averagePrice, currentPrice: snapshot.currentPrice })
          : null;
        const decision = makeDecision(latestSignal, backtest, position);

        recordRunAnalysis({
          symbol: snapshot.symbol,
          decision,
          currentPrice: snapshot.currentPrice,
          latestDate: snapshot.latestMarketTimestamp,
          error: null,
        });

        setCurrentAnalysis({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          symbol: snapshot.symbol,
          timestamp: Date.now(),
          decision,
          currentPrice: snapshot.currentPrice,
          latestDate: snapshot.latestMarketTimestamp,
          error: null,
          isLoading: false,
          isLoadingData: false,
        });
      } catch (error) {
        recordRunAnalysis({
          symbol: request.symbol,
          decision: null,
          error: 'Unable to analyze this symbol.',
        });

        setCurrentAnalysis({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          symbol: request.symbol,
          timestamp: Date.now(),
          decision: null,
          error: 'Unable to analyze this symbol.',
          isLoading: false,
          isLoadingData: false,
        });
      }
    },
    [recordRunAnalysis, recordRunMarketSnapshot, setCurrentAnalysis, setAnalysisLoading, setAnalysisDataLoading]
  );

  return { analyze };
}
