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
  workspaceId?: string
  fileIds?: string[]
}): Promise<AskResponse> {
  const res = await apiFetchOkAuthed('/ask', {
    method: 'POST',
    json: {
      query: params.query,
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
      ...(params.fileIds?.length ? { fileIds: params.fileIds } : {}),
    },
  })
  return (await res.json()) as AskResponse
}
