import { create } from 'zustand'

type UploadState = {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useUploadStore = create<UploadState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
