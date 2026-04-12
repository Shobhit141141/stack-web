import { create } from 'zustand'

type AppState = {
  count: number
  inc: () => void
  lastFetchStatus: string | null
  setLastFetchStatus: (s: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
  lastFetchStatus: null,
  setLastFetchStatus: (lastFetchStatus) => set({ lastFetchStatus }),
}))
