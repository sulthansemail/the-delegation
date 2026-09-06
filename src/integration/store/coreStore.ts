import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { LLMMessage, LLMTokenUsage, LLMToolCall, LLMToolDefinition } from '../../core/llm/types';
import { ResearchArtifacts } from '../../core/agent/researchTypes';
import { DEFAULT_MODELS, AVAILABLE_MODELS } from '../../core/llm/constants';
import { calculateCost } from '../../core/llm/pricing';
import { useTeamStore } from './teamStore';
import { useUiStore } from './uiStore';
import { useMarketStore } from './marketStore';
import { AgentState } from '../../types';

export type TaskStatus = 'scheduled' | 'on_hold' | 'in_progress' | 'done'

export interface TaskRevision {
  output: string
  feedback?: string
  artifacts?: ResearchArtifacts
  timestamp: number
}

export interface Task {
  id: string
  title: string
  description: string
  assignedAgentId: number
  status: TaskStatus
  parentTaskId?: string
  requiresUserApproval: boolean,
  draftOutput?: string,
  draftArtifacts?: ResearchArtifacts,
  reviewComments?: string,
  output?: string,
  artifacts?: ResearchArtifacts,
  revisions: TaskRevision[]
  createdAt: number
  updatedAt: number
}

export interface PortfolioHolding {
  id: string
  symbol: string
  quantity: number
  averagePrice: number
}

export interface ActionLogEntry {
  id: string
  timestamp: number
  agentIndex: number
  action: string
  taskId?: string
}

export type ActivityEventStatus =
  | 'received_brief'
  | 'reviewing_brief'
  | 'planning'
  | 'delegating'
  | 'started_task'
  | 'researching'
  | 'completed_task'
  | 'reviewing_result'
  | 'synthesizing'
  | 'failed'
  | 'system';

export interface ActivityLogEvent {
  id: string
  timestamp: number
  agentIndex: number
  agentName: string
  event: ActivityEventStatus
  message: string
  taskId?: string
}

export interface DebugLogEntryBase {
  id: string
  timestamp: number
  agentIndex: number
  agentName: string
  status: 'pending' | 'completed' | 'error'
  taskId?: string
}

export interface RequestDebugLogEntry extends DebugLogEntryBase {
  phase: 'request'
  systemInstruction?: string
  contents: any[]
  systemTools?: any[]
}

export interface ResponseDebugLogEntry extends DebugLogEntryBase {
  phase: 'response'
  content: string | null
  tool_calls?: LLMToolCall[]
  usage?: LLMTokenUsage
  raw?: any
}

export type DebugLogEntry = RequestDebugLogEntry | ResponseDebugLogEntry;

export type ProjectPhase = 'idle' | 'working' | 'done'

export interface RunSummary {
  runId: string
  runNumber: number
  status: ProjectPhase
  createdAt: number
  updatedAt: number
  completedAt: number | null
  symbol: string
}

export interface RunMarketSnapshotRecord {
  id: string
  runId: string
  capturedAt: number
  source: 'yfinance'
  requestedBy: string
  symbol: string
  historicalPeriod?: string
  interval?: string
  retrievedAt: string
  latestMarketTimestamp?: string
  currentPrice?: number
  trendState?: string
  support?: number | null
  resistance?: number | null
  week52High?: number
  week52Low?: number
  indicators?: Record<string, any>
  error?: string
}

export interface RunAnalysisRecord {
  id: string
  runId: string
  symbol: string
  timestamp: number
  decision: any | null
  currentPrice?: number
  latestDate?: string
  error: string | null
}

interface CoreState {
  // ── Project ──────────────────────────────────────────────────
  projectId: string | null
  projectName: string | null
  pendingProjectName: string
  projectTeamId: string | null
  projectCreatedAt: number | null
  projectUpdatedAt: number | null
  userBrief: string
  referenceImages: string[]
  phase: ProjectPhase
  currentRunId: string | null
  currentRunNumber: number
  currentRunCreatedAt: number | null
  currentRunUpdatedAt: number | null
  currentRunCompletedAt: number | null
  runHistory: RunSummary[]
  runMarketSnapshots: RunMarketSnapshotRecord[]
  runAnalyses: RunAnalysisRecord[]
  /**
   * Set synchronously before the lead starts final synthesis.  `phase === 'done'`
   * represents a delivered project; this flag covers the interval before delivery.
   */
  completionInProgress: boolean
  finalOutput: string | null
  finalOutputArtifacts: ResearchArtifacts | null
  availableModels: string[]
  totalTokenUsage: LLMTokenUsage
  agentTokenUsage: Record<number, LLMTokenUsage>
  totalEstimatedCost: number
  agentEstimatedCost: Record<number, number>
  finalAssetType: 'text' | 'image' | 'audio' | 'video'
  finalAssetContent: string | null
  isGeneratingAsset: boolean
  
