import { create } from 'zustand'

// workspace used for global paste and url-from-link imports when not overridden in ui
type LinkImportWorkspaceState = {
  linkImportWorkspaceId: string | null
  setLinkImportWorkspaceId: (id: string | null) => void
}

export const useLinkImportWorkspaceStore = create<LinkImportWorkspaceState>((set) => ({
  linkImportWorkspaceId: null,
  setLinkImportWorkspaceId: (id) => set({ linkImportWorkspaceId: id }),
}))
