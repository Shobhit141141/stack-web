import { create } from 'zustand'

type PdfViewerState = {
  fileId: string | null
  fileName: string | null
  open: (fileId: string, fileName?: string) => void
  close: () => void
}

export const usePdfViewerStore = create<PdfViewerState>((set) => ({
  fileId: null,
  fileName: null,
  open: (fileId, fileName) => set({ fileId, fileName: fileName ?? null }),
  close: () => set({ fileId: null, fileName: null }),
}))