  // ── Output Review ────────────────────────────────────────────
  isReviewingOutput: boolean
  pendingOutputPrompt: string
  pendingOutputParams: any

  // ── Tasks ────────────────────────────────────────────────────
  tasks: Task[]

  // ── Log ──────────────────────────────────────────────────────
  actionLog: ActionLogEntry[]
  activityLog: ActivityLogEvent[]
  debugLog: DebugLogEntry[]

  // ── Conversation histories (Agnostic standard) ───────────────
  agentHistories: Record<number, LLMMessage[]>
  agentSummaries: Record<number, string>
  boardroomHistories: Record<string, LLMMessage[]>
  agentExecutionStates: Record<number, AgentState>

  // ── UI ───────────────────────────────────────────────────────
  isKanbanOpen: boolean
  viewMode: 'simulation' | 'design';
  isLogOpen: boolean
  isFinalOutputOpen: boolean;
  logFilterAgentIndex: number | null;
  isResizing: boolean;
  selectedSymbol: string
  portfolio: PortfolioHolding[]

  // ── Actions — Project —————————————————————————————————────────
  setUserBrief: (brief: string) => void;
  addReferenceImage: (base64: string) => void;
  removeReferenceImage: (index: number) => void;
  clearReferenceImages: () => void;
  setPhase: (phase: ProjectPhase) => void;
  setCompletionInProgress: (inProgress: boolean) => void;
  setPendingProjectName: (name: string) => void;
  startProject: (brief: string) => void;
  startNewRun: () => void;
  setFinalOutput: (output: string, artifacts?: ResearchArtifacts | null) => void;
  setFinalAsset: (type: 'image' | 'audio' | 'video', content: string) => void;
  setIsGeneratingAsset: (isGenerating: boolean) => void;
  setReviewingOutput: (val: boolean) => void;
  setPendingOutputPrompt: (prompt: string) => void;
  setPendingOutputParams: (params: any) => void;
  recordRunMarketSnapshot: (entry: Omit<RunMarketSnapshotRecord, 'id' | 'capturedAt' | 'runId'>) => void;
  recordRunAnalysis: (entry: Omit<RunAnalysisRecord, 'id' | 'runId' | 'timestamp'>) => void;

  // ── Actions — Tasks ───────────────────────────────────────────
  addTask: (task: Omit<Task, 'id' | 'revisions' | 'createdAt' | 'updatedAt'>) => Task;
  removeTask: (taskId: string) => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  submitTaskForReview: (taskId: string, draftOutput?: string, draftArtifacts?: ResearchArtifacts) => void;
  setTaskOutput: (taskId: string, output: string, artifacts?: ResearchArtifacts) => void;
  approveTask: (taskId: string) => void;
  rejectTask: (taskId: string, comments: string) => void;

  // ── Actions — Log ─────────────────────────────────────────────
  addLogEntry: (entry: Omit<ActionLogEntry, 'id' | 'timestamp'>) => void;
  addActivityEvent: (entry: Omit<ActivityLogEvent, 'id' | 'timestamp'>) => void;
  addRequestLog: (entry: Omit<RequestDebugLogEntry, 'id' | 'timestamp' | 'phase' | 'status'>) => void;
  addResponseLog: (entry: Omit<ResponseDebugLogEntry, 'id' | 'timestamp' | 'phase' | 'status'>) => void;

  // ── Actions — History ───────────────────────────────────────
  appendAgentHistory: (agentIndex: number, role: 'user' | 'assistant', parts: any[]) => void;
  setAgentSummary: (agentIndex: number, summary: string) => void;
  appendBoardroomHistory: (taskId: string, role: 'user' | 'assistant', parts: any[]) => void;
  clearAllHistories: () => void;

