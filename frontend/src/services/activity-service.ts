import { apiFetchOkAuthed } from '../lib/api-authed'

export type ActivityTypeName = 'upload' | 'chat' | 'search'

export type ActivityItem = {
  id: string
  type: ActivityTypeName
  metadata: unknown
  createdAt: string
}

export type ActivityListResponse = {
  items: ActivityItem[]
  nextCursor: string | null
}

// fetches paginated activity (timeline); optional workspaceId filters metadata.workspaceId
export async function fetchActivity(params?: {
  limit?: number
  cursor?: string | null
  workspaceId?: string
}): Promise<ActivityListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.limit != null) searchParams.set('limit', String(params.limit))
  if (params?.cursor != null && String(params.cursor).trim() !== '') {
    searchParams.set('cursor', String(params.cursor).trim())
  }
  if (params?.workspaceId != null && params.workspaceId.trim() !== '') {
    searchParams.set('workspaceId', params.workspaceId.trim())
  }
  const q = searchParams.toString()
  const res = await apiFetchOkAuthed(`/activity${q ? `?${q}` : ''}`)
  return (await res.json()) as ActivityListResponse
}
