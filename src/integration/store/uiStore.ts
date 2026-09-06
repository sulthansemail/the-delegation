import { create } from 'zustand';
import { getAllAgents } from '../../data/agents';
import { AgentState, CharacterState } from '../../types';
import { useTeamStore, getActiveAgentSet } from './teamStore';
import { DEFAULT_MODELS } from '../../core/llm/constants';

// NUCLEAR SANITIZATION: Run synchronously at module load time before anything else
(() => {
  try {
    // Wipe BYOK config completely if it has ANY old model reference
    const byokData = localStorage.getItem('byok-config');
    if (byokData) {
      try {
        const parsed = JSON.parse(byokData);
        const modelStr = String(parsed?.model || '');
        // If it contains any known old reference, nuke it all
        if (
          modelStr.includes('2.5-flash-lite') ||
          modelStr.includes('veo-3') ||
          modelStr.includes('gemini-1.5')
        ) {
          localStorage.removeItem('byok-config');
        }
      } catch {
        localStorage.removeItem('byok-config');
      }
    }

    // Wipe team-storage completely if it has ANY old model reference
    const teamData = localStorage.getItem('team-storage');
    if (teamData) {
      try {
        if (teamData.includes('2.5-flash-lite') || teamData.includes('gemini-3.') || teamData.includes('veo-3') || teamData.includes('preview')) {
          localStorage.removeItem('team-storage');
        }
      } catch {
        localStorage.removeItem('team-storage');
      }
    }
  } catch { }
})();

const normalizeStoredModel = (model?: string): string => {
  const previousFlashDefault = DEFAULT_MODELS.text.replace('-preview', '');
  if (model === previousFlashDefault) return DEFAULT_MODELS.text;
  if (typeof model === 'string' && model.trim().length > 0) return model;
  return DEFAULT_MODELS.text;
};



export const useUiStore = create<CharacterState>()(
  (set) => ({
    isThinking: false,
    instanceCount: getAllAgents(getActiveAgentSet()).length + 1, // +1 for user

    selectedNpcIndex: null,
    selectedPosition: null,
    hoveredNpcIndex: null,
    hoveredPoiId: null,
    hoveredPoiLabel: null,
    hoverPosition: null,
    npcScreenPositions: {},
    isChatting: false,
    isTyping: false,
    chatMessages: [],
    inspectorTab: 'info',
    agentStatuses: {},
    setAgentStatus: (index: number, status: AgentState) => set((s) => ({
      agentStatuses: { ...s.agentStatuses, [index]: status }
    })),

    isBYOKOpen: false,
    byokError: null,
    setBYOKOpen: (open: boolean, error: string | null = null) =>
      set({ isBYOKOpen: open, byokError: error }),

    activeAuditTaskId: null,
    setActiveAuditTaskId: (taskId: string | null) => set({ activeAuditTaskId: taskId }),

    llmConfig: (() => {
      try {
        const saved = localStorage.getItem('byok-config');
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            apiKey: typeof parsed?.apiKey === 'string' ? parsed.apiKey : '',
            model: normalizeStoredModel(parsed?.model),
          };
        }
      } catch { }
      return {
        apiKey: '',
        model: DEFAULT_MODELS.text
      };
    })(),

    setThinking: (isThinking: boolean) => set({ isThinking }),
    setIsTyping: (isTyping: boolean) => set({ isTyping }),
    setInspectorTab: (tab: 'info' | 'chat') => set({ inspectorTab: tab }),
    setInstanceCount: (count: number) => set({ instanceCount: count }),

    setSelectedNpc: (index: number | null) => set({
      selectedNpcIndex: index,
      selectedPosition: null,
    }),
    setSelectedPosition: (pos: { x: number; y: number } | null) => set({ selectedPosition: pos }),
    setHoveredNpc: (index: number | null, pos: { x: number; y: number } | null) => set({
      hoveredNpcIndex: index,
      hoverPosition: pos,
      hoveredPoiId: null,
      hoveredPoiLabel: null,
    }),
    setHoveredPoi: (id: string | null, label: string | null, pos: { x: number; y: number } | null) => set({
      hoveredPoiId: id,
      hoveredPoiLabel: label,
      hoverPosition: pos,
      hoveredNpcIndex: null,
    }),
    setLlmConfig: (config) => set((s) => ({
      llmConfig: {
        ...s.llmConfig,
        ...config,
        model: normalizeStoredModel(config.model || s.llmConfig.model),
      },
    })),
    setChatting: (isChatting: boolean) => set((s) => ({ 
      isChatting, 
      isTyping: isChatting ? s.isTyping : false,
      isThinking: isChatting ? s.isThinking : false,
      chatMessages: isChatting ? s.chatMessages : []
    })),
  })
);

// Keep instanceCount in sync whenever the active agent set changes
useTeamStore.subscribe((state, prevState) => {
  if (state.selectedAgentSetId !== prevState.selectedAgentSetId) {
    const system = getActiveAgentSet();
    useUiStore.getState().setInstanceCount(getAllAgents(system).length + 1);
  }
});
