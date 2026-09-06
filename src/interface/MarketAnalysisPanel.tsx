import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { useMarketAnalysis } from '../integration/hooks/useMarketAnalysis';
import { useMarketStore } from '../integration/store/marketStore';
import { useCoreStore } from '../integration/store/coreStore';
import type { DecisionEvidence } from '../core/market/decisionEngine';

const decisionColors: Record<string, string> = {
  BUY: 'text-green-600 bg-green-50',
  HOLD: 'text-blue-600 bg-blue-50',
  WAIT: 'text-yellow-600 bg-yellow-50',
  AVOID: 'text-red-600 bg-red-50',
  SELL: 'text-red-700 bg-red-100',
};

const confidenceColors: Record<string, string> = {
  HIGH: 'text-green-600',
  MODERATE: 'text-blue-600',
  LOW: 'text-yellow-600',
  NONE: 'text-zinc-400',
};

interface PositionInfo {
  quantity: number;
  averagePrice: number;
  investedValue: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export const MarketAnalysisPanel: React.FC = () => {
  const { analyze } = useMarketAnalysis();
  const { currentAnalysis } = useMarketStore();
  const { selectedSymbol, setSelectedSymbol, portfolio } = useCoreStore();
  const [showDetails, setShowDetails] = useState(false);
  const [positionInfo, setPositionInfo] = useState<PositionInfo | null>(null);

  const decision = currentAnalysis?.decision;

  // Calculate position info when analysis updates
  useEffect(() => {
    if (decision?.positionContext && currentAnalysis?.currentPrice) {
      const holding = portfolio.find(
        (h) => h.symbol === selectedSymbol
      );

      if (holding) {
        const marketValue =
          holding.quantity * currentAnalysis.currentPrice;
        const investedValue =
          holding.quantity * holding.averagePrice;
        const unrealizedPnL = marketValue - investedValue;

        setPositionInfo({
          quantity: holding.quantity,
          averagePrice: holding.averagePrice,
          investedValue,
          marketValue,
          unrealizedPnL,
          unrealizedPnLPercent:
            investedValue > 0
              ? (unrealizedPnL / investedValue) * 100
              : 0,
        });
      }
    } else {
      setPositionInfo(null);
    }
  }, [decision, currentAnalysis?.currentPrice, portfolio, selectedSymbol]);

  const handleAnalyze = async () => {
    const holding = portfolio.find(
      (h) => h.symbol === selectedSymbol
    );

    await analyze({
      symbol: selectedSymbol,
      quantity: holding?.quantity,
      averagePrice: holding?.averagePrice,
    });
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
      <div>
        <label className="text-xs font-semibold text-zinc-700 block mb-2">
          Stock Symbol
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={selectedSymbol}
            onChange={(e) =>
              setSelectedSymbol(e.target.value.toUpperCase())
            }
            placeholder="Enter symbol (e.g., BEPL)"
            className="flex-1 px-3 py-2 text-sm border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAnalyze}
            disabled={currentAnalysis?.isLoading || currentAnalysis?.isLoadingData}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 rounded transition-colors flex items-center gap-2"
          >
            {(currentAnalysis?.isLoading || currentAnalysis?.isLoadingData) && (
              <Loader size={14} className="animate-spin" />
            )}
            {currentAnalysis?.isLoadingData ? 'Acquiring data...' : 'Analyze'}
          </button>
        </div>
      </div>

      {currentAnalysis?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-xs text-red-700">
            {currentAnalysis.error}
          </p>
        </div>
      )}

      {decision && (
        <div className="space-y-4">
          {/* Decision Summary */}
          <div className="border border-zinc-200 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500 font-medium">
                  Symbol
                </p>
                <p className="text-sm font-semibold text-zinc-900">
                  {selectedSymbol}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500 font-medium">
                  Decision
                </p>
                <p
                  className={`text-lg font-bold px-2 py-1 rounded inline-block ${decisionColors[decision.action] || 'text-zinc-900'}`}
                >
                  {decision.action}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-zinc-500 font-medium">
                  Current Price
                </p>
                <p className="text-sm font-semibold text-zinc-900">
                  ₹{currentAnalysis?.currentPrice?.toFixed(2) || 'N/A'}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500 font-medium">
                  Confidence
                </p>
                <p
                  className={`text-sm font-semibold ${confidenceColors[decision.confidence] || 'text-zinc-900'}`}
                >
                  {decision.confidence}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500 font-medium">
                  Signal Score
                </p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.normalizedScore.toFixed(
                    2
                  )}{' '}
                  / 10.00
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-zinc-500 font-medium mb-1">
                Summary
              </p>
              <p className="text-sm text-zinc-700">
                {decision.summary}
              </p>
            </div>

            {decision.reasons.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 font-medium mb-1">
                  Reasons
                </p>
                <ul className="text-xs space-y-1">
                  {decision.reasons.map((reason, idx) => (
                    <li
                      key={idx}
                      className="text-zinc-700 flex gap-2"
                    >
                      <span className="text-zinc-400">•</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {decision.riskFlags.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 font-medium mb-1">
                  Risk Flags
                </p>
                <div className="space-y-1">
                  {decision.riskFlags.map((flag, idx) => (
                    <div
                      key={idx}
                      className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded"
                    >
                      ⚠️ {flag}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Position Info */}
          {positionInfo && (
            <div className="border border-zinc-200 rounded-lg p-4 space-y-3">
              <h4 className="text-xs font-semibold text-zinc-900">
                Position Summary
              </h4>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-zinc-500">Quantity</p>
                  <p className="text-sm font-semibold text-zinc-900">
                    {positionInfo.quantity}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">
                    Avg Purchase Price
                  </p>
                  <p className="text-sm font-semibold text-zinc-900">
                    ₹{positionInfo.averagePrice.toFixed(2)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">
                    Current Price
                  </p>
                  <p className="text-sm font-semibold text-zinc-900">
                    ₹
                    {(
                      currentAnalysis?.currentPrice || 0
                    ).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-zinc-500">
                    Invested Value
                  </p>
                  <p className="text-sm font-semibold text-zinc-900">
                    ₹{positionInfo.investedValue.toFixed(2)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">
                    Market Value
                  </p>
                  <p className="text-sm font-semibold text-zinc-900">
                    ₹{positionInfo.marketValue.toFixed(2)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-zinc-500">
                    Unrealized P&L
                  </p>
                  <p
                    className={`text-sm font-semibold ${positionInfo.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    ₹{positionInfo.unrealizedPnL.toFixed(2)} (
                    {positionInfo.unrealizedPnLPercent.toFixed(
                      2
                    )}
                    %)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Technical State */}
          <div className="border border-zinc-200 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-semibold text-zinc-900">
              Technical State
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-zinc-500">Direction</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.direction}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Strength</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.strength}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Trend</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.trend}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Momentum</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.momentum}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Volume</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.volume}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Volatility</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.volatility}
                </p>
              </div>

              <div>
                <p className="text-xs text-zinc-500">Structure</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {decision.currentSignal.structure}
                </p>
              </div>
            </div>
          </div>

          {/* Expandable Details */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-4 py-3 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            <span className="text-sm font-semibold text-zinc-900">
              Technical Details
            </span>
            {showDetails ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>

          {showDetails && (
            <div className="border border-zinc-200 rounded-lg p-4 space-y-4 bg-zinc-50">
              {/* Historical Evidence */}
              <div>
                <h5 className="text-xs font-semibold text-zinc-900 mb-3">
                  Historical Evidence
                </h5>

                <div className="space-y-2 text-xs text-zinc-700">
                  {[
                    {
                      label: '5-Day Statistics',
                      stats:
                        decision.historicalEvidence
                          .horizon5d,
                    },
                    {
                      label: '10-Day Statistics',
                      stats:
                        decision.historicalEvidence
                          .horizon10d,
                    },
                    {
                      label: '20-Day Statistics',
                      stats:
                        decision.historicalEvidence
                          .horizon20d,
                    },
                  ].map((horizon, idx) => (
                    <div key={idx} className="p-2 bg-white rounded">
                      <p className="font-semibold text-zinc-900">
                        {horizon.label}
                      </p>
                      <p>
                        Win Rate:{' '}
                        {horizon.stats.winRate.toFixed(1)}
                        %
                      </p>
                      <p>
                        Profit Factor:{' '}
                        {horizon.stats.profitFactor.toFixed(
                          2
                        )}
                      </p>
                      <p>
                        Expectancy:{' '}
                        {horizon.stats.expectancy.toFixed(
                          2
                        )}
                      </p>
                      <p>
                        Observations:{' '}
                        {
                          decision
                            .historicalEvidence
                            .observations
                        }
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signal Components */}
              <div>
                <h5 className="text-xs font-semibold text-zinc-900 mb-2">
                  Signal Components
                </h5>
                <div className="p-2 bg-white rounded text-xs text-zinc-700 space-y-1">
                  <p>
                    Direction:{' '}
                    <span className="font-semibold">
                      {decision.currentSignal.direction}
                    </span>
                  </p>
                  <p>
                    Strength:{' '}
                    <span className="font-semibold">
                      {decision.currentSignal.strength}
                    </span>
                  </p>
                  <p>
                    Score:{' '}
                    <span className="font-semibold">
                      {decision.currentSignal.score.toFixed(
                        2
                      )}
                      /{decision.currentSignal.maxScore}
                    </span>
                  </p>
                  <p>
                    Normalized:{' '}
                    <span className="font-semibold">
                      {decision.currentSignal.normalizedScore.toFixed(
                        2
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!decision && !currentAnalysis?.error && (
        <div className="text-center py-8">
          {currentAnalysis?.isLoadingData ? (
            <div className="space-y-2">
              <Loader size={20} className="animate-spin mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-400">
                Acquiring market data for {selectedSymbol}...
              </p>
            </div>
          ) : currentAnalysis?.isLoading ? (
            <div className="space-y-2">
              <Loader size={20} className="animate-spin mx-auto text-zinc-400" />
              <p className="text-sm text-zinc-400">
                Analyzing {selectedSymbol}...
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              Select a symbol and click Analyze to view
              market analysis.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
