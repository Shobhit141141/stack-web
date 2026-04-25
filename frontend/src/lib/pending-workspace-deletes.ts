// Workspace deletion is queued on the backend, so the workspace can still come
// back from `GET /workspace` for a few seconds after the request returns. Track
// the IDs we just deleted so list views can hide them immediately and keep them
// hidden across navigations until the page is fully reloaded.

import type { WorkspaceItem } from '../services/workspace-service'

const pending = new Set<string>()

export function markWorkspaceDeleted(id: string): void {
  pending.add(id)
}

export function isWorkspacePendingDelete(id: string): boolean {
  return pending.has(id)
}

export function filterPendingDeletes(list: WorkspaceItem[]): WorkspaceItem[] {
  if (pending.size === 0) return list
  return list.filter((w) => !pending.has(w.id))
}
