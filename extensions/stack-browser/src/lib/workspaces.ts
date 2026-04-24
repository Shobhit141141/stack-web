import { apiFetchOkAuthed } from "./api"

export type WorkspaceItem = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export async function fetchWorkspaces(): Promise<WorkspaceItem[]> {
  const res = await apiFetchOkAuthed("/workspaces")
  const body = (await res.json()) as { workspaces: WorkspaceItem[] }
  return body.workspaces ?? []
}

export async function createWorkspace(name: string): Promise<WorkspaceItem> {
  const res = await apiFetchOkAuthed("/workspaces", {
    method: "POST",
    json: { name },
  })
  return (await res.json()) as WorkspaceItem
}
