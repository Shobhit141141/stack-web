import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { HiOutlineDocumentDuplicate } from 'react-icons/hi2'
import { ChatAnswerContent, ChatSourceFileChips } from './chat-answer-content'
import { ChatQuizCard } from './chat-quiz-card'
import {
  postAsk,
  postQuizSubmit,
  type AskSource,
  type ChatPayload,
} from '../../services/ask-service'
import { fetchCurrentWorkspaceConversation } from '../../services/conversation-service'
import { fetchFileList } from '../../services/file-service'
import { openKnownFile } from '../../hooks/use-open-file'
import type { FileItem } from '../../types/file'

type ChatTurn = {
  id?: string
  role: 'user' | 'assistant'
  text: string
  sources?: AskSource[]
  payload?: ChatPayload
}

type Props = {
  workspaceId: string
  workspaceName: string
}

const FILE_DRAG_MIME = 'application/x-stack-file'

type MentionParseResult = {
  fileIds: string[]
  fileNames: string[]
  normalizedQuestion: string
}

// matches @filename.pdf or @{filename with spaces.pdf} — dots allowed in bare mentions
const MENTION_TOKEN_RE = /(@\{[^}]+\}|@[\w][\w.\-]*)/g

function renderTextWithMentionHighlights(
  text: string,
  isUserBubble: boolean,
  files: FileItem[],
) {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]))
  const parts = text.split(MENTION_TOKEN_RE)
  return parts.map((part, idx) => {
    if (!part) return null
    const isMention = part.startsWith('@{') || part.startsWith('@')
    if (!isMention) return <Fragment key={`${part}-${idx}`}>{part}</Fragment>

    const rawName = part.startsWith('@{') ? part.slice(2, -1) : part.slice(1)
    const file = byName.get(rawName.toLowerCase())

    const chip = (
      <span
        key={`${part}-${idx}`}
        role={file ? 'button' : undefined}
        tabIndex={file ? 0 : undefined}
        onClick={file ? () => openKnownFile(file.id, file.name) : undefined}
        onKeyDown={file ? (e) => { if (e.key === 'Enter') openKnownFile(file.id, file.name) } : undefined}
        className={[
          'mx-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold align-middle transition-colors',
          isUserBubble
            ? 'bg-white/15 text-white hover:bg-white/25'
            : 'border border-neutral-200 bg-neutral-50 text-neutral-800 hover:bg-neutral-100',
          file ? 'cursor-pointer' : '',
        ].join(' ')}
      >
        <img
          src={fileIconForName(rawName)}
          alt=""
          className="size-3.5 shrink-0"
        />
        <span className="max-w-48 truncate">{rawName}</span>
      </span>
    )
    return chip
  })
}

function fileIconForName(name: string): string {
  const l = name.toLowerCase()
  if (l.endsWith('.pdf')) return '/icons/pdf.svg'
  if (l.endsWith('.docx')) return '/icons/docx-file.svg'
  return '/icons/cloud.svg'
}

function formatInlineMention(fileName: string): string {
  return `@${fileName}`
}

function parseMentionedFiles(query: string, files: FileItem[]): MentionParseResult {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]))
  const nameHits: string[] = []
  const braced = query.matchAll(/@\{([^}]+)\}/g)
  for (const m of braced) {
    if (m[1]) nameHits.push(m[1])
  }
  const plainHits = query.match(/@([\w][\w.\-]*)/g) ?? []
  for (const token of plainHits) {
    nameHits.push(token.slice(1))
  }
  const ids = new Set<string>()
  const names: string[] = []
  for (const tokenName of nameHits) {
    const rawName = tokenName.trim().toLowerCase()
    if (!rawName) continue
    const file = byName.get(rawName)
    if (!file) continue
    if (!ids.has(file.id)) names.push(file.name)
    ids.add(file.id)
  }
  const normalizedQuestion = query
    .replace(/@\{([^}]+)\}/g, '$1')
    .replace(/@([\w][\w.\-]*)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    fileIds: [...ids],
    fileNames: names,
    normalizedQuestion,
  }
}

// builds ask query when user tagged files inline so the model knows scope + intent
function buildAskQuery(userText: string, fileNames: string[]): string {
  const q = userText.trim()
  if (!fileNames.length) return q
  const names = fileNames.join(', ')
  return `The user tagged these workspace files for this question; treat them as the primary context: ${names}.\n\nQuestion:\n${q}`
}

