import { apiFetchOkAuthed } from '../lib/api-authed'

export type AskSource = {
  fileId: string
  fileName: string
  snippet: string
}

export type AskResponse = {
  answer: string
  sources: AskSource[]
}

// calls rag ask endpoint; input: query and optional workspace or file scope
export async function postAsk(params: {
  query: string
  displayQuery?: string
  workspaceId?: string
  fileIds?: string[]
  conversationId?: string
}): Promise<AskResponse> {
  const res = await apiFetchOkAuthed('/ask', {
    method: 'POST',
    json: {
      query: params.query,
      ...(params.displayQuery ? { displayQuery: params.displayQuery } : {}),
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
      ...(params.fileIds?.length ? { fileIds: params.fileIds } : {}),
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    },
  })
  return (await res.json()) as AskResponse
}
