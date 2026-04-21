import { apiFetchOkAuthed } from '../lib/api-authed'
import type { AskSource, ChatPayload } from './ask-service'

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: AskSource[]
  payload?: ChatPayload
  createdAt: string
}

export type ConversationSnapshot = {
  conversationId: string
  workspaceId: string | null
  messages: ConversationMessage[]
}

export async function fetchCurrentWorkspaceConversation(
  workspaceId: string,
): Promise<ConversationSnapshot> {
  const query = new URLSearchParams({ workspaceId }).toString()
  const res = await apiFetchOkAuthed(`/conversations/current?${query}`)
  return (await res.json()) as ConversationSnapshot
}
