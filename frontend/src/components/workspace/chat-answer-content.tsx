import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { HiMiniPause, HiMiniPlay } from 'react-icons/hi2'
import { fileIcon } from '../../utils/file-display'
import { openKnownFile } from '../../hooks/use-open-file'
import { useImageThumbnailUrls } from '../../hooks/use-image-thumbnail-urls'
import type { AskSource } from '../../services/ask-service'
import { fetchFileSummarySpeechAudio } from '../../services/file-service'

const FILE_REF_RE = /\[File:\s*([^\]]+?)\s*\]/g

function iconSrcForFileName(name: string): string {
  const l = name.toLowerCase()
  if (l.endsWith('.pdf')) return fileIcon('pdf')
  if (l.endsWith('.docx')) return fileIcon('docx')
  return fileIcon('file')
}

function isImageFileName(name: string): boolean {
  const l = name.toLowerCase()
  return (
    l.endsWith('.jpg') ||
    l.endsWith('.jpeg') ||
    l.endsWith('.png') ||
    l.endsWith('.webp') ||
    l.endsWith('.gif')
  )
}

function buildNameToFileId(sources: AskSource[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const s of sources) {
    const key = s.fileName.trim()
    if (key && !m.has(key)) {
      m.set(key, s.fileId)
    }
  }
  return m
}

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'file'; displayName: string }

function parseAnswerIntoSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  const re = new RegExp(FILE_REF_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'text', value: text.slice(last, m.index) })
    }
    segments.push({ kind: 'file', displayName: m[1]!.trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) {
    segments.push({ kind: 'text', value: text.slice(last) })
  }
  return segments
}

function formatAudioClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const rounded = Math.floor(totalSeconds)
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function dedupeSources(sources: AskSource[]): AskSource[] {
  const byId = new Map<string, AskSource>()
  for (const s of sources) {
    if (!byId.has(s.fileId)) byId.set(s.fileId, s)
  }
  return [...byId.values()]
}

function FileRefChip({
  displayName,
  fileId,
  previewUrl,
  inlineInText = false,
}: {
  displayName: string
  fileId: string | undefined
  previewUrl?: string
  /** when true, add horizontal margin for inline answer text; list rows use flush alignment */
  inlineInText?: boolean
}) {
  const icon = iconSrcForFileName(displayName)
  const enabled = Boolean(fileId)

  return (
    <button
      type="button"
      disabled={!enabled}
      title={enabled ? `Open ${displayName}` : displayName}
      onClick={() => {
        if (fileId) void openKnownFile(fileId, displayName)
      }}
      className={`${inlineInText ? 'mx-0.5' : ''} inline-flex max-w-full items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 align-middle text-xs font-medium text-neutral-800 shadow-sm transition-colors outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/80 focus-visible:ring-offset-1 ${
        enabled
          ? 'cursor-pointer hover:border-neutral-300 hover:bg-neutral-50'
          : 'cursor-default opacity-70'
      }`}
    >
      <img
        src={previewUrl ?? icon}
        alt=""
        className={[
          'shrink-0',
          previewUrl ? 'size-4 rounded object-cover' : 'size-3.5',
        ].join(' ')}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          e.currentTarget.src = icon
        }}
      />
      <span className="max-w-56 truncate">{displayName}</span>
    </button>
  )
}

type Props = {
  text: string
  sources: AskSource[]
}

// renders assistant answer: [File: name] becomes pdf-style chips that open the file when fileId is known
export function ChatAnswerContent({ text, sources }: Props) {
  const nameToId = useMemo(() => buildNameToFileId(sources), [sources])
  const segments = useMemo(() => parseAnswerIntoSegments(text), [text])
  const thumbnailUrls = useImageThumbnailUrls(
    sources.map((s) => ({
      fileId: s.fileId,
      // use filename as type signal for image extension detection in this hook flow
      type: isImageFileName(s.fileName) ? 'image' : 'file',
      thumbnailUrl: null,
    })),
  )

  if (segments.length === 0) {
    return <span className="whitespace-pre-wrap">{text}</span>
  }

  return (
    <div className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <span key={i}>{seg.value}</span>
        }
        const id = nameToId.get(seg.displayName)
        return (
          <FileRefChip
            key={i}
            displayName={seg.displayName}
            fileId={id}
            previewUrl={id ? thumbnailUrls.get(id) : undefined}
            inlineInText
          />
        )
      })}
    </div>
  )
}

