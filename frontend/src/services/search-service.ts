import { apiFetchOkAuthed } from '../lib/api-authed'

export type SearchChunkType = 'text' | 'table' | 'image'

export type SearchResult = {
  contentId: string
  fileId: string
  fileName: string
  type: string
  createdAt: string
  score: number
  snippet: string
  chunkType?: SearchChunkType
  previewFileId?: string
  /** Slot for `GET /files/:fileId/pdf-extraction/:slot` (same fileId as result). */
  previewPdfExtraction?: { slot: number }
  chunkSource?: string
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
