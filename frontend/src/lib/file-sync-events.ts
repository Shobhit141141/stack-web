import type { FileItem } from '../types/file'

export const FILES_UPDATED_EVENT = 'stack:files-updated'

export type FileOptimisticPatch = {
  id: string
  name?: string
  workspaceId?: string | null
}

export type FilesUpdatedDetail = {
  workspaceId?: string | null
  /** refresh all workspace-scoped lists (e.g. voice move/rename) */
  global?: boolean
  optimistic?: { patchFiles?: FileOptimisticPatch[] }
}

// applies id-keyed patches to an in-memory file list for instant UI before refetch.
export function applyFileListPatches(
  files: FileItem[],
  patches: FileOptimisticPatch[] | undefined,
): FileItem[] {
  if (!patches?.length) return files
  return files.map((f) => {
    const p = patches.find((x) => x.id === f.id)
    if (!p) return f
    return {
      ...f,
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.workspaceId !== undefined ? { workspaceId: p.workspaceId } : {}),
    }
  })
}

export function filterFilesForWorkspace(
  files: FileItem[],
  workspaceId: string,
): FileItem[] {
  return files.filter((f) => f.workspaceId === workspaceId)
}

export function emitFilesUpdated(detail: FilesUpdatedDetail = {}): void {
  window.dispatchEvent(new CustomEvent<FilesUpdatedDetail>(FILES_UPDATED_EVENT, { detail }))
}