// unique source files as chips below the answer (dedup by fileId)
export function ChatSourceFileChips({ sources }: { sources: AskSource[] }) {
  const unique = useMemo(() => dedupeSources(sources), [sources])
  const thumbnailUrls = useImageThumbnailUrls(
    unique.map((s) => ({
      fileId: s.fileId,
      type: isImageFileName(s.fileName) ? 'image' : 'file',
      thumbnailUrl: null,
    })),
  )

  if (unique.length === 0) return null

  return (
    <div className="mt-3 w-full border-t border-neutral-200 pt-3">
      <p className="mb-2 text-xs font-medium text-neutral-500">Sources</p>
      <div className="flex flex-wrap items-center gap-2">
        {unique.map((s) => (
          <FileRefChip
            key={s.fileId}
            displayName={s.fileName}
            fileId={s.fileId}
            previewUrl={thumbnailUrls.get(s.fileId)}
          />
        ))}
      </div>
    </div>
  )
}

const AUDIO_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const

// caches blob URLs per file so chat remounts / multiple messages do not re-hit TTS
const summarySpeechUrlByFileId = new Map<string, string>()
const summarySpeechPromiseByFileId = new Map<string, Promise<string>>()

async function getCachedSummarySpeechUrl(fileId: string): Promise<string> {
  const hit = summarySpeechUrlByFileId.get(fileId)
  if (hit) return hit
  const inflight = summarySpeechPromiseByFileId.get(fileId)
  if (inflight) return inflight
  const p = (async () => {
    try {
      const { url } = await fetchFileSummarySpeechAudio(fileId)
      summarySpeechUrlByFileId.set(fileId, url)
      return url
    } finally {
      summarySpeechPromiseByFileId.delete(fileId)
    }
  })()
  summarySpeechPromiseByFileId.set(fileId, p)
  return p
}

