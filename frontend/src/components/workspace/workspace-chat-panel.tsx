import { useState } from 'react'
import { Box, Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { ChatAnswerContent, ChatSourceFileChips } from './chat-answer-content'
import { postAsk, type AskSource } from '../../services/ask-service'

type ChatTurn = {
  role: 'user' | 'assistant'
  text: string
  sources?: AskSource[]
}

type Props = {
  workspaceId: string
  workspaceName: string
}

export function WorkspaceChatPanel({ workspaceId, workspaceName }: Props) {
  const [query, setQuery] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || sending) return

    setSending(true)
    setQuery('')
    setTurns((prev) => [...prev, { role: 'user', text: q }])

    try {
      const { answer, sources } = await postAsk({ query: q, workspaceId })
      setTurns((prev) => [...prev, { role: 'assistant', text: answer, sources }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      toast.error(msg)
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong. Try again.' },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <Box className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-neutral-200 px-4 py-3">
        <Text size="3" weight="bold" className="text-neutral-900">
          Chat
        </Text>
        <Text size="1" color="gray" className="mt-0.5 block">
          Answers use files in “{workspaceName}” only.
        </Text>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <Text size="2" color="gray">
            Ask a question about your workspace files. Responses use the RAG pipeline scoped to
            this workspace.
          </Text>
        ) : (
          turns.map((t, i) => (
            <div
              key={i}
              className={`max-w-[min(100%,42rem)] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                t.role === 'user'
                  ? 'ml-auto bg-neutral-900 text-white'
                  : 'mr-auto border border-neutral-200 bg-neutral-50 text-neutral-900'
              }`}
            >
              {t.role === 'assistant' ? (
                <>
                  <ChatAnswerContent text={t.text} sources={t.sources ?? []} />
                  <ChatSourceFileChips sources={t.sources ?? []} />
                </>
              ) : (
                <p className="whitespace-pre-wrap">{t.text}</p>
              )}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-neutral-200 p-3"
      >
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about these files…"
            disabled={sending}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !query.trim()}
            className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </Box>
  )
}
