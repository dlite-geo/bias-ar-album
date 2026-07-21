import { create } from 'zustand';

export type View = 'landing' | 'processing' | 'space';

interface ViewState {
  view: View;
  loaded: number;
  total: number;
  resetCounter: number;
  gatherCounter: number;
  fullResetCounter: number;
  shuffleCounter: number;
  setView: (v: View) => void;
  setProgress: (loaded: number, total: number) => void;
  triggerReset: () => void;
  triggerGather: () => void;
  triggerFullReset: () => void;
  triggerShuffle: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'landing',
  loaded: 0,
  total: 0,
  resetCounter: 0,
  gatherCounter: 0,
  fullResetCounter: 0,
  shuffleCounter: 0,
  setView: (v) => set({ view: v }),
  setProgress: (loaded, total) => set({ loaded, total }),
  triggerReset: () => set((s) => ({ resetCounter: s.resetCounter + 1 })),
  triggerGather: () => set((s) => ({ gatherCounter: s.gatherCounter + 1 })),
  triggerFullReset: () => set((s) => ({ fullResetCounter: s.fullResetCounter + 1 })),
  triggerShuffle: () => set((s) => ({ shuffleCounter: s.shuffleCounter + 1 })),
}));
