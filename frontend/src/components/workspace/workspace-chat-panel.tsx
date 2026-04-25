import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from '@radix-ui/themes'
import toast from 'react-hot-toast'
import { HiOutlineDocumentDuplicate } from 'react-icons/hi2'
import {
  ChatAnswerContent,
  ChatSourceFileChips,
  ChatSummaryAudioPlayer,
} from './chat-answer-content'
import { ChatQuizCard } from './chat-quiz-card'
import { ChatQuizResultCard } from './chat-quiz-result-card'
import { ChatFlashcardsCard } from './chat-flashcards-card'
import { useImageThumbnailUrls } from '../../hooks/use-image-thumbnail-urls'
import {
  postAsk,
  postQuizSubmit,
  type AskFeature,
  type AskSource,
  type ChatPayload,
  type QuizResultPayload,
  type QuizSubmissionPayload,
} from '../../services/ask-service'
import { fetchCurrentWorkspaceConversation } from '../../services/conversation-service'
import { fetchFileList } from '../../services/file-service'
import { openKnownFile } from '../../hooks/use-open-file'
import type { FileItem } from '../../types/file'
import { fileIcon, isImageFileType } from '../../utils/file-display'
import {
  applyFileListPatches,
  FILES_UPDATED_EVENT,
  filterFilesForWorkspace,
  type FilesUpdatedDetail,
} from '../../lib/file-sync-events'

type ChatTurn = {
  id?: string
  role: 'user' | 'assistant'
  text: string
  sources?: AskSource[]
  payload?: ChatPayload
  featureUsed?: 'quiz' | 'flashcards' | 'audio'
}

type Props = {
  workspaceId: string
  workspaceName: string
}

const FILE_DRAG_MIME = 'application/x-stack-file'
const SLASH_COMMAND_RE = /(?:^|\s)\/([a-z]*)$/i
const QUIZ_COMMAND = '/quiz'
const FLASHCARDS_COMMAND = '/flashcards'
const QUIZ_TOKEN_RE = /(^|\s)\/quiz\b/gi
const FLASHCARDS_TOKEN_RE = /(^|\s)\/flashcards\b/gi

type MentionParseResult = {
  fileIds: string[]
  fileNames: string[]
  normalizedQuestion: string
}

type SlashCommand = {
  command: string
  label: string
  description: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: QUIZ_COMMAND,
    label: 'Quiz Mode',
    description: 'Generate a quiz from tagged or workspace files',
  },
  {
    command: FLASHCARDS_COMMAND,
    label: 'Flashcards Mode',
    description: 'Generate flashcards from tagged or workspace files',
  },
]

type InteractionMode = 'quiz' | 'flashcards' | 'audio' | null
type InteractionModeSource = 'manual' | 'auto' | null

// reads plain text aloud; optional onEnd after utterance finishes
function speakPlainText(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.()
    return
  }
  const Utterance = (window as unknown as { SpeechUtterance?: new (s: string) => { rate: number; onend: (() => void) | null; onerror: (() => void) | null } }).SpeechUtterance
  if (!Utterance) {
    onEnd?.()
    return
  }
  window.speechSynthesis.cancel()
  const u = new Utterance(text)
  u.rate = 1
  if (onEnd) {
    u.onend = onEnd
    u.onerror = onEnd
  }
  window.speechSynthesis.speak(u as unknown as SpeechSynthesisUtterance)
}

function stopSpeechOutput(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

// strips file chips and caps length for TTS
function textForSpeechOutput(text: string): string {
  let t = text.replace(/\s*\[File:\s*[^\]]+\]\s*/gi, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length > 8000) t = `${t.slice(0, 7997)}...`
  return t
}

// matches @filename.pdf or @{filename with spaces.pdf} — dots allowed in bare mentions
const MENTION_TOKEN_RE = /(@\{[^}]+\}|@[\w][\w.\-]*)/g