export function ChatSummaryAudioPlayer({ sources }: { sources: AskSource[] }) {
  const unique = useMemo(() => dedupeSources(sources), [sources])
  const [selectedFileId, setSelectedFileId] = useState(unique[0]?.fileId ?? '')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [prefetching, setPrefetching] = useState(false)
  const shouldAutoplayRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const firstFileId = unique[0]?.fileId ?? ''
    setSelectedFileId((prev) => (prev && unique.some((s) => s.fileId === prev) ? prev : firstFileId))
  }, [unique])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    shouldAutoplayRef.current = false
    setIsPlaying(false)
    setAudioError(null)
    setAudioLoading(false)
    setCurrentTime(0)
    setDuration(0)
    setPlaybackRate(1)

    if (!selectedFileId) {
      setAudioUrl(null)
      setPrefetching(false)
      return
    }

    const cached = summarySpeechUrlByFileId.get(selectedFileId)
    if (cached) {
      setAudioUrl(cached)
      setPrefetching(false)
      return
    }

    setAudioUrl(null)
    setPrefetching(true)
    const timeout = window.setTimeout(() => {
      void getCachedSummarySpeechUrl(selectedFileId)
        .then((url) => {
          setAudioUrl(url)
          setAudioError(null)
        })
        .catch((e) => {
          setAudioError(e instanceof Error ? e.message : 'Failed to load summary audio')
          shouldAutoplayRef.current = false
        })
        .finally(() => {
          setPrefetching(false)
        })
    }, 220)
    return () => window.clearTimeout(timeout)
  }, [selectedFileId])

  async function ensureAudioLoaded() {
    if (!selectedFileId) return
    const cached = summarySpeechUrlByFileId.get(selectedFileId)
    if (cached) {
      setAudioUrl(cached)
      return
    }
    if (audioUrl) return
    setAudioLoading(true)
    setAudioError(null)
    try {
      const url = await getCachedSummarySpeechUrl(selectedFileId)
      setAudioUrl(url)
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : 'Failed to load summary audio')
      shouldAutoplayRef.current = false
    } finally {
      setAudioLoading(false)
    }
  }

  async function handleTogglePlay() {
    const audio = audioRef.current
    if (audio && !audio.paused) {
      audio.pause()
      return
    }
    shouldAutoplayRef.current = true
    if (!audioUrl) {
      const cached = selectedFileId ? summarySpeechUrlByFileId.get(selectedFileId) : undefined
      if (cached) {
        setAudioUrl(cached)
        return
      }
      await ensureAudioLoaded()
      return
    }
    try {
      await audio?.play()
    } catch {
      setAudioError('Playback was blocked. Click play again.')
      shouldAutoplayRef.current = false
    }
  }

  if (unique.length === 0) return null

  const hasMultipleSources = unique.length > 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="mt-3 rounded-xl border border-neutral-200/90 bg-white/85 px-3 py-2.5 shadow-sm backdrop-blur-[2px]"
    >
      <audio
        ref={audioRef}
        src={audioUrl ?? undefined}
        preload="metadata"
        onLoadedMetadata={() => {
          const audio = audioRef.current
          if (!audio) return
          setDuration(audio.duration || 0)
          setCurrentTime(audio.currentTime || 0)
          audio.playbackRate = playbackRate
          if (shouldAutoplayRef.current) {
            void audio.play().catch(() => {
              setAudioError('Playback was blocked. Click play again.')
            })
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current
          if (!audio) return
          setCurrentTime(audio.currentTime)
        }}
        onPlay={() => {
          shouldAutoplayRef.current = false
          setAudioError(null)
          setIsPlaying(true)
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          const audio = audioRef.current
          setIsPlaying(false)
          setCurrentTime(audio?.duration ?? 0)
        }}
        onError={() => {
          setAudioError('Could not play summary audio')
          shouldAutoplayRef.current = false
          setIsPlaying(false)
        }}
      />
      <div className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => void handleTogglePlay()}
          disabled={audioLoading || !selectedFileId}
          className="col-start-1 row-start-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-800 outline-none [-webkit-tap-highlight-color:transparent] transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={isPlaying ? 'Pause summary audio' : 'Play summary audio'}
        >
          {isPlaying ? <HiMiniPause className="size-4" /> : <HiMiniPlay className="size-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={Math.min(currentTime, duration || 0)}
          step={0.1}
          onChange={(e) => {
            const nextTime = Number(e.target.value)
            setCurrentTime(nextTime)
            const audio = audioRef.current
            if (audio) audio.currentTime = nextTime
          }}
          disabled={!audioUrl || audioLoading || duration <= 0}
          className="col-start-2 row-start-1 h-3 w-full cursor-pointer appearance-none self-center rounded-full bg-transparent outline-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-neutral-200 [&::-moz-range-thumb]:mt-[-2px] [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-neutral-800 [&::-moz-range-thumb]:shadow-none [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-neutral-200 [&::-webkit-slider-thumb]:mt-[-2px] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-neutral-800"
          aria-label="Summary audio progress"
        />
        <select
          id="chat-summary-audio-speed"
          value={String(playbackRate)}
          className="col-start-3 row-start-1 h-8 min-w-13 shrink-0 rounded-lg border border-neutral-200 bg-white px-1.5 text-center text-xs text-neutral-700 outline-none [-webkit-tap-highlight-color:transparent] transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          onChange={(e) => {
            const rate = Number(e.target.value)
            setPlaybackRate(rate)
            const audio = audioRef.current
            if (audio) audio.playbackRate = rate
          }}
          aria-label="Playback speed"
        >
          {AUDIO_SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}x
            </option>
          ))}
        </select>
        <div className="col-start-2 row-start-2 flex w-full items-center justify-between gap-2 text-[11px] tabular-nums text-neutral-500">
          <span>{formatAudioClock(currentTime)}</span>
          <span>{formatAudioClock(duration)}</span>
        </div>
      </div>
      {hasMultipleSources ? (
        <div className="mt-2 flex w-full items-center gap-2">
          <label htmlFor="summary-audio-source" className="shrink-0 text-[11px] text-neutral-500">
            Source
          </label>
          <select
            id="summary-audio-source"
            value={selectedFileId}
            onChange={(e) => setSelectedFileId(e.target.value)}
            className="min-h-7 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-800 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            {unique.map((s) => (
              <option key={s.fileId} value={s.fileId}>
                {s.fileName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {audioLoading || prefetching ? (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <motion.div
            className="h-full w-1/3 rounded-full bg-neutral-300"
            initial={{ x: '-110%' }}
            animate={{ x: '320%' }}
            transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut' }}
          />
        </div>
      ) : null}
      {audioError ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-red-600">{audioError}</p>
          <button
            type="button"
            onClick={() => void ensureAudioLoaded()}
            className="text-[11px] font-medium text-neutral-700 underline"
          >
            Retry
          </button>
        </div>
      ) : null}
    </motion.div>
  )
}
