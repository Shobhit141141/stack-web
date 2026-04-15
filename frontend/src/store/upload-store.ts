import { create } from 'zustand'

export type UploadOpenOptions = {
  /** workspace to assign uploads to; null = not in a workspace */
  defaultWorkspaceId?: string | null
}

type UploadState = {
  isOpen: boolean
  defaultWorkspaceId: string | null
  open: (opts?: UploadOpenOptions) => void
  close: () => void
}

export const useUploadStore = create<UploadState>((set) => ({
  isOpen: false,
  defaultWorkspaceId: null,
  open: (opts) =>
    set({
      isOpen: true,
      defaultWorkspaceId: opts?.defaultWorkspaceId ?? null,
    }),
  close: () => set({ isOpen: false }),
}))