function renderTextWithMentionHighlights(
  text: string,
  isUserBubble: boolean,
  files: FileItem[],
  thumbnailUrls: Map<string, string>,
) {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]))
  const parts = text.split(MENTION_TOKEN_RE)
  return parts.map((part, idx) => {
    if (!part) return null
    const isMention = part.startsWith('@{') || part.startsWith('@')
    if (!isMention) return <Fragment key={`${part}-${idx}`}>{part}</Fragment>

    const rawName = part.startsWith('@{') ? part.slice(2, -1) : part.slice(1)
    const file = byName.get(rawName.toLowerCase())
    const previewUrl = file ? thumbnailUrls.get(file.id) : undefined
    const iconSrc = file ? fileIcon(file.type) : fileIconForName(rawName)

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
          src={previewUrl ?? iconSrc}
          alt=""
          className={[
            'shrink-0',
            previewUrl ? 'size-4 rounded object-cover' : 'size-3.5',
          ].join(' ')}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.src = iconSrc
          }}
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
  // Brace whenever the name has chars outside the bare-mention set so the chip
  // captures the whole filename (e.g. "Shobhit Tiwari.pdf" — space breaks bare form).
  return /^[\w][\w.\-]*$/.test(fileName) ? `@${fileName}` : `@{${fileName}}`
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

function stripQuizTokenAnywhere(input: string): string {
  return input.replace(QUIZ_TOKEN_RE, '$1').replace(/\s{2,}/g, ' ').trimStart()
}

function stripFlashcardsTokenAnywhere(input: string): string {
  return input.replace(FLASHCARDS_TOKEN_RE, '$1').replace(/\s{2,}/g, ' ').trimStart()
}

function inferStudyIntent(
  input: string,
): 'quiz' | 'flashcards' | null {
  const q = input.trim().toLowerCase()
  if (!q) return null

  const flashcardsIntent =
    /\bflash\s*cards?\b/.test(q) ||
    /\bmake\s+(?:me\s+)?flash\s*cards?\b/.test(q) ||
    /\bgenerate\s+(?:me\s+)?flash\s*cards?\b/.test(q)
  if (flashcardsIntent) return 'flashcards'

  const quizIntent =
    /\bquiz\b/.test(q) ||
    /\bquestions?\b/.test(q) ||
    /\bask\s+me\b/.test(q) ||
    /\btest\s+me\b/.test(q)
  if (quizIntent) return 'quiz'

  return null
}

function inferFeatureFromInput(input: string): Exclude<InteractionMode, null> | null {
  const q = input.trim().toLowerCase()
  if (!q) return null
  if (/\baudio\b/.test(q)) return 'audio'
  return inferStudyIntent(q)
}

function featureFromPayload(payload: ChatPayload | undefined): AskFeature | undefined {
  if (!payload || typeof payload !== 'object' || !('kind' in payload)) return undefined
  if (payload.kind === 'feature_usage') return payload.feature
  if (payload.kind === 'quiz' || payload.kind === 'quiz_result' || payload.kind === 'quiz_submission') return 'quiz'
  if (payload.kind === 'flashcards') return 'flashcards'
  return undefined
}

function inferFeatureFromMessageText(text: string): AskFeature | undefined {
  const inferred = inferFeatureFromInput(text)
  return inferred ?? undefined
}

