
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AgenticSystem, DEFAULT_AGENTIC_SET_ID, getAgentSet } from '../../data/agents';
import { DEFAULT_MODELS } from '../../core/llm/constants';

// NUCLEAR SANITIZATION: Run synchronously at module load time before store initialization
(() => {
  try {
    const teamData = localStorage.getItem('team-storage');
    if (teamData) {
      // Check for any old model references and nuke the entire localStorage entry
      if (
        teamData.includes('2.5-flash-lite') ||
        teamData.includes('veo-3') ||
        teamData.includes('gemini-1.5')
      ) {
        localStorage.removeItem('team-storage');
      }
    }
  } catch { }
})();

const normalizeSupportedModels = (model: any): string => {
  const previousFlashDefault = DEFAULT_MODELS.text.replace('-preview', '');
  if (model === previousFlashDefault) return DEFAULT_MODELS.text;
  if (typeof model === 'string' && model.trim().length > 0) {
    return model;
  }

  return DEFAULT_MODELS.text;
};

const normalizeAgentSystem = (system: any): AgenticSystem => {
  if (!system) return system;

  return {
    ...system,
    outputModel: normalizeSupportedModels(system.outputModel),
    user: system.user
      ? { ...system.user, model: system.user.model }
      : system.user,
    agents: Array.isArray(system.agents)
      ? system.agents.map((agent: any) => ({
          ...agent,
          model: normalizeSupportedModels(agent.model),
          subagents: Array.isArray(agent.subagents)
            ? agent.subagents.map((sub: any) => ({
                ...sub,
                model: normalizeSupportedModels(sub.model),
              }))
            : agent.subagents,
        }))
      : system.agents,
  };
};

export type AgentSet = AgenticSystem;

interface TeamState {
  selectedAgentSetId: string;
  customSystems: AgenticSystem[];

  saveCustomSystem: (system: AgenticSystem) => void;
  deleteCustomSystem: (id: string) => void;
  updateActiveSystem: (changes: Partial<AgenticSystem>) => void;
  updateSystem: (id: string, changes: Partial<AgenticSystem>) => void;
  setActiveTeam: (id: string) => void;
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set) => ({
      selectedAgentSetId: DEFAULT_AGENTIC_SET_ID,
      customSystems: [],

      saveCustomSystem: (system) =>
        set((s) => ({
          customSystems: s.customSystems.some((cs) => cs.id === system.id)
            ? s.customSystems.map((cs) => (cs.id === system.id ? system : cs))
            : [...s.customSystems, system],
        })),

      deleteCustomSystem: (id) =>
        set((s) => ({
          customSystems: s.customSystems.filter((cs) => cs.id !== id),
          selectedAgentSetId: s.selectedAgentSetId === id ? DEFAULT_AGENTIC_SET_ID : s.selectedAgentSetId,
        })),

      updateActiveSystem: (changes) => set((s) => {
        const currentSystem = getAgentSet(s.selectedAgentSetId, s.customSystems);
        const updatedSystem = { ...currentSystem, ...changes };
        return {
          customSystems: s.customSystems.some((cs) => cs.id === updatedSystem.id)
            ? s.customSystems.map((cs) => (cs.id === updatedSystem.id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      updateSystem: (id, changes) => set((s) => {
        const system = getAgentSet(id, s.customSystems);
        const updatedSystem = { ...system, ...changes };
        return {
          customSystems: s.customSystems.some((cs) => cs.id === id)
            ? s.customSystems.map((cs) => (cs.id === id ? updatedSystem : cs))
            : [...s.customSystems, updatedSystem],
        };
      }),

      setActiveTeam: (id) => set({
        selectedAgentSetId: id,
      }),
    }),
    {
      name: 'team-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.customSystems) {
          state.customSystems = state.customSystems.map(normalizeAgentSystem);
        }
      },
    }
  )
);

/** Returns the currently active AgentSet. Safe to call from service/non-React contexts. */
export function getActiveAgentSet(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore.getState();
  return getAgentSet(selectedAgentSetId, customSystems);
}

/** React hook for accessing the currently active team. */
export function useActiveTeam(): AgentSet {
  const { selectedAgentSetId, customSystems } = useTeamStore();
  return getAgentSet(selectedAgentSetId, customSystems);
}
