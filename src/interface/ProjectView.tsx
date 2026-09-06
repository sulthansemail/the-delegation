import { Info, RefreshCcw, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { getAgentSet, getAllAgents } from '../data/agents';
import { calculatePositionState } from '../core/market/positionState';
import { calculateQuantitativeSignalSeries } from '../core/market/signalEngine';
import { backtestQuantitativeSignals } from '../core/market/backtester';
import { makeDecision } from '../core/market/decisionEngine';
import { getMarketSnapshot } from '../core/market/marketDataService';
import { useCoreStore, type PortfolioHolding } from '../integration/store/coreStore';
import { switchActiveRun, listProjects, switchProject, type ProjectSummary } from '../integration/persistence/firestorePersistence';
import { useActiveTeam } from '../integration/store/teamStore';
import { useSceneManager } from '../simulation/SceneContext';
import { USER_COLOR } from '../theme/brand';
import ResetModal from './ResetModal';
import PricingModal from './PricingModal';

export function formatTokens(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

const ProjectView: React.FC = () => {
  const {
    projectId,
    projectName,
    pendingProjectName,
    setPendingProjectName,
    userBrief,
    referenceImages,
    phase,
    currentRunId,
    currentRunNumber,
    runHistory,
    finalOutput,
    setFinalOutputOpen,
    resetProject,
    startNewRun,
    selectedSymbol,
    setSelectedSymbol,
    portfolio,
    addPortfolioHolding,
    updatePortfolioHolding,
    removePortfolioHolding,
  } = useCoreStore();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [draftHolding, setDraftHolding] = useState({ symbol: '', quantity: '', averagePrice: '' });
  const [marketDecision, setMarketDecision] = useState<any>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const [isSwitchingRun, setIsSwitchingRun] = useState(false);
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [isSwitchingProject, setIsSwitchingProject] = useState(false);
  const activeTeam = useActiveTeam();
  const scene = useSceneManager();

  useEffect(() => {
    const normalizedSymbol = selectedSymbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      setMarketDecision(null);
      setMarketError(null);
      return;
    }

    let isActive = true;

    const loadDecision = async () => {
      setIsLoadingMarket(true);
      setMarketError(null);

      try {
        const snapshotResult = await getMarketSnapshot(normalizedSymbol);
        if (snapshotResult.success === false) throw new Error(snapshotResult.failure.error);
        const { snapshot } = snapshotResult;
        const candles = snapshot.candles;
        const indicatorSeries = snapshot.indicatorSeries;
        const signals = calculateQuantitativeSignalSeries(indicatorSeries);
        const backtest = backtestQuantitativeSignals(candles, signals, normalizedSymbol);
        const latestSignal = signals[signals.length - 1];
        const currentPrice = snapshot.currentPrice;

        const matchingHolding = portfolio.find((entry) => entry.symbol === normalizedSymbol);
        const position = matchingHolding && matchingHolding.quantity > 0 && matchingHolding.averagePrice > 0
          ? calculatePositionState({
              symbol: normalizedSymbol,
              quantity: matchingHolding.quantity,
              averagePrice: matchingHolding.averagePrice,
              currentPrice,
            })
          : null;

        const decision = makeDecision(latestSignal, backtest, position);

        if (!isActive) return;

        setMarketDecision({
          symbol: normalizedSymbol,
          currentPrice,
          signal: latestSignal,
          position,
          decision,
          indicators: snapshot.indicators,
          historicalEvidence: decision.historicalEvidence,
          currentTimestamp: snapshot.latestMarketTimestamp,
        });
      } catch (error) {
        if (!isActive) return;
        setMarketDecision(null);
        setMarketError(error instanceof Error ? error.message : 'Unable to load market data.');
      } finally {
        if (isActive) {
          setIsLoadingMarket(false);
        }
      }
    };

    void loadDecision();

    return () => {
      isActive = false;
    };
  }, [selectedSymbol, portfolio]);

  const refreshProjectList = () => {
    void listProjects().then(setProjectList);
  };

  // Keep the project selector in sync with the currently active project.
  useEffect(() => {
    refreshProjectList();
  }, [projectId]);

  const handleAddHolding = () => {
    const symbol = draftHolding.symbol.trim().toUpperCase();
    const quantity = Number(draftHolding.quantity);
    const averagePrice = Number(draftHolding.averagePrice);

    if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averagePrice) || averagePrice <= 0) {
      return;
    }

    addPortfolioHolding({
      symbol,
      quantity,
      averagePrice,
    });

    setDraftHolding({ symbol: '', quantity: '', averagePrice: '' });
  };

  const handleResetConfirm = () => {
    scene?.resetScene();
    resetProject();
    setIsResetModalOpen(false);
  };

  const handleStartNewRun = () => {
    scene?.resetScene();
    startNewRun();
  };

  const handleSwitchRun = async (runId: string) => {
    if (!runId || runId === currentRunId || isSwitchingRun) return;
    setIsSwitchingRun(true);
    try {
      const switched = await switchActiveRun(runId);
      if (switched) {
        scene?.resetScene();
      }
    } finally {
      setIsSwitchingRun(false);
    }
  };

  const handleSwitchProject = async (targetProjectId: string) => {
    if (!targetProjectId || targetProjectId === projectId || isSwitchingProject) return;
    setIsSwitchingProject(true);
    try {
      const switched = await switchProject(targetProjectId);
      if (switched) {
        scene?.resetScene();
      }
    } finally {
      setIsSwitchingProject(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 bg-white/50">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-black text-darkDelegation leading-tight truncate">
            {projectName || 'Project Info'}
          </h2>
          <div className="flex items-center gap-2">
            <div
              className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors border border-transparent"
              style={{
                backgroundColor: phase === 'working' ? USER_COLOR : (phase === 'done' ? '#22c55e' : '#f4f4f5'),
                color: phase === 'idle' ? '#a1a1aa' : 'white',
                borderColor: phase === 'idle' ? '#e4e4e7' : 'transparent'
              }}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${phase === 'working' ? 'bg-white animate-pulse' : 'bg-white opacity-40'}`} />
              {phase === 'idle' ? 'Ready to Start' : phase}
            </div>
          </div>
        </div>

        {/* Only shown before the project exists; the Lead's first brief creates it. */}
        {!projectId && (
          <input
            value={pendingProjectName}
            onChange={(event) => setPendingProjectName(event.target.value)}
            placeholder="Project name (e.g. My BEPL Investment)"
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-zinc-400"
          />
        )}
      </div>

      <div className="h-px bg-zinc-100 w-full mb-6" />

      {/* Minimal project selector — switching does not delete or auto-run anything. */}
      {projectList.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Projects</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <select
            value={projectId || ''}
            onChange={(event) => {
              void handleSwitchProject(event.target.value);
            }}
            disabled={isSwitchingProject}
            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm font-medium text-zinc-700 outline-none"
          >
            {!projectId && <option value="">Select a project...</option>}
            {projectList.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.projectName || 'Untitled Project'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Run status/selector. Chat is project-level and unaffected by the active run. */}
      {runHistory.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Current Run</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
              Run #{currentRunNumber}{isSwitchingRun ? ' (switching...)' : ''}
            </label>
            <select
              value={currentRunId || ''}
              onChange={(event) => {
                void handleSwitchRun(event.target.value);
              }}
              disabled={isSwitchingRun}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm font-medium text-zinc-700 outline-none"
            >
              {runHistory.map((run) => (
                <option key={run.runId} value={run.runId}>
                  Run #{run.runNumber} - {run.status.toUpperCase()} - {new Date(run.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Start New Analysis Run / New Project — independent actions, always available for an open project. */}
      {projectId && (
        <div className="mb-8 w-full space-y-2">
          <button
            onClick={handleStartNewRun}
            disabled={phase === 'working'}
            title={phase === 'working' ? 'Wait for the current analysis to finish.' : undefined}
            className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] group ${phase === 'working'
                ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20'
              }`}
          >
            <Plus size={14} strokeWidth={3} className="transition-transform group-hover:rotate-90 duration-300" />
            <span className="text-[10px] font-black uppercase tracking-widest">Start New Analysis Run</span>
          </button>

          <button
            onClick={() => setIsResetModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] group bg-darkDelegation hover:bg-black text-white shadow-xl shadow-darkDelegation/10"
          >
            <RefreshCcw size={14} strokeWidth={3} className="transition-transform group-hover:rotate-180 duration-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">New Project</span>
          </button>
        </div>
      )}

      {/* Brief */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">User Brief</p>
          <div className="h-px flex-1 bg-zinc-100" />
        </div>
        {userBrief ? (
          <div className="space-y-4">
            <div className="markdown-content text-xs text-zinc-600 leading-relaxed font-medium bg-white/40 p-4 rounded-xl border border-zinc-100/50 max-h-[300px] overflow-y-auto custom-scrollbar">
              <ReactMarkdown>
                {userBrief}
              </ReactMarkdown>
            </div>

            {(activeTeam.outputType === 'image' || activeTeam.outputType === 'video') && referenceImages.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Brief Logic References</p>
                <div className="grid grid-cols-3 gap-2">
                  {referenceImages.map((img, idx) => (
                    <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-zinc-100 shadow-sm bg-zinc-50">
                      <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 italic">No active brief. Talk to the Lead Agent to define your project.</p>
        )}
      </div>

      {phase === 'done' && finalOutput && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Lead Agent Final Report</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50/50 p-4 space-y-4">
            <div className="markdown-content text-xs text-zinc-700 leading-relaxed max-h-[360px] overflow-y-auto custom-scrollbar">
              <ReactMarkdown>{finalOutput}</ReactMarkdown>
            </div>
            <button
              type="button"
              onClick={() => setFinalOutputOpen(true)}
              className="w-full rounded-xl bg-darkDelegation px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-black"
            >
              Open Full Final Output
            </button>
          </div>
        </div>
      )}

      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Portfolio & Market Decision</p>
          <div className="h-px flex-1 bg-zinc-100" />
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-100 bg-white/60 p-4">
          <div className="flex gap-2">
            <input
              value={selectedSymbol}
              onChange={(event) => setSelectedSymbol(event.target.value)}
              placeholder="Symbol e.g. BEPL"
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 outline-none focus:border-zinc-400"
            />
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-3">Portfolio holdings</p>
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_120px_140px_auto] gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                <span>Symbol</span>
                <span>Quantity</span>
                <span>Avg. price</span>
                <span />
              </div>

              {portfolio.length === 0 ? (
                <p className="text-xs text-zinc-400 italic">No holdings yet.</p>
              ) : (
                portfolio.map((holding: PortfolioHolding) => (
                  <div key={holding.id} className="grid grid-cols-[1fr_120px_140px_auto] gap-2 items-center">
                    <input
                      value={holding.symbol}
                      onChange={(event) => updatePortfolioHolding(holding.id, { symbol: event.target.value })}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-700 outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={holding.quantity}
                      onChange={(event) => updatePortfolioHolding(holding.id, { quantity: Number(event.target.value) })}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-700 outline-none"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={holding.averagePrice}
                      onChange={(event) => updatePortfolioHolding(holding.id, { averagePrice: Number(event.target.value) })}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-700 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removePortfolioHolding(holding.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
                      aria-label={`Remove ${holding.symbol}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}

              <div className="grid grid-cols-[1fr_120px_140px_auto] gap-2 items-center pt-2">
                <input
                  value={draftHolding.symbol}
                  onChange={(event) => setDraftHolding((previous) => ({ ...previous, symbol: event.target.value }))}
                  placeholder="SYMBOL"
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-700 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draftHolding.quantity}
                  onChange={(event) => setDraftHolding((previous) => ({ ...previous, quantity: event.target.value }))}
                  placeholder="Qty"
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-700 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftHolding.averagePrice}
                  onChange={(event) => setDraftHolding((previous) => ({ ...previous, averagePrice: event.target.value }))}
                  placeholder="Avg price"
                  className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm font-medium text-zinc-700 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddHolding}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-darkDelegation text-white hover:bg-black"
                  aria-label="Add holding"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          {isLoadingMarket && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500">
              Loading current signal and decision...
            </div>
          )}

          {marketError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {marketError}
            </div>
          )}

          {marketDecision && (
            <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Decision</p>
                  <p className="text-2xl font-black text-darkDelegation">{marketDecision.decision.action}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Confidence</p>
                  <p className="text-lg font-black text-darkDelegation">{marketDecision.decision.confidence}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-zinc-600">
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Symbol:</span> {marketDecision.symbol}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Current price:</span> {marketDecision.currentPrice.toFixed(2)}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Signal direction:</span> {marketDecision.signal.direction}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Signal strength:</span> {marketDecision.signal.strength}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Signal score:</span> {marketDecision.signal.score}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Trend:</span> {marketDecision.signal.trend}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Momentum:</span> {marketDecision.signal.momentum}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Volume:</span> {marketDecision.signal.volume}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Volatility:</span> {marketDecision.signal.volatility}</div>
                <div><span className="font-black uppercase tracking-widest text-zinc-400">Structure:</span> {marketDecision.signal.structure}</div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Position</p>
                {marketDecision.position ? (
                  <div className="grid grid-cols-2 gap-3 text-xs text-zinc-600">
                    <div><span className="font-black uppercase tracking-widest text-zinc-400">Quantity:</span> {marketDecision.position.quantity}</div>
                    <div><span className="font-black uppercase tracking-widest text-zinc-400">Average price:</span> {marketDecision.position.averagePrice.toFixed(2)}</div>
                    <div><span className="font-black uppercase tracking-widest text-zinc-400">P&L:</span> {marketDecision.position.unrealizedPnL.toFixed(2)}</div>
                    <div><span className="font-black uppercase tracking-widest text-zinc-400">P&L %:</span> {marketDecision.position.unrealizedPnLPercent.toFixed(2)}%</div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">No position in portfolio for this symbol.</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Summary</p>
                <p className="text-sm font-medium text-zinc-700">{marketDecision.decision.summary}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Reasons</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                  {marketDecision.decision.reasons.map((reason: string, index: number) => (
                    <li key={`${reason}-${index}`}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Risk flags</p>
                <div className="flex flex-wrap gap-2">
                  {marketDecision.decision.riskFlags.length > 0 ? marketDecision.decision.riskFlags.map((flag: string, index: number) => (
                    <span key={`${flag}-${index}`} className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">{flag}</span>
                  )) : (
                    <span className="text-xs text-zinc-500">No major risk flags.</span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Historical evidence</p>
                <div className="grid grid-cols-3 gap-2 text-[11px] text-zinc-700">
                  <div className="rounded-lg bg-white p-2 border border-zinc-100">
                    <div className="font-black uppercase tracking-widest text-zinc-400">5d</div>
                    <div>obs: {marketDecision.decision.historicalEvidence.horizon5d.observations}</div>
                    <div>exp: {marketDecision.decision.historicalEvidence.horizon5d.expectancy?.toFixed(3) ?? 'n/a'}</div>
                    <div>w/r: {marketDecision.decision.historicalEvidence.horizon5d.winRate?.toFixed(1) ?? 'n/a'}%</div>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-zinc-100">
                    <div className="font-black uppercase tracking-widest text-zinc-400">10d</div>
                    <div>obs: {marketDecision.decision.historicalEvidence.horizon10d.observations}</div>
                    <div>exp: {marketDecision.decision.historicalEvidence.horizon10d.expectancy?.toFixed(3) ?? 'n/a'}</div>
                    <div>w/r: {marketDecision.decision.historicalEvidence.horizon10d.winRate?.toFixed(1) ?? 'n/a'}%</div>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-zinc-100">
                    <div className="font-black uppercase tracking-widest text-zinc-400">20d</div>
                    <div>obs: {marketDecision.decision.historicalEvidence.horizon20d.observations}</div>
                    <div>exp: {marketDecision.decision.historicalEvidence.horizon20d.expectancy?.toFixed(3) ?? 'n/a'}</div>
                    <div>w/r: {marketDecision.decision.historicalEvidence.horizon20d.winRate?.toFixed(1) ?? 'n/a'}%</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Token Usage */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Token Usage</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <button
            onClick={() => setIsPricingModalOpen(true)}
            className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 hover:border-emerald-200 rounded-lg transition-all active:scale-95 group ml-4 cursor-pointer"
          >
            <span className="text-[10px] font-black uppercase tracking-tight text-emerald-600">
              Total Est. ${useCoreStore.getState().totalEstimatedCost.toFixed(3)}
            </span>
            <Info size={11} className="text-emerald-500 group-hover:text-emerald-600" />
          </button>
        </div>

        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-6">
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-4xl font-mono font-black text-darkDelegation tracking-tighter">
              {formatTokens(useCoreStore.getState().totalTokenUsage.totalTokens)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold font-mono">
            <span className="text-zinc-700">{formatTokens(useCoreStore.getState().totalTokenUsage.promptTokens)} <span className="text-zinc-400 font-medium">input</span></span>
            <span className="text-zinc-300">+</span>
            <span className="text-zinc-700">{formatTokens(useCoreStore.getState().totalTokenUsage.completionTokens)} <span className="text-zinc-400 font-medium">output</span></span>
          </div>
        </div>

        <div className="space-y-1">
          {Object.entries(useCoreStore.getState().agentTokenUsage)
            .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
            .map(([idx, usage]) => {
              const agentIndex = parseInt(idx);
              const agents = getAllAgents(activeTeam);
              const agent = agentIndex === -1
                ? { name: 'System', color: '#71717a' }
                : agents.find(a => a.index === agentIndex);

              if (!agent || usage.totalTokens === 0) return null;

              return (
                <div key={idx} className="flex items-center justify-between py-2 px-2 hover:bg-zinc-100/50 rounded-lg transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]" style={{ backgroundColor: agent.color }} />
                    <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-tight group-hover:text-darkDelegation transition-colors">
                      {agent.name}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      {useCoreStore.getState().agentEstimatedCost[agentIndex] > 0 && (
                        <span className="text-[9px] font-mono font-bold text-emerald-600/70">
                          ${useCoreStore.getState().agentEstimatedCost[agentIndex].toFixed(4)}
                        </span>
                      )}
                      <span className="text-[11px] font-mono font-black text-darkDelegation">
                        {formatTokens(usage.totalTokens)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-bold font-mono text-zinc-400">
                      <span>{formatTokens(usage.promptTokens)} <span className="font-medium opacity-60">input</span></span>
                      <span className="text-zinc-200">+</span>
                      <span>{formatTokens(usage.completionTokens)} <span className="font-medium opacity-60">output</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <ResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetConfirm}
      />

      {isPricingModalOpen && (
        <PricingModal onClose={() => setIsPricingModalOpen(false)} />
      )}
    </div>
  );
};

export default ProjectView;