function stripTrailingSlashCommandAtCursor(input: string, cursor: number): string {
  const safeCursor = Math.max(0, Math.min(cursor, input.length))
  const before = input.slice(0, safeCursor)
  const after = input.slice(safeCursor)
  const m = before.match(SLASH_COMMAND_RE)
  if (!m) return input
  const tokenStart = before.length - m[0].length
  return `${before.slice(0, tokenStart)}${after}`.replace(/\s{2,}/g, ' ')
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
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashHighlight, setSlashHighlight] = useState(0)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(null)
  const [interactionModeSource, setInteractionModeSource] = useState<InteractionModeSource>(null)
  const [suppressAutoFeatureEnable, setSuppressAutoFeatureEnable] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const interactionModeRef = useRef<InteractionMode>(null)

  useEffect(() => {
    interactionModeRef.current = interactionMode
  }, [interactionMode])

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
    function onFilesUpdated(ev: Event) {
      const detail = (ev as CustomEvent<FilesUpdatedDetail>).detail
      if (detail?.optimistic?.patchFiles?.length) {
        setWorkspaceFiles((prev) =>
          filterFilesForWorkspace(
            applyFileListPatches(prev, detail.optimistic!.patchFiles),
            workspaceId,
          ),
        )
      }
      if (detail?.global || !detail?.workspaceId || detail.workspaceId === workspaceId) {
        void fetchFileList({ workspaceId, limit: 200 })
          .then(({ files }) => {
            setWorkspaceFiles(files)
          })
          .catch(() => {
            // non-blocking refresh
          })
      }
    }
    window.addEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
    return () => window.removeEventListener(FILES_UPDATED_EVENT, onFilesUpdated)
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
          snapshot.messages.map((m, i, arr) => {
            const payload = m.payload
            const payloadFeature = featureFromPayload(payload)
            const textFeature = inferFeatureFromMessageText(m.content)
            const currentFeature = payloadFeature ?? (m.role === 'user' ? textFeature : undefined)
            const previous = i > 0 ? arr[i - 1] : undefined
            const previousFeature =
              previous?.role === 'user'
                ? featureFromPayload(previous.payload) ?? inferFeatureFromMessageText(previous.content)
                : undefined
            const featureUsed =
              m.role === 'user'
                ? currentFeature
                : previousFeature === 'audio'
                  ? 'audio'
                  : undefined
            return {
              id: m.id,
              role: m.role,
              text: m.content,
              ...(Array.isArray(m.sources) ? { sources: m.sources } : {}),
              ...(payload ? { payload } : {}),
              ...(featureUsed ? { featureUsed } : {}),
            }
          }),
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

  useEffect(() => {
    return () => {
      stopSpeechOutput()
    }
  }, [])

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
  const filteredSlashCommands = useMemo(() => {
    const f = slashFilter.trim().toLowerCase()
    return SLASH_COMMANDS.filter((cmd) =>
      f ? cmd.command.slice(1).toLowerCase().startsWith(f) : true,
    )
  }, [slashFilter])
  const isQuizMode = interactionMode === 'quiz'
  const isFlashcardsMode = interactionMode === 'flashcards'
  const isAudioMode = interactionMode === 'audio'
  const hasInteractionMode = interactionMode !== null
  const quizResultById = useMemo(() => {
    const map = new Map<string, QuizResultPayload>()
    for (const t of turns) {
      if (t.role !== 'assistant' || !t.payload || t.payload.kind !== 'quiz_result') continue
      map.set(t.payload.quizId, t.payload)
    }
    return map
  }, [turns])
  const quizSubmissionById = useMemo(() => {
    const map = new Map<string, QuizSubmissionPayload>()
    for (const t of turns) {
      if (t.role !== 'user' || !t.payload || t.payload.kind !== 'quiz_submission') continue
      map.set(t.payload.quizId, t.payload)
    }
    return map
  }, [turns])
  const mentionThumbnailUrls = useImageThumbnailUrls(
    workspaceFiles.map((file) => ({
      fileId: file.id,
      type: file.type,
      thumbnailUrl:
        isImageFileType(file.type) || file.thumbnailUrl ? file.thumbnailUrl ?? null : null,
    })),
  )

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
    setMentionStart((prev) => {
      const changed = prev !== lastAt
      if (changed) setMentionHighlight(0)
      return lastAt
    })
    setMentionFilter((prev) => {
      const changed = prev !== afterAt
      if (changed) setMentionHighlight(0)
      return afterAt
    })
  }

  function syncSlashFromValue(value: string, cursor: number) {
    const before = value.slice(0, cursor)
    const m = before.match(SLASH_COMMAND_RE)
    if (!m) {
      setSlashOpen(false)
      return
    }
    const nextFilter = m[1] ?? ''
    setSlashOpen(true)
    setSlashFilter((prev) => {
      const changed = prev !== nextFilter
      if (changed) setSlashHighlight(0)
      return nextFilter
    })
  }

  function syncMentionFromTextarea() {
    const ta = textareaRef.current
    if (!ta) return
    syncMentionFromValue(ta.value, ta.selectionStart)
  }

  function activateStudyMode(mode: 'quiz' | 'flashcards', value?: string, cursor?: number) {
    stopSpeechOutput()
    const base = value ?? query
    const next = stripFlashcardsTokenAnywhere(
      stripQuizTokenAnywhere(
        stripTrailingSlashCommandAtCursor(base, cursor ?? base.length),
      ),
    )
    setInteractionMode(mode)
    setInteractionModeSource('manual')
    setSuppressAutoFeatureEnable(false)
    setQuery(next)
    setSlashOpen(false)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const pos = next.length
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  function activateAudioMode() {
    stopSpeechOutput()
    const next = stripFlashcardsTokenAnywhere(stripQuizTokenAnywhere(query))
    setInteractionMode('audio')
    setInteractionModeSource('manual')
    setSuppressAutoFeatureEnable(false)
    setQuery(next)
    setSlashOpen(false)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const pos = next.length
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  function clearInteractionMode() {
    stopSpeechOutput()
    setInteractionMode(null)
    setInteractionModeSource(null)
    setSuppressAutoFeatureEnable(true)
    const next = stripFlashcardsTokenAnywhere(stripQuizTokenAnywhere(query))
    setQuery(next)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const pos = next.length
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  function applySlashCommand(
    cmd: SlashCommand,
    value?: string,
    cursor?: number,
  ) {
    if (cmd.command === QUIZ_COMMAND) {
      activateStudyMode('quiz', value, cursor)
      return
    }
    if (cmd.command === FLASHCARDS_COMMAND) {
      activateStudyMode('flashcards', value, cursor)
      return
    }
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

  async function submitUserMessage(rawDisplayQuery: string) {
    const q = rawDisplayQuery.trim()
    if (!q || sending || hydrating) return
    if (!conversationId) {
      toast.error('Conversation is not ready yet. Please try again in a moment.')
      return
    }

    const mentionInfo = parseMentionedFiles(q, workspaceFiles)
    setSending(true)
    setMentionOpen(false)
    setSlashOpen(false)

    const normalizedQuestion = mentionInfo.normalizedQuestion || q
    const inferredStudyIntent =
      interactionMode === 'quiz' || interactionMode === 'flashcards'
        ? interactionMode
        : inferStudyIntent(normalizedQuestion)
    const featureUsed: ChatTurn['featureUsed'] =
      inferredStudyIntent ?? (interactionModeRef.current === 'audio' ? 'audio' : undefined)
    setTurns((prev) => [...prev, { role: 'user', text: q, featureUsed }])
    const wireQuestion =
      inferredStudyIntent === 'quiz'
        ? `${QUIZ_COMMAND} ${normalizedQuestion}`
        : inferredStudyIntent === 'flashcards'
          ? `${FLASHCARDS_COMMAND} ${normalizedQuestion}`
          : normalizedQuestion
    const askQuery = buildAskQuery(wireQuestion, mentionInfo.fileNames)
    const fileIds = mentionInfo.fileIds.length ? mentionInfo.fileIds : undefined

    try {
      const res = await postAsk({
        query: askQuery,
        displayQuery: q,
        ...(featureUsed ? { feature: featureUsed } : {}),
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
          ...(featureUsed ? { featureUsed } : {}),
        },
      ])
      if (interactionModeRef.current === 'audio') {
        const out = textForSpeechOutput(res.answer)
        if (out) speakPlainText(out)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      toast.error(msg)
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong. Try again.' },
      ])
      if (interactionModeRef.current === 'audio') {
        speakPlainText('Something went wrong. Try again.')
      }
    } finally {
      setSending(false)
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
    setQuery('')
    await submitUserMessage(q)
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen && filteredSlashCommands.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashHighlight((i) => (i + 1) % filteredSlashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashHighlight((i) => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        applySlashCommand(
          filteredSlashCommands[slashHighlight]!,
          e.currentTarget.value,
          e.currentTarget.selectionStart,
        )
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashOpen(false)
        return
      }
    }

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
    if (!mentionOpen && !slashOpen && e.key === 'Enter' && !e.shiftKey) {
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
    let quizMessageId = turn.id
    const quizId = turn.payload?.kind === 'quiz' ? turn.payload.quizId : undefined
    if (!quizMessageId && quizId) {
      try {
        const snapshot = await fetchCurrentWorkspaceConversation(workspaceId)
        const matched = [...snapshot.messages]
          .reverse()
          .find(
            (m) =>
              m.role === 'assistant' &&
              !!m.payload &&
              m.payload.kind === 'quiz' &&
              m.payload.quizId === quizId,
          )
        quizMessageId = matched?.id
      } catch {
        // fall through to standard error below
      }
    }
    if (!quizMessageId) {
      toast.error('Quiz message reference is missing.')
      return
    }
    try {
      const result = await postQuizSubmit({
        conversationId,
        quizMessageId,
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
              className={`max-w-[min(100%,42rem)] rounded-xl px-3 py-2 text-left text-sm leading-relaxed ${
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
                  {t.payload?.kind === 'quiz_result' ? (
                    <ChatQuizResultCard result={t.payload} />
                  ) : t.payload?.kind === 'flashcards' ? (
                    <ChatFlashcardsCard deck={t.payload} />
                  ) : (
                    <ChatAnswerContent text={t.text} sources={t.sources ?? []} />
                  )}
                  {t.featureUsed === 'audio' ? <ChatSummaryAudioPlayer sources={t.sources ?? []} /> : null}
                  {t.payload && t.payload.kind === 'quiz' ? (
                    <ChatQuizCard
                      quiz={t.payload}
                      disabled={sending || hydrating}
                      result={quizResultById.get(t.payload.quizId)}
                      submission={quizSubmissionById.get(t.payload.quizId)}
                      onSubmit={(answers) => handleQuizSubmit(t, answers)}
                    />
                  ) : null}
                  <ChatSourceFileChips sources={t.sources ?? []} />
                </>
              ) : (
                <>
                  {t.featureUsed ? (
                    <div className="mb-1 flex justify-end">
                      <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white">
                        {t.featureUsed}
                      </span>
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap">
                    {renderTextWithMentionHighlights(
                      t.text,
                      true,
                      workspaceFiles,
                      mentionThumbnailUrls,
                    )}
                  </p>
                </>
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

        {slashOpen && filteredSlashCommands.length > 0 ? (
          <div
            className="absolute bottom-full left-3 right-3 z-10 mb-1 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-md"
            role="listbox"
            aria-label="Commands"
          >
            {filteredSlashCommands.map((cmd, idx) => (
              <button
                key={cmd.command}
                type="button"
                role="option"
                aria-selected={idx === slashHighlight}
                className={`flex w-full flex-col px-3 py-2 text-left ${
                  idx === slashHighlight ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                }`}
                onMouseDown={(ev) => ev.preventDefault()}
                onMouseEnter={() => setSlashHighlight(idx)}
                onClick={() => applySlashCommand(cmd)}
              >
                <span className="text-sm font-medium text-neutral-900">{cmd.command}</span>
                <span className="text-xs text-neutral-500">{cmd.description}</span>
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

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => activateStudyMode('quiz')}
            className={[
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              isQuizMode
                ? 'border-violet-300 bg-violet-100 text-violet-800'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100',
            ].join(' ')}
          >
            {isQuizMode ? 'Quiz Mode On' : 'Quiz'}
          </button>
          <button
            type="button"
            onClick={() => activateStudyMode('flashcards')}
            className={[
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              isFlashcardsMode
                ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100',
            ].join(' ')}
          >
            {isFlashcardsMode ? 'Flashcards Mode On' : 'Flashcards'}
          </button>
          <button
            type="button"
            onClick={() => activateAudioMode()}
            className={[
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              isAudioMode
                ? 'border-sky-300 bg-sky-100 text-sky-900'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100',
            ].join(' ')}
            title="Read assistant responses aloud"
          >
            {isAudioMode ? 'Audio Mode On' : 'Audio'}
          </button>
          {hasInteractionMode ? (
            <button
              type="button"
              onClick={() => clearInteractionMode()}
              className={[
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                isAudioMode
                  ? 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100'
                  : isFlashcardsMode
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100',
              ].join(' ')}
              title="Turn off this mode"
            >
              {isAudioMode ? 'Audio ×' : isQuizMode ? 'Quiz ×' : 'Flashcards ×'}
            </button>
          ) : null}
        </div>

        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => {
              const value = e.target.value
              const cursor = e.target.selectionStart
              const hasQuizToken = QUIZ_TOKEN_RE.test(value)
              const hasFlashcardsToken = FLASHCARDS_TOKEN_RE.test(value)
              QUIZ_TOKEN_RE.lastIndex = 0
              FLASHCARDS_TOKEN_RE.lastIndex = 0
              const cleaned = stripFlashcardsTokenAnywhere(stripQuizTokenAnywhere(value))
              if (hasFlashcardsToken) {
                stopSpeechOutput()
                setInteractionMode('flashcards')
                setInteractionModeSource('manual')
                setSuppressAutoFeatureEnable(false)
              } else if (hasQuizToken) {
                stopSpeechOutput()
                setInteractionMode('quiz')
                setInteractionModeSource('manual')
                setSuppressAutoFeatureEnable(false)
              } else {
                const inferredFeature =
                  !suppressAutoFeatureEnable ? inferFeatureFromInput(cleaned) : null
                if (inferredFeature) {
                  setInteractionMode(inferredFeature)
                  setInteractionModeSource('auto')
                } else if (interactionModeSource === 'auto') {
                  setInteractionMode(null)
                  setInteractionModeSource(null)
                }
              }
              if (!cleaned.trim()) {
                setSuppressAutoFeatureEnable(false)
                if (interactionModeSource === 'auto') {
                  setInteractionMode(null)
                  setInteractionModeSource(null)
                }
              }
              setQuery(cleaned)
              const nextCursor = Math.min(cursor, cleaned.length)
              syncMentionFromValue(cleaned, nextCursor)
              syncSlashFromValue(cleaned, nextCursor)
            }}
            onKeyUp={() => {
              syncMentionFromTextarea()
              const ta = textareaRef.current
              if (!ta) return
              syncSlashFromValue(ta.value, ta.selectionStart)
            }}
            onClick={() => {
              syncMentionFromTextarea()
              const ta = textareaRef.current
              if (!ta) return
              syncSlashFromValue(ta.value, ta.selectionStart)
            }}
            onSelect={() => {
              syncMentionFromTextarea()
              const ta = textareaRef.current
              if (!ta) return
              syncSlashFromValue(ta.value, ta.selectionStart)
            }}
            onKeyDown={handleTextareaKeyDown}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(FILE_DRAG_MIME)) e.preventDefault()
            }}
            onDrop={handleTextareaDrop}
            placeholder={
              isAudioMode
                ? 'Ask anything — answers are returned as text and audio'
                : 'Ask about these files… (@ to tag, Enter to send)'
            }
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
