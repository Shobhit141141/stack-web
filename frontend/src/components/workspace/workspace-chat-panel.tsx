import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { ChatAnswerContent, ChatSourceFileChips } from './chat-answer-content'
import { postAsk, type AskSource } from '../../services/ask-service'
import { fetchFileList } from '../../services/file-service'
import type { FileItem } from '../../types/file'

type ChatTag = { id: string; name: string }

type ChatTurn = {
  role: 'user' | 'assistant'
  text: string
  tags?: ChatTag[]
  sources?: AskSource[]
}

type Props = {
  workspaceId: string
  workspaceName: string
}

// builds ask query when user tagged files so the model knows scope + intent
function buildAskQuery(userText: string, tags: ChatTag[]): string {
  const q = userText.trim()
  if (!tags.length) return q
  const names = tags.map((t) => t.name).join(', ')
  return `The user tagged these workspace files for this question; treat them as the primary context: ${names}.\n\nQuestion:\n${q}`
}

// shows three animated dots while waiting for the assistant
function AssistantTypingRow() {
  return (
    <div
      className="mr-auto flex max-w-[min(100%,42rem)] items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
      aria-live="polite"
    >
      <span className="sr-only">Assistant is typing</span>
      <span className="inline-flex gap-1">
        {[0, 150, 300].map((delayMs) => (
          <span
            key={delayMs}
            className="h-2 w-2 rounded-full bg-neutral-400 motion-safe:animate-bounce"
            style={{ animationDelay: `${delayMs}ms` }}
          />
        ))}
      </span>
    </div>
  )
}

export function WorkspaceChatPanel({ workspaceId, workspaceName }: Props) {
  const [query, setQuery] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [sending, setSending] = useState(false)
  const [tags, setTags] = useState<ChatTag[]>([])
  const [workspaceFiles, setWorkspaceFiles] = useState<FileItem[]>([])
  const [filesLoading, setFilesLoading] = useState(false)

  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionStart, setMentionStart] = useState(0)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionHighlight, setMentionHighlight] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setFilesLoading(true)
    ;(async () => {
      try {
        const { files } = await fetchFileList({ workspaceId, limit: 200 })
        if (!cancelled) setWorkspaceFiles(files)
      } catch {
        if (!cancelled) toast.error('Could not load workspace files for mentions.')
      } finally {
        if (!cancelled) setFilesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const filteredMentionFiles = useMemo(() => {
    const f = mentionFilter.trim().toLowerCase()
    const list = workspaceFiles.filter((file) =>
      f ? file.name.toLowerCase().includes(f) : true,
    )
    return list.slice(0, 40)
  }, [workspaceFiles, mentionFilter])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [turns, sending])

  // detects @mention at cursor; pass value/cursor from the event so controlled state is not stale
  function syncMentionFromValue(value: string, cursor: number) {
    const before = value.slice(0, cursor)
    const lastAt = before.lastIndexOf('@')
    if (lastAt === -1) {
      setMentionOpen(false)
      return
    }
    const afterAt = before.slice(lastAt + 1)
    if (afterAt.includes(' ')) {
      setMentionOpen(false)
      return
    }
    setMentionOpen(true)
    setMentionStart(lastAt)
    setMentionFilter(afterAt)
    setMentionHighlight(0)
  }

  function syncMentionFromTextarea() {
    const ta = textareaRef.current
    if (!ta) return
    syncMentionFromValue(ta.value, ta.selectionStart)
  }

  function selectMentionFile(file: FileItem) {
    const ta = textareaRef.current
    if (!ta) return
    const v = ta.value
    const cur = ta.selectionStart
    const before = v.slice(0, mentionStart)
    const after = v.slice(cur)
    const next = before + after
    setQuery(next)
    setTags((prev) => (prev.some((t) => t.id === file.id) ? prev : [...prev, { id: file.id, name: file.name }]))
    setMentionOpen(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = mentionStart
      ta.setSelectionRange(pos, pos)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || sending) return

    const tagSnapshot = [...tags]
    setSending(true)
    setQuery('')
    setTags([])
    setMentionOpen(false)
    setTurns((prev) => [...prev, { role: 'user', text: q, tags: tagSnapshot }])

    const askQuery = buildAskQuery(q, tagSnapshot)
    const fileIds = tagSnapshot.length ? tagSnapshot.map((t) => t.id) : undefined

    try {
      const { answer, sources } = await postAsk({
        query: askQuery,
        workspaceId,
        ...(fileIds?.length ? { fileIds } : {}),
      })
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

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen && filteredMentionFiles.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionHighlight((i) => (i + 1) % filteredMentionFiles.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionHighlight((i) => (i - 1 + filteredMentionFiles.length) % filteredMentionFiles.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        selectMentionFile(filteredMentionFiles[mentionHighlight])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
        return
      }
    }
    if (!mentionOpen && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <Box className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-neutral-200 px-4 py-3">
        <Text size="3" weight="bold" className="text-neutral-900">
          Chat
        </Text>
        <Text size="1" color="gray" className="mt-0.5 block">
          Answers use files in “{workspaceName}” only. Type @ to tag files and narrow the answer
          to them.
        </Text>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <Text size="2" color="gray">
            Ask a question about your workspace files. Responses use the RAG pipeline scoped to
            this workspace. Use @ to pick one or more files so search runs only inside those files.
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
                <>
                  {t.tags?.length ? (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {t.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-medium text-white/95"
                        >
                          @{tag.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap">{t.text}</p>
                </>
              )}
            </div>
          ))
        )}
        {sending ? <AssistantTypingRow /> : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative shrink-0 border-t border-neutral-200 p-3"
      >
        {tags.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-800"
              >
                <span className="truncate" title={t.name}>
                  @{t.name}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-full px-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                  onClick={() => setTags((prev) => prev.filter((x) => x.id !== t.id))}
                  aria-label={`Remove ${t.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {mentionOpen && !filesLoading && workspaceFiles.length === 0 ? (
          <div className="absolute bottom-full left-3 right-3 z-10 mb-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-500 shadow-md">
            No files in this workspace yet.
          </div>
        ) : null}

        {mentionOpen && filteredMentionFiles.length > 0 ? (
          <div
            className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-md"
            role="listbox"
            aria-label="Workspace files"
          >
            {filteredMentionFiles.map((file, idx) => (
              <button
                key={file.id}
                type="button"
                role="option"
                aria-selected={idx === mentionHighlight}
                className={`flex w-full px-3 py-2 text-left text-sm ${
                  idx === mentionHighlight ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                }`}
                onMouseDown={(ev) => ev.preventDefault()}
                onMouseEnter={() => setMentionHighlight(idx)}
                onClick={() => selectMentionFile(file)}
              >
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        {mentionOpen && !filesLoading && workspaceFiles.length > 0 && filteredMentionFiles.length === 0 && mentionFilter !== '' ? (
          <div className="absolute bottom-full left-3 right-3 z-10 mb-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-500 shadow-md">
            No files match “{mentionFilter}”.
          </div>
        ) : null}

        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => {
              const value = e.target.value
              const cursor = e.target.selectionStart
              setQuery(value)
              syncMentionFromValue(value, cursor)
            }}
            onKeyUp={() => syncMentionFromTextarea()}
            onClick={() => syncMentionFromTextarea()}
            onSelect={() => syncMentionFromTextarea()}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Ask about these files… (@ tag, Enter send, Shift+Enter newline)"
            disabled={sending}
            rows={2}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !query.trim()}
            className="h-fit shrink-0 self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </Box>
  )
}
