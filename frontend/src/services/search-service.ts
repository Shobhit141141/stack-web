import { apiFetchOkAuthed } from '../lib/api-authed'

export type SearchResult = {
  contentId: string
  fileId: string
  fileName: string
  type: string
  createdAt: string
  score: number
  snippet: string
}

export async function semanticSearch(
  query: string,
  workspaceId?: string
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query })
  if (workspaceId) params.set('workspaceId', workspaceId)
  const res = await apiFetchOkAuthed(`/search?${params.toString()}`)
  const body = (await res.json()) as { results: SearchResult[] }
  return body.results
}