// shows three animated dots while waiting for the assistant
function AssistantTypingRow() {
  return (
    <div
      className="mr-auto flex max-w-[min(100%,42rem)] items-center gap-1 rounded-xl border-0 py-3 pl-2 pr-4 shadow-none outline-none"
      aria-live="polite"
    >
      <span className="sr-only">Assistant is typing</span>
      <span className="inline-flex gap-1">
        {[0, 150, 300].map((delayMs) => (
          <span
            key={delayMs}
            className="h-1.5 w-1.5 rounded-full bg-neutral-400 motion-safe:animate-bounce"
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
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [hydrating, setHydrating] = useState(true)
  const [sending, setSending] = useState(false)
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

  useEffect(() => {
    let cancelled = false
    setHydrating(true)
    setSending(false)
    setTurns([])
    setConversationId(null)
    ;(async () => {
      try {
        const snapshot = await fetchCurrentWorkspaceConversation(workspaceId)
        if (cancelled) return
        setConversationId(snapshot.conversationId)
        setTurns(
          snapshot.messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
            ...(Array.isArray(m.sources) ? { sources: m.sources } : {}),
            ...(m.payload ? { payload: m.payload } : {}),
          })),
        )
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Could not load conversation'
          toast.error(msg)
        }
      } finally {
        if (!cancelled) setHydrating(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const showAssistantTyping =
    sending &&
    !hydrating &&
    turns.at(-1)?.role === 'user'

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
    const inserted = `${formatInlineMention(file.name)} `
    const next = before + inserted + after
    setQuery(next)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = mentionStart + inserted.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function insertInlineMention(name: string) {
    const ta = textareaRef.current
    if (!ta) return
    const cur = ta.selectionStart
    const v = ta.value
    const before = v.slice(0, cur)
    const after = v.slice(cur)
    const needsSpaceBefore = before.length > 0 && !/\s$/.test(before)
    const mention = `${needsSpaceBefore ? ' ' : ''}${formatInlineMention(name)} `
    const next = `${before}${mention}${after}`
    setQuery(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = before.length + mention.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function handleTextareaDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const raw = e.dataTransfer.getData(FILE_DRAG_MIME)
    if (!raw) return
    e.preventDefault()
    try {
      const payload = JSON.parse(raw) as { id?: unknown; name?: unknown }
      if (typeof payload.name === 'string' && payload.name.trim()) {
        insertInlineMention(payload.name.trim())
      }
    } catch {
      // ignore malformed drag payload
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || sending || hydrating) return
    if (!conversationId) {
      toast.error('Conversation is not ready yet. Please try again in a moment.')
      return
    }

    const mentionInfo = parseMentionedFiles(q, workspaceFiles)
    setSending(true)
    setQuery('')
    setMentionOpen(false)
    setTurns((prev) => [...prev, { role: 'user', text: q }])

    const askQuery = buildAskQuery(mentionInfo.normalizedQuestion || q, mentionInfo.fileNames)
    const fileIds = mentionInfo.fileIds.length ? mentionInfo.fileIds : undefined

    try {
      const res = await postAsk({
        query: askQuery,
        displayQuery: q,
        workspaceId,
        conversationId,
        ...(fileIds?.length ? { fileIds } : {}),
      })
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.answer,
          sources: res.sources,
          ...(res.payload ? { payload: res.payload } : {}),
        },
      ])
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

  async function copyTurnText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied message')
    } catch {
      toast.error('Could not copy message')
    }
  }

  async function handleQuizSubmit(
    turn: ChatTurn,
    answers: Array<{ questionId: string; selectedOptionId: string }>,
  ) {
    if (!conversationId) {
      toast.error('Conversation is not ready yet. Please try again in a moment.')
      return
    }
    if (!turn.id) {
      toast.error('Quiz message reference is missing.')
      return
    }
    try {
      const result = await postQuizSubmit({
        conversationId,
        quizMessageId: turn.id,
        answers,
      })
      setTurns((prev) => [
        ...prev,
        {
          role: 'user',
          text: result.userMessage.content,
          payload: result.userMessage.payload,
        },
        {
          role: 'assistant',
          text: result.assistantMessage.answer,
          payload: result.assistantMessage.payload,
        },
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quiz submit failed'
      toast.error(msg)
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

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-6">
        {hydrating ? (
          <Text size="2" color="gray">
            Loading chat history…
          </Text>
        ) : turns.length === 0 ? (
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
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => void copyTurnText(t.text)}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${
                    t.role === 'user'
                      ? 'bg-white/15 text-white hover:bg-white/25'
                      : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                  }`}
                >
                  <HiOutlineDocumentDuplicate className="size-3.5" aria-hidden />
                  Copy
                </button>
              </div>
              {t.role === 'assistant' ? (
                <>
                  <ChatAnswerContent text={t.text} sources={t.sources ?? []} />
                  {t.payload && t.payload.kind === 'quiz' ? (
                    <ChatQuizCard
                      quiz={t.payload}
                      disabled={sending || hydrating}
                      onSubmit={(answers) => handleQuizSubmit(t, answers)}
                    />
                  ) : null}
                  <ChatSourceFileChips sources={t.sources ?? []} />
                </>
              ) : (
                <p className="whitespace-pre-wrap">
                  {renderTextWithMentionHighlights(t.text, true, workspaceFiles)}
                </p>
              )}
            </div>
          ))
        )}
        {showAssistantTyping ? <AssistantTypingRow /> : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative shrink-0 border-t border-neutral-200 p-3"
      >
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

        {/* Tagged file chips */}
        {(() => {
          const mentioned = parseMentionedFiles(query, workspaceFiles)
          return mentioned.fileNames.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {mentioned.fileNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                >
                  @{name}
                </span>
              ))}
            </div>
          ) : null
        })()}

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
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(FILE_DRAG_MIME)) e.preventDefault()
            }}
            onDrop={handleTextareaDrop}
            placeholder="Ask about these files… (@ to tag, Enter to send)"
            disabled={sending || hydrating}
            rows={2}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || hydrating || !query.trim()}
            className="h-fit shrink-0 self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </Box>
  )
}
