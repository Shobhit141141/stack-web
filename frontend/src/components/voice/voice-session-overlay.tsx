import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowsRightLeft,
  HiOutlineChevronDown,
  HiOutlineDocumentDuplicate,
  HiOutlineMicrophone,
  HiOutlineTrash,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { openKnownFile } from '../../hooks/use-open-file'
import type {
  VapiStatus,
  VoicePendingMove,
  VoicePendingNewWorkspace,
  VoiceReferredFile,
  VoiceTurn,
} from '../../hooks/use-vapi'
import type { WorkspaceItem } from '../../services/workspace-service'

// Escape regex metacharacters so user filenames can be matched literally.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fileIconForName(name: string): string {
  const l = name.toLowerCase()
  if (l.endsWith('.pdf')) return '/icons/pdf.svg'
  if (l.endsWith('.docx') || l.endsWith('.doc')) return '/icons/docx-file.svg'
  if (
    l.endsWith('.png') ||
    l.endsWith('.jpg') ||
    l.endsWith('.jpeg') ||
    l.endsWith('.webp') ||
    l.endsWith('.gif') ||
    l.endsWith('.bmp') ||
    l.endsWith('.svg') ||
    l.endsWith('.avif') ||
    l.endsWith('.heic') ||
    l.endsWith('.heif')
  ) {
    return '/icons/image.png'
  }
  return '/icons/cloud.svg'
}

// Replace any occurrence of a referred-file name in the assistant text with an
// inline chip (icon + name). Matching is case-insensitive on the longest names
// first so e.g. "world-history.pdf" wins over "world.pdf" if both are sources.
function renderTextWithVoiceFileChips(
  text: string,
  files: VoiceReferredFile[],
): React.ReactNode {
  if (!text) return null
  if (files.length === 0) return text
  const sorted = [...files].sort((a, b) => b.fileName.length - a.fileName.length)
  const pattern = sorted.map((f) => escapeRegex(f.fileName)).join('|')
  if (!pattern) return text
  const re = new RegExp(`(${pattern})`, 'gi')
  const parts = text.split(re)
  const byNameLower = new Map<string, VoiceReferredFile>()
  for (const f of files) byNameLower.set(f.fileName.toLowerCase(), f)
  return parts.map((part, idx) => {
    if (!part) return null
    const file = byNameLower.get(part.toLowerCase())
    if (!file) return <Fragment key={`${idx}-t`}>{part}</Fragment>
    return (
      <span
        key={`${idx}-c-${file.fileId}`}
        role="button"
        tabIndex={0}
        onClick={() => {
          void openKnownFile(file.fileId, file.fileName)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            void openKnownFile(file.fileId, file.fileName)
          }
        }}
        className="mx-0.5 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 align-middle text-xs font-semibold text-white/95 transition-colors hover:bg-white/20"
        title={`Open ${file.fileName}`}
      >
        <img src={fileIconForName(file.fileName)} alt="" className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{file.fileName}</span>
      </span>
    )
  })
}

const MOVE_PLACEHOLDER = ''
const MOVE_UNASSIGNED = '__unassigned__'

type Props = {
  status: VapiStatus
  userText: string
  assistantText: string
  assistantStreaming: boolean
  turns: VoiceTurn[]
  referredFiles: VoiceReferredFile[]
  workspaces: WorkspaceItem[]
  pendingMove: VoicePendingMove | null
  pendingNewWorkspace: VoicePendingNewWorkspace | null
  /** end voice session and tear down the realtime connection */
  onClose: () => void
  onDownloadFile: (fileId: string) => void
  onCopyFileLink: (fileId: string) => void
  onDeleteFile: (fileId: string, fileName: string) => void
  onMoveFile: (
    fileId: string,
    fileName: string,
    targetWorkspaceId: string | null,
    successMessage?: string,
  ) => void
  onDismissPendingMove: () => void
  onConfirmPendingNewWorkspace: (overrideName?: string) => void
  onDismissPendingNewWorkspace: () => void
}

const CONNECTING_CHATTER = [
  'Warming up the line…',
  'Finding a quiet lane…',
  'Syncing with Stack…',
  'Almost there…',
  'Negotiating audio…',
  'Handshaking with assistants…',
  'Polishing the waveform…',
  'Stretching the cables (virtually)…',
  'Teaching pixels to dance…',
  'Convincing electrons to cooperate…',
  'Calibrating good vibes…',
  'One more hop…',
  'Buffering optimism…',
  'Still faster than a meeting…',
  'Hang tight…',
] as const

