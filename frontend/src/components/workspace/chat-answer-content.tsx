import { useMemo } from 'react'
import { fileIcon } from '../../utils/file-display'
import { openKnownFile } from '../../hooks/use-open-file'
import { useImageThumbnailUrls } from '../../hooks/use-image-thumbnail-urls'
import type { AskSource } from '../../services/ask-service'

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

function FileRefChip({
  displayName,
  fileId,
  previewUrl,
}: {
  displayName: string
  fileId: string | undefined
  previewUrl?: string
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
      className={`mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 align-middle text-xs font-medium text-neutral-800 shadow-sm transition-colors ${
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
          />
        )
      })}
    </div>
  )
}

// unique source files as chips below the answer (dedup by fileId)
export function ChatSourceFileChips({ sources }: { sources: AskSource[] }) {
  const unique = useMemo(() => {
    const byId = new Map<string, AskSource>()
    for (const s of sources) {
      if (!byId.has(s.fileId)) byId.set(s.fileId, s)
    }
    return [...byId.values()]
  }, [sources])
  const thumbnailUrls = useImageThumbnailUrls(
    unique.map((s) => ({
      fileId: s.fileId,
      type: isImageFileName(s.fileName) ? 'image' : 'file',
      thumbnailUrl: null,
    })),
  )

  if (unique.length === 0) return null

  return (
    <div className="mt-3 border-t border-neutral-200 pt-3">
      <p className="mb-2 text-xs font-medium text-neutral-500">Sources</p>
      <div className="flex flex-wrap gap-2">
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