  // ── Actions — UI ──────────────────────────────────────────────
  setKanbanOpen: (open: boolean) => void;
  setLogOpen: (open: boolean, filterAgent?: number | null) => void;
  setFinalOutputOpen: (open: boolean) => void;
  setIsResizing: (isResizing: boolean) => void;
  setSelectedSymbol: (symbol: string) => void;
  addPortfolioHolding: (holding: Omit<PortfolioHolding, 'id'>) => void;
  updatePortfolioHolding: (id: string, holding: Partial<Omit<PortfolioHolding, 'id'>>) => void;
  removePortfolioHolding: (id: string) => void;
  resetProject: () => void;
  setViewMode: (mode: 'simulation' | 'design') => void;

  // ── Simulation Sync ──────────────────────────────────────────
  setAgentHistory: (agentIndex: number, history: LLMMessage[]) => void;
  setAgentExecutionState: (agentIndex: number, state: AgentState) => void;
}

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

export const useCoreStore = create<CoreState>()(
  persist(
    (set) => ({
      projectId: null,
      projectName: null,
      pendingProjectName: '',
      projectTeamId: null,
      projectCreatedAt: null,
      projectUpdatedAt: null,
      userBrief: '',
      referenceImages: [],
      phase: 'idle',
      currentRunId: null,
      currentRunNumber: 0,
      currentRunCreatedAt: null,
      currentRunUpdatedAt: null,
      currentRunCompletedAt: null,
      runHistory: [],
      runMarketSnapshots: [],
      runAnalyses: [],
      completionInProgress: false,
      finalOutput: null,
      finalOutputArtifacts: null,
      availableModels: [...AVAILABLE_MODELS.text],
      totalTokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      agentTokenUsage: {},
      totalEstimatedCost: 0,
      agentEstimatedCost: {},
      finalAssetType: 'text',
      finalAssetContent: null,
      isGeneratingAsset: false,
      isReviewingOutput: false,
      pendingOutputPrompt: '',
      pendingOutputParams: {},
      tasks: [],
      actionLog: [],
      activityLog: [],
      debugLog: [],
      agentHistories: {},
      agentSummaries: {},
      boardroomHistories: {},
      agentExecutionStates: {},
      isKanbanOpen: true,
      isLogOpen: true,
      isFinalOutputOpen: false,
      logFilterAgentIndex: null,
      isResizing: false,
      viewMode: 'simulation',
      selectedSymbol: 'BEPL',
      portfolio: [],

      setViewMode: (viewMode) => set({ viewMode }),
      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol.trim().toUpperCase() || 'BEPL', currentRunUpdatedAt: Date.now(), projectUpdatedAt: Date.now() }),
      addPortfolioHolding: (holding) => set((s) => ({
        portfolio: [
          ...s.portfolio,
          {
            ...holding,
            symbol: holding.symbol.trim().toUpperCase(),
            id: uid(),
          },
        ],
        currentRunUpdatedAt: Date.now(),
        projectUpdatedAt: Date.now(),
      })),
      updatePortfolioHolding: (id, holding) => set((s) => ({
        portfolio: s.portfolio.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...holding,
                ...(holding.symbol ? { symbol: holding.symbol.trim().toUpperCase() } : {}),
              }
            : entry
        ),
        currentRunUpdatedAt: Date.now(),
        projectUpdatedAt: Date.now(),
      })),
      removePortfolioHolding: (id) => set((s) => ({
        portfolio: s.portfolio.filter((entry) => entry.id !== id),
        currentRunUpdatedAt: Date.now(),
        projectUpdatedAt: Date.now(),
      })),

      resetProject: () => set({
        projectId: null,
        projectName: null,
        pendingProjectName: '',
        projectTeamId: null,
        projectCreatedAt: null,
        projectUpdatedAt: null,
        userBrief: '',
        phase: 'idle',
        currentRunId: null,
        currentRunNumber: 0,
        currentRunCreatedAt: null,
        currentRunUpdatedAt: null,
        currentRunCompletedAt: null,
        runHistory: [],
        runMarketSnapshots: [],
        runAnalyses: [],
        completionInProgress: false,
        finalOutput: null,
        finalOutputArtifacts: null,
        tasks: [],
        actionLog: [],
        activityLog: [],
        debugLog: [],
        agentHistories: {},
        agentSummaries: {},
        boardroomHistories: {},
        agentExecutionStates: {},
        isFinalOutputOpen: false,
        totalTokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        agentTokenUsage: {},
        totalEstimatedCost: 0,
        agentEstimatedCost: {},
        finalAssetType: 'text',
        finalAssetContent: null,
        isGeneratingAsset: false,
        isReviewingOutput: false,
        pendingOutputPrompt: '',
        pendingOutputParams: {},
        referenceImages: [],
      }),

      setUserBrief: (brief) => set({ userBrief: brief, projectUpdatedAt: Date.now() }),
      addReferenceImage: (base64) => set((s) => ({ 
        referenceImages: [...s.referenceImages, base64].slice(0, 3),
        projectUpdatedAt: Date.now(),
      })),
      removeReferenceImage: (index) => set((s) => ({ 
        referenceImages: s.referenceImages.filter((_, i) => i !== index),
        projectUpdatedAt: Date.now(),
      })),
      clearReferenceImages: () => set({ referenceImages: [], projectUpdatedAt: Date.now() }),
      setPhase: (phase) =>
        set((s) => {
          const now = Date.now();
          const completedAt = phase === 'done' ? now : null;
          const runHistory = s.currentRunId
            ? s.runHistory.map((run) =>
                run.runId === s.currentRunId
                  ? {
                      ...run,
                      status: phase,
                      updatedAt: now,
                      completedAt,
                    }
                  : run
              )
            : s.runHistory;

          return {
            phase,
            currentRunUpdatedAt: now,
            currentRunCompletedAt: completedAt,
            runHistory,
            projectUpdatedAt: now,
          };
        }),
      setCompletionInProgress: (completionInProgress) => set({ completionInProgress }),
      setPendingProjectName: (name) => set({ pendingProjectName: name }),
      startProject: (brief) => {
        const now = Date.now();
        const projectId = `project_${uid()}`;
        const runId = `run_${uid()}`;
        set((s) => ({
          projectId,
          projectName: s.pendingProjectName.trim() || brief.trim().split(/\r?\n/)[0]?.slice(0, 80) || 'Untitled Project',
          pendingProjectName: '',
          projectTeamId: useTeamStore.getState().selectedAgentSetId,
          projectCreatedAt: now,
          projectUpdatedAt: now,
          userBrief: brief,
          phase: 'working',
          currentRunId: runId,
          currentRunNumber: 1,
          currentRunCreatedAt: now,
          currentRunUpdatedAt: now,
          currentRunCompletedAt: null,
          runHistory: [{
            runId,
            runNumber: 1,
            status: 'working',
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            symbol: 'BEPL',
          }],
          runMarketSnapshots: [],
          runAnalyses: [],
          completionInProgress: false,
          finalAssetType: 'text',
          finalAssetContent: null,
          finalOutput: null,
          finalOutputArtifacts: null,
        }));
      },
      startNewRun: () => {
        set((s) => {
          const now = Date.now();
          const nextRunId = `run_${uid()}`;
          const nextRunNumber = s.currentRunNumber + 1;

          return {
            userBrief: '',
            phase: 'idle',
            currentRunId: nextRunId,
            currentRunNumber: nextRunNumber,
            currentRunCreatedAt: now,
            currentRunUpdatedAt: now,
            currentRunCompletedAt: null,
            runHistory: [
              ...s.runHistory,
              {
                runId: nextRunId,
                runNumber: nextRunNumber,
                status: 'idle',
                createdAt: now,
                updatedAt: now,
                completedAt: null,
                symbol: s.selectedSymbol,
              },
            ],
            runMarketSnapshots: [],
            runAnalyses: [],
            completionInProgress: false,
            finalOutput: null,
            finalOutputArtifacts: null,
            finalAssetType: 'text',
            finalAssetContent: null,
            isGeneratingAsset: false,
            isReviewingOutput: false,
            pendingOutputPrompt: '',
            pendingOutputParams: {},
            tasks: [],
            actionLog: [],
            activityLog: [],
            debugLog: [],
            agentExecutionStates: {},
            projectUpdatedAt: now,
          };
        });

        // Run-scoped market analysis must not bleed into a new run.
        useMarketStore.getState().clearAnalysis();
      },
      setFinalOutput: (output, artifacts = null) => set({ finalOutput: output, finalOutputArtifacts: artifacts, currentRunUpdatedAt: Date.now(), projectUpdatedAt: Date.now() }),
      setFinalAsset: (type, content) => set({ finalAssetType: type, finalAssetContent: content, isGeneratingAsset: false }),
      setIsGeneratingAsset: (isGenerating) => set({ isGeneratingAsset: isGenerating }),
      setReviewingOutput: (val) => set({ isReviewingOutput: val }),
      setPendingOutputPrompt: (prompt) => set({ pendingOutputPrompt: prompt }),
      setPendingOutputParams: (params) => set({ pendingOutputParams: params }),
      recordRunMarketSnapshot: (entry) =>
        set((s) => {
          if (!s.currentRunId) return {};
          const latest = s.runMarketSnapshots[s.runMarketSnapshots.length - 1];
          const shouldSkip = latest
            && latest.symbol === entry.symbol
            && latest.retrievedAt === entry.retrievedAt
            && latest.requestedBy === entry.requestedBy
            && latest.error === entry.error;
          if (shouldSkip) return {};

          return {
            runMarketSnapshots: [
              ...s.runMarketSnapshots,
              {
                ...entry,
                id: `snapshot_${uid()}`,
                runId: s.currentRunId,
                capturedAt: Date.now(),
              },
            ],
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        }),
      recordRunAnalysis: (entry) =>
        set((s) => {
          if (!s.currentRunId) return {};
          return {
            runAnalyses: [
              ...s.runAnalyses,
              {
                ...entry,
                id: `analysis_${uid()}`,
                runId: s.currentRunId,
                timestamp: Date.now(),
              },
            ],
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        }),

      addTask: (task) => {
        const newTask: Task = {
          ...task,
          id: `task_${uid()}`,
          revisions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({ tasks: [...s.tasks, newTask], currentRunUpdatedAt: Date.now(), projectUpdatedAt: Date.now() }))
        return newTask
      },

      removeTask: (taskId) =>
        set((s) => {
          const newTasks = s.tasks.filter((t) => t.id !== taskId);

          // Logic to check if removing this task finishes the project
          const hasRemainingTasks = newTasks.some(t => t.status !== 'done');
          const isWorking = s.phase === 'working';

          let nextPhase = s.phase;
          if (isWorking && !hasRemainingTasks) {
            nextPhase = 'done';
          }

          return {
            tasks: newTasks,
            phase: nextPhase,
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        }),

      updateTaskStatus: (taskId, status) =>
        set((s) => {
          const task = s.tasks.find((t) => t.id === taskId);
          if (!task) return {};

          // Safety check: Cannot move back to 'in_progress' or 'on_hold' if already 'done'
          if (task.status === 'done' && (status === 'in_progress' || status === 'on_hold')) {
            return {};
          }

          const newTasks = s.tasks.map((t) =>
            t.id === taskId ? { ...t, status, updatedAt: Date.now() } : t
          );

          return {
            tasks: newTasks,
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        }),

      submitTaskForReview: (taskId, draftOutput, draftArtifacts) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { 
              ...t, 
              status: 'on_hold', 
              draftOutput,
              draftArtifacts,
              updatedAt: Date.now() 
            } : t
          ),
          currentRunUpdatedAt: Date.now(),
          projectUpdatedAt: Date.now(),
        })),

      approveTask: (taskId) => {
        set((s) => {
          const task = s.tasks.find(t => t.id === taskId);
          if (task) useUiStore.getState().setAgentStatus(task.assignedAgentId, 'idle');
          
          return {
            tasks: s.tasks.map((t) =>
              t.id === taskId ? { 
                ...t, 
                status: 'done', 
                output: t.draftOutput || t.output,
                artifacts: t.draftArtifacts || t.artifacts,
                revisions: t.draftOutput 
                  ? [...t.revisions, { output: t.draftOutput, artifacts: t.draftArtifacts, timestamp: Date.now() }]
                  : t.revisions,
                draftOutput: undefined,
                draftArtifacts: undefined,
                updatedAt: Date.now() 
              } : t
            ),
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        });
      },

      rejectTask: (taskId, comments) => {
        set((s) => {
          const task = s.tasks.find(t => t.id === taskId);
          if (!task) return {};

          useUiStore.getState().setAgentStatus(task.assignedAgentId, 'idle');
          
          const history = s.agentHistories[task.assignedAgentId] || [];
          const updatedHistory = [
            ...history,
            {
              role: 'user' as 'user',
              content: `Rejected. Reason: ${comments}`,
            }
          ];

          return {
            tasks: s.tasks.map((t) =>
              t.id === taskId ? { 
                ...t, 
                status: 'scheduled', 
                reviewComments: comments,
                revisions: t.draftOutput 
                  ? [...t.revisions, { output: t.draftOutput, feedback: comments, artifacts: t.draftArtifacts, timestamp: Date.now() }]
                  : t.revisions,
                draftOutput: undefined,
                draftArtifacts: undefined,
                updatedAt: Date.now() 
              } : t
            ),
            agentHistories: {
              ...s.agentHistories,
              [task.assignedAgentId]: updatedHistory
            },
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        });
      },

      setTaskOutput: (taskId, output, artifacts) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId ? { ...t, output, artifacts: artifacts ?? t.artifacts, updatedAt: Date.now() } : t
          ),
          currentRunUpdatedAt: Date.now(),
          projectUpdatedAt: Date.now(),
        })),

      addLogEntry: (entry) =>
        set((s) => ({
          actionLog: [
            ...s.actionLog,
            { ...entry, id: `log_${uid()}`, timestamp: Date.now() },
          ],
          currentRunUpdatedAt: Date.now(),
          projectUpdatedAt: Date.now(),
        })),

      addActivityEvent: (entry) =>
        set((s) => {
          const next = [
            ...s.activityLog,
            { ...entry, id: `activity_${uid()}`, timestamp: Date.now() },
          ];

          return {
            activityLog: next.length > 200 ? next.slice(-200) : next,
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        }),
      
      addRequestLog: (entry) =>
        set((s) => {
          const newEntry: DebugLogEntry = { 
            ...entry, 
            id: `debug_${uid()}`, 
            timestamp: Date.now(),
            phase: 'request',
            status: 'completed'
          };
          const updated = [...s.debugLog, newEntry];
          return {
            debugLog: updated.length > 30 ? updated.slice(-30) : updated,
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        }),

      addResponseLog: (entry) =>
        set((s) => {
          const newEntry: DebugLogEntry = { 
            ...entry, 
            id: `debug_${uid()}`, 
            timestamp: Date.now(),
            phase: 'response',
            status: 'completed'
          };
          const updated = [...s.debugLog, newEntry];
          
          // Update token usage and estimated cost
          let nextTotalUsage = s.totalTokenUsage;
          let nextAgentUsage = { ...s.agentTokenUsage };
          let nextTotalCost = s.totalEstimatedCost;
          let nextAgentCost = { ...s.agentEstimatedCost };

          if (entry.usage) {
            const modelName = entry.raw?.model || useUiStore.getState().llmConfig.model;
            // For multimodal outputs, we might need to pass the duration/count if available in raw
            const durationOrCount = entry.raw?.duration || entry.raw?.count;
            const callCost = calculateCost(entry.usage.promptTokens, entry.usage.completionTokens, modelName, durationOrCount);
            
            nextTotalCost += callCost;
            nextAgentCost[entry.agentIndex] = (s.agentEstimatedCost[entry.agentIndex] || 0) + callCost;

            nextTotalUsage = {
              promptTokens: s.totalTokenUsage.promptTokens + entry.usage.promptTokens,
              completionTokens: s.totalTokenUsage.completionTokens + entry.usage.completionTokens,
              totalTokens: s.totalTokenUsage.totalTokens + entry.usage.totalTokens
            };
            
            const currentAgentUsage = s.agentTokenUsage[entry.agentIndex] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            nextAgentUsage[entry.agentIndex] = {
              promptTokens: currentAgentUsage.promptTokens + entry.usage.promptTokens,
              completionTokens: currentAgentUsage.completionTokens + entry.usage.completionTokens,
              totalTokens: currentAgentUsage.totalTokens + entry.usage.totalTokens
            };
          }

          return { 
            debugLog: updated.length > 30 ? updated.slice(-30) : updated,
            totalTokenUsage: nextTotalUsage,
            agentTokenUsage: nextAgentUsage,
            totalEstimatedCost: nextTotalCost,
            agentEstimatedCost: nextAgentCost,
            currentRunUpdatedAt: Date.now(),
            projectUpdatedAt: Date.now(),
          };
        }),

      appendAgentHistory: (agentIndex, role, parts) =>
        set((s) => ({
          agentHistories: {
            ...s.agentHistories,
            [agentIndex]: [
              ...(s.agentHistories[agentIndex] ?? []),
              {
                role,
                content: Array.isArray(parts) ? parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ') : String(parts),
              },
            ],
          },
          currentRunUpdatedAt: Date.now(),
          projectUpdatedAt: Date.now(),
        })),

      setAgentSummary: (agentIndex, summary) =>
        set((s) => ({
          agentSummaries: {
            ...s.agentSummaries,
            [agentIndex]: summary
          },
          currentRunUpdatedAt: Date.now(),
          projectUpdatedAt: Date.now(),
        })),

      appendBoardroomHistory: (taskId, role, parts) =>
        set((s) => ({
          boardroomHistories: {
            ...s.boardroomHistories,
            [taskId]: [
              ...(s.boardroomHistories[taskId] ?? []),
              {
                role,
                content: Array.isArray(parts) ? parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ') : String(parts),
              },
            ],
          },
          currentRunUpdatedAt: Date.now(),
          projectUpdatedAt: Date.now(),
        })),

      clearAllHistories: () => set({ agentHistories: {}, boardroomHistories: {}, currentRunUpdatedAt: Date.now(), projectUpdatedAt: Date.now() }),

      setKanbanOpen: (open) => set({ isKanbanOpen: open }),
      setLogOpen: (open, filterAgent = null) =>
        set({ isLogOpen: open, logFilterAgentIndex: filterAgent ?? null }),
      setFinalOutputOpen: (open) => set({ isFinalOutputOpen: open }),
      setIsResizing: (resizing) => set({ isResizing: resizing }),

      setAgentHistory: (agentIndex, history) => set((s) => ({
        agentHistories: { ...s.agentHistories, [agentIndex]: history },
        currentRunUpdatedAt: Date.now(),
        projectUpdatedAt: Date.now(),
      })),
      setAgentExecutionState: (agentIndex, state) => set((s) => ({
        agentExecutionStates: { ...s.agentExecutionStates, [agentIndex]: state },
        currentRunUpdatedAt: Date.now(),
        projectUpdatedAt: Date.now(),
      })),
    }),
    {
      name: 'core-storage',
      storage: createJSONStorage(() => localStorage),
      // This is the application's established project repository.  Persist every
      // serializable project mutation, but deliberately exclude UI-only controls,
      // runtime completion guards, and the BYOK Gemini API key (which is in uiStore).
      partialize: (state) => ({
        projectId: state.projectId,
        projectName: state.projectName,
        projectTeamId: state.projectTeamId,
        projectCreatedAt: state.projectCreatedAt,
        projectUpdatedAt: state.projectUpdatedAt,
        userBrief: state.userBrief,
        referenceImages: state.referenceImages,
        phase: state.phase,
        currentRunId: state.currentRunId,
        currentRunNumber: state.currentRunNumber,
        currentRunCreatedAt: state.currentRunCreatedAt,
        currentRunUpdatedAt: state.currentRunUpdatedAt,
        currentRunCompletedAt: state.currentRunCompletedAt,
        runHistory: state.runHistory,
        runMarketSnapshots: state.runMarketSnapshots,
        runAnalyses: state.runAnalyses,
        finalOutput: state.finalOutput,
        finalOutputArtifacts: state.finalOutputArtifacts,
        totalTokenUsage: state.totalTokenUsage,
        agentTokenUsage: state.agentTokenUsage,
        totalEstimatedCost: state.totalEstimatedCost,
        agentEstimatedCost: state.agentEstimatedCost,
        finalAssetType: state.finalAssetType,
        finalAssetContent: state.finalAssetContent,
        isGeneratingAsset: state.isGeneratingAsset,
        isReviewingOutput: state.isReviewingOutput,
        pendingOutputPrompt: state.pendingOutputPrompt,
        pendingOutputParams: state.pendingOutputParams,
        tasks: state.tasks,
        actionLog: state.actionLog,
        activityLog: state.activityLog,
        debugLog: state.debugLog,
        agentHistories: state.agentHistories,
        agentSummaries: state.agentSummaries,
        boardroomHistories: state.boardroomHistories,
        agentExecutionStates: state.agentExecutionStates,
        selectedSymbol: state.selectedSymbol,
        portfolio: state.portfolio,
      }),
    }
  )
)

// Sync resetProject whenever the active team changes
useTeamStore.subscribe((state, prevState) => {
  const project = useCoreStore.getState();
  if (state.selectedAgentSetId !== prevState.selectedAgentSetId && project.projectTeamId !== state.selectedAgentSetId) {
    useCoreStore.getState().resetProject();
  }
});
