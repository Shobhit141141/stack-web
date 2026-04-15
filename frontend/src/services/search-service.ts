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

export async function semanticSearch(query: string): Promise<SearchResult[]> {
  const res = await apiFetchOkAuthed(`/search?q=${encodeURIComponent(query)}`)
  const body = (await res.json()) as { results: SearchResult[] }
  return body.results
}
