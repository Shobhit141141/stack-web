import { create } from 'zustand'

type ImageViewerState = {
  fileId: string | null
  fileName: string | null
  summary: string | null
  summaryStatus: 'pending' | 'ready' | 'failed' | null
  open: (
    fileId: string,
    fileName?: string,
    meta?: {
      summary?: string | null
      summaryStatus?: 'pending' | 'ready' | 'failed'
    },
  ) => void
  close: () => void
}

export const useImageViewerStore = create<ImageViewerState>((set) => ({
  fileId: null,
  fileName: null,
  summary: null,
  summaryStatus: null,
  open: (fileId, fileName, meta) =>
    set({
      fileId,
      fileName: fileName ?? null,
      summary: meta?.summary ?? null,
      summaryStatus: meta?.summaryStatus ?? null,
    }),
  close: () =>
    set({ fileId: null, fileName: null, summary: null, summaryStatus: null }),
}))
