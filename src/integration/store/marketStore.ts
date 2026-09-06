import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DecisionEvidence } from '../../core/market/decisionEngine';

export interface AnalysisResult {
  id: string;
  symbol: string;
  timestamp: number;
  decision: DecisionEvidence | null;
  currentPrice?: number;
  latestDate?: string;
  error: string | null;
  isLoading: boolean;
  isLoadingData?: boolean; // Acquiring market data
}

interface MarketState {
  currentAnalysis: AnalysisResult | null;
  setCurrentAnalysis: (analysis: AnalysisResult) => void;
  setAnalysisLoading: (symbol: string, isLoading: boolean) => void;
  setAnalysisDataLoading: (symbol: string, isLoadingData: boolean) => void;
  clearAnalysis: () => void;
}

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      currentAnalysis: null,

      setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),

      setAnalysisLoading: (symbol, isLoading) =>
        set((s) => ({
          currentAnalysis: s.currentAnalysis || {
            id: uid(),
            symbol,
            timestamp: Date.now(),
            decision: null,
            error: null,
            isLoading: true,
          },
          ...(s.currentAnalysis
            ? {
                currentAnalysis: {
                  ...s.currentAnalysis,
                  isLoading,
                },
              }
            : {
                currentAnalysis: {
                  id: uid(),
                  symbol,
                  timestamp: Date.now(),
                  decision: null,
                  error: null,
                  isLoading,
                },
              }),
        })),

      setAnalysisDataLoading: (symbol, isLoadingData) =>
        set((s) => ({
          currentAnalysis: s.currentAnalysis || {
            id: uid(),
            symbol,
            timestamp: Date.now(),
            decision: null,
            error: null,
            isLoading: false,
            isLoadingData: true,
          },
          ...(s.currentAnalysis
            ? {
                currentAnalysis: {
                  ...s.currentAnalysis,
                  isLoadingData,
                },
              }
            : {
                currentAnalysis: {
                  id: uid(),
                  symbol,
                  timestamp: Date.now(),
                  decision: null,
                  error: null,
                  isLoading: false,
                  isLoadingData,
                },
              }),
        })),

      clearAnalysis: () => set({ currentAnalysis: null }),
    }),
    {
      name: 'market-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
