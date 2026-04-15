import { apiFetchOkAuthed } from '../lib/api-authed'

export type WorkspaceItem = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export async function fetchWorkspaces(): Promise<WorkspaceItem[]> {
  const res = await apiFetchOkAuthed('/workspaces')
  const body = (await res.json()) as { workspaces: WorkspaceItem[] }
  return body.workspaces
}

export async function createWorkspace(name: string): Promise<WorkspaceItem> {
  const res = await apiFetchOkAuthed('/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return (await res.json()) as WorkspaceItem
}

export async function renameWorkspace(
  workspaceId: string,
  name: string
): Promise<WorkspaceItem> {
  const res = await apiFetchOkAuthed(`/workspaces/${workspaceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return (await res.json()) as WorkspaceItem
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await apiFetchOkAuthed(`/workspaces/${workspaceId}`, { method: 'DELETE' })
}

export async function assignFileToWorkspace(
  fileId: string,
  workspaceId: string | null
): Promise<{
  id: string
  name: string
  type: string
  size: number
  workspaceId: string | null
  createdAt: string
}> {
  const res = await apiFetchOkAuthed(`/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  })
  return (await res.json()) as {
    id: string
    name: string
    type: string
    size: number
    workspaceId: string | null
    createdAt: string
  }
}