function pickRandomConnectingLine(exclude?: string): string {
  const pool =
    exclude && CONNECTING_CHATTER.length > 1
      ? CONNECTING_CHATTER.filter((s) => s !== exclude)
      : [...CONNECTING_CHATTER]
  return pool[Math.floor(Math.random() * pool.length)]!
}

// full-screen voice session: blurred backdrop, morphing gradient blob, glass transcript (no per-chunk remount — text updates in place for streaming)
export function VoiceSessionOverlay({
  status,
  userText,
  assistantText,
  assistantStreaming,
  turns,
  referredFiles,
  workspaces,
  pendingMove,
  pendingNewWorkspace,
  onClose,
  onDownloadFile,
  onCopyFileLink,
  onDeleteFile,
  onMoveFile,
  onDismissPendingMove,
  onConfirmPendingNewWorkspace,
  onDismissPendingNewWorkspace,
}: Props) {
  const isConnecting = status === 'connecting'
  const scrollRef = useRef<HTMLDivElement>(null)
  const [connectingLine, setConnectingLine] = useState(() => pickRandomConnectingLine())
  const [referencesExpanded, setReferencesExpanded] = useState(false)

  // RAG can retrieve files the user did not actually ask about; only show the
  // files the assistant explicitly named in its spoken answer. If the assistant
  // didn't name any source by file name (rare), fall back to the full list so
  // we never silently hide information.
  const displayedFiles = useMemo(() => {
    if (referredFiles.length === 0) return referredFiles
    const haystack = [
      ...turns.filter((t) => t.role === 'assistant').map((t) => t.text),
      assistantText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystack) return referredFiles
    const named = referredFiles.filter((f) =>
      haystack.includes(f.fileName.toLowerCase()),
    )
    return named.length > 0 ? named : referredFiles
  }, [referredFiles, turns, assistantText])

  // Auto-expand the references section the first time files are referenced
  // in a session, then leave the user in control.
  const lastFileCountRef = useRef(0)
  useEffect(() => {
    const prev = lastFileCountRef.current
    if (displayedFiles.length > 0 && prev === 0) {
      setReferencesExpanded(true)
    }
    lastFileCountRef.current = displayedFiles.length
  }, [displayedFiles.length])

  useEffect(() => {
    if (!isConnecting) return
    setConnectingLine(pickRandomConnectingLine())
    const id = window.setInterval(() => {
      setConnectingLine((prev) => pickRandomConnectingLine(prev))
    }, 2400)
    return () => window.clearInterval(id)
  }, [isConnecting])

  // auto-scroll when new turns arrive or live text updates
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [
    turns,
    userText,
    assistantText,
    referredFiles,
    pendingMove,
    pendingNewWorkspace,
  ])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Voice session"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-70"
    >
      <div className="absolute inset-0 bg-neutral-950/50 backdrop-blur-2xl backdrop-saturate-150" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-1/2 top-[32%] h-[min(85vw,440px)] w-[min(85vw,440px)] -translate-x-1/2 -translate-y-1/2 bg-linear-to-br from-sky-400/75 via-indigo-500/80 to-fuchsia-500/75 opacity-90"
          animate={{
            borderRadius: [
              '42% 58% 62% 38% / 48% 42% 58% 52%',
              '58% 42% 38% 62% / 52% 58% 42% 48%',
              '38% 62% 48% 52% / 42% 48% 58% 52%',
              '42% 58% 62% 38% / 48% 42% 58% 52%',
            ],
            rotate: [0, 6, -4, 2, 0],
            scale: [1, 1.06, 0.98, 1.04, 1],
          }}
          transition={{
            duration: isConnecting ? 5 : 14,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ filter: 'blur(48px)' }}
        />
        <motion.div
          className="absolute left-1/2 top-[32%] h-[min(55vw,280px)] w-[min(55vw,280px)] -translate-x-1/2 -translate-y-1/2 bg-linear-to-tr from-white/40 via-violet-200/50 to-transparent"
          animate={{
            borderRadius: [
              '50% 50% 50% 50%',
              '55% 45% 48% 52%',
              '48% 52% 55% 45%',
              '50% 50% 50% 50%',
            ],
            rotate: [0, -10, 8, 0],
            scale: [1, 1.12, 1.08, 1],
          }}
          transition={{
            duration: isConnecting ? 3.5 : 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{ filter: 'blur(28px)' }}
        />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-[32%] -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full border border-white/25 bg-white/10 shadow-[0_0_60px_rgba(139,92,246,0.35)] backdrop-blur-md"
          animate={{
            scale: isConnecting ? [1, 1.08, 1] : [1, 1.03, 1],
            boxShadow: isConnecting
              ? [
                  '0 0 40px rgba(139,92,246,0.25)',
                  '0 0 72px rgba(139,92,246,0.45)',
                  '0 0 40px rgba(139,92,246,0.25)',
                ]
              : [
                  '0 0 50px rgba(139,92,246,0.3)',
                  '0 0 70px rgba(236,72,153,0.25)',
                  '0 0 50px rgba(139,92,246,0.3)',
                ],
          }}
          transition={{ duration: isConnecting ? 1.2 : 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <HiOutlineMicrophone className="size-10 text-white/90" aria-hidden />
        </motion.div>
      </div>

      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[72vh] flex-col items-center gap-4 px-4 pb-8 pt-4 md:px-8">
        <div className="flex w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-white/20 bg-linear-to-b from-white/14 to-white/5 px-5 py-5 shadow-[0_25px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:px-7 md:py-6">
          {isConnecting ? (
            <div className="space-y-2 text-center">
              <p className="text-sm font-medium tracking-wide text-white/90">
                Connecting…
              </p>
              <p className="min-h-5 text-xs text-white/65 transition-opacity duration-300">
                {connectingLine}
              </p>
            
            </div>
          ) : null}

          {/* Conversation history — auto-sized so the card starts compact and grows
              with content; capped + internal scroll so it never pushes the card past
              the viewport (parent caps total at 72vh). */}
          <div
            ref={scrollRef}
            className="mt-2 min-h-0 max-h-[42vh] flex-1 space-y-3 overflow-y-auto pr-1"
          >
            {turns.length === 0 && !isConnecting && !userText.trim() && !assistantText.trim() && (
              <p className="text-center text-sm text-white/55">
                Speak or wait for the assistant…
              </p>
            )}

            {turns.map((turn) => (
              <div key={turn.id}>
                <p className={`mb-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                  turn.role === 'user' ? 'text-amber-200/90' : 'text-violet-200/90'
                }`}>
                  {turn.role === 'user' ? 'You' : 'Stack'}
                </p>
                <p className="text-[15px] leading-relaxed text-white/90">
                  {turn.role === 'assistant'
                    ? renderTextWithVoiceFileChips(turn.text, displayedFiles)
                    : turn.text}
                </p>
              </div>
            ))}

            {/* Live partial — current user speech */}
            {userText.trim() && !turns.some((t) => t.text === userText.trim()) ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/90">
                  You
                </p>
                <p className="text-[15px] leading-relaxed text-white/95">
                  {userText}
                </p>
              </div>
            ) : null}

            {/* Assistant thinking/speaking indicator — dots while streaming, no partial text */}
            {assistantStreaming ? (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-200/90">
                  Stack
                </p>
                <span className="inline-flex items-center gap-1.5 py-1">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="h-2 w-2 rounded-full bg-violet-300 motion-safe:animate-bounce"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </span>
              </div>
            ) : null}
          </div>

          {displayedFiles.length > 0 ? (
            <div className="mt-4 shrink-0 flex flex-col border-t border-white/15 pt-4">
              <button
                type="button"
                onClick={() => setReferencesExpanded((v) => !v)}
                aria-expanded={referencesExpanded}
                aria-controls="voice-referenced-files-list"
                className="mb-2 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left text-[10px] font-bold uppercase tracking-[0.2em] text-white/55 transition-colors hover:text-white/85"
              >
                <span className="inline-flex items-center gap-1.5">
                  Referenced files
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] tracking-normal text-white/85"
                  >
                    {displayedFiles.length}
                  </span>
                </span>
                <HiOutlineChevronDown
                  aria-hidden
                  className={`size-3.5 transition-transform duration-200 ${referencesExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              {referencesExpanded ? (
                <p className="mb-3 text-xs leading-snug text-white/60">
                  Say “download”, “copy link”, “delete”, or “move” — or use the actions below.
                </p>
              ) : null}
              <ul
                id="voice-referenced-files-list"
                hidden={!referencesExpanded}
                className="flex flex-col gap-3"
              >
                {displayedFiles.map((f) => {
                  const currentWid = f.workspaceId ?? null
                  const moveOptions = workspaces.filter(
                    (w) => w.id !== currentWid,
                  )
                  const canUnassign = currentWid !== null
                  return (
                  <li
                    key={f.fileId}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5"
                  >
                    <p className="truncate text-sm font-medium text-white/95" title={f.fileName}>
                      {f.fileName}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onDownloadFile(f.fileId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15"
                      >
                        <HiOutlineArrowDownTray className="size-3.5" aria-hidden />
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => onCopyFileLink(f.fileId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/15"
                      >
                        <HiOutlineDocumentDuplicate className="size-3.5" aria-hidden />
                        Copy link
                      </button>
                      {moveOptions.length > 0 || canUnassign ? (
                        <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-xs font-medium text-white/90">
                          <HiOutlineArrowsRightLeft className="size-3.5 shrink-0" aria-hidden />
                          <select
                            className="min-w-0 max-w-[min(200px,70vw)] cursor-pointer truncate bg-transparent text-xs font-medium text-white/95 outline-none"
                            defaultValue={MOVE_PLACEHOLDER}
                            aria-label={`Move ${f.fileName} to workspace`}
                            onChange={(e) => {
                              const sel = e.currentTarget
                              const v = sel.value
                              if (!v) return
                              const target = v === MOVE_UNASSIGNED ? null : v
                              const wsName = workspaces.find((w) => w.id === v)?.name
                              const successMessage =
                                v === MOVE_UNASSIGNED
                                  ? `${f.fileName} is now unassigned`
                                  : wsName
                                    ? `Moved to ${wsName}`
                                    : undefined
                              onMoveFile(f.fileId, f.fileName, target, successMessage)
                              sel.selectedIndex = 0
                            }}
                          >
                            <option value={MOVE_PLACEHOLDER} disabled>
                              Move to…
                            </option>
                            {canUnassign ? (
                              <option value={MOVE_UNASSIGNED}>Unassigned</option>
                            ) : null}
                            {moveOptions.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            typeof window !== 'undefined' &&
                            window.confirm(`Delete “${f.fileName}”?`)
                          ) {
                            onDeleteFile(f.fileId, f.fileName)
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/35 bg-red-500/15 px-2.5 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/25"
                      >
                        <HiOutlineTrash className="size-3.5" aria-hidden />
                        Delete
                      </button>
                    </div>
                    {pendingMove && pendingMove.fileId === f.fileId ? (
                      <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                          Pick a workspace
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {canUnassign ? (
                            <button
                              type="button"
                              onClick={() =>
                                onMoveFile(
                                  f.fileId,
                                  f.fileName,
                                  null,
                                  `${f.fileName} is now unassigned`,
                                )
                              }
                              className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 hover:bg-white/20"
                            >
                              Remove from workspace
                            </button>
                          ) : null}
                          {pendingMove.workspaces
                            .filter((w) => w.id !== currentWid)
                            .map((w) => (
                              <button
                                key={w.id}
                                type="button"
                                onClick={() =>
                                  onMoveFile(f.fileId, f.fileName, w.id, `Moved to ${w.name}`)
                                }
                                className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 hover:bg-white/20"
                              >
                                {w.name}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={onDismissPendingMove}
                            className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {pendingNewWorkspace &&
                    pendingNewWorkspace.fileId === f.fileId ? (
                      <NewWorkspaceConfirmPanel
                        fileName={f.fileName}
                        initialName={pendingNewWorkspace.proposedName}
                        onConfirm={onConfirmPendingNewWorkspace}
                        onCancel={onDismissPendingNewWorkspace}
                      />
                    ) : null}
                  </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-full border border-white/25 bg-white/95 px-6 py-3 text-sm font-semibold text-neutral-900 shadow-lg transition hover:bg-white"
          >
            <HiOutlineXMark className="size-4" aria-hidden />
            {isConnecting ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function NewWorkspaceConfirmPanel({
  fileName,
  initialName,
  onConfirm,
  onCancel,
}: {
  fileName: string
  initialName: string
  onConfirm: (overrideName?: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const trimmed = name.trim()
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
        Create workspace and move
      </p>
      <p className="text-xs leading-snug text-white/75">
        Create a new workspace and move{' '}
        <span className="font-semibold text-white/95">{fileName}</span> into it.
        Confirm the name or fix the spelling.
      </p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="New workspace name"
        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/40"
        placeholder="Workspace name"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!trimmed}
          onClick={() => onConfirm(trimmed)}
          className="rounded-full border border-white/25 bg-white/20 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-white/30"
        >
          Create &amp; move
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
