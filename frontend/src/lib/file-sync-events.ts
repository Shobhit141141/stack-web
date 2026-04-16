export const FILES_UPDATED_EVENT = 'stack:files-updated'

export type FilesUpdatedDetail = {
  workspaceId?: string | null
}

export function emitFilesUpdated(detail: FilesUpdatedDetail = {}): void {
  window.dispatchEvent(new CustomEvent<FilesUpdatedDetail>(FILES_UPDATED_EVENT, { detail }))
}
