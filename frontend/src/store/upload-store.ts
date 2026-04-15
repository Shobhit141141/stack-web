import { create } from 'zustand'
import { useLinkImportWorkspaceStore } from './link-import-workspace-store'

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
  open: (opts) => {
    const wid = opts?.defaultWorkspaceId ?? null
    useLinkImportWorkspaceStore.getState().setLinkImportWorkspaceId(wid)
    set({
      isOpen: true,
      defaultWorkspaceId: wid,
    })
  },
  close: () => set({ isOpen: false }),
}))
