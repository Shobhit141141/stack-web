import { create } from 'zustand'

type PdfViewerState = {
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

export const usePdfViewerStore = create<PdfViewerState>((set) => ({
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
  close: () => set({ fileId: null, fileName: null, summary: null, summaryStatus: null }),
}))
