import { create } from 'zustand'

type ImageViewerState = {
  fileId: string | null
  fileName: string | null
  open: (fileId: string, fileName?: string) => void
  close: () => void
}

export const useImageViewerStore = create<ImageViewerState>((set) => ({
  fileId: null,
  fileName: null,
  open: (fileId, fileName) => set({ fileId, fileName: fileName ?? null }),
  close: () => set({ fileId: null, fileName: null }),
}))
