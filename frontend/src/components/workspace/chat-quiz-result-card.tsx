import { Fragment } from 'react'
import type { QuizResultPayload } from '../../services/ask-service'

type FeedbackBlock =
  | { kind: 'header'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'numbered'; index: string; text: string }
  | { kind: 'paragraph'; text: string }

const HEADER_RE = /^\*\*\s*(.+?)\s*:?\s*\*\*\s*:?\s*$/
const BULLET_RE = /^[-•*]\s+(.+)$/
const NUMBERED_RE = /^(\d+)[.)]\s+(.+)$/

function parseFeedback(input: string): FeedbackBlock[] {
  const out: FeedbackBlock[] = []
  const lines = input
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (const line of lines) {
    const hdr = line.match(HEADER_RE)
    if (hdr) {
      out.push({ kind: 'header', text: hdr[1]!.trim() })
      continue
    }
    const bullet = line.match(BULLET_RE)
    if (bullet) {
      out.push({ kind: 'bullet', text: bullet[1]!.trim() })
      continue
    }
    const numbered = line.match(NUMBERED_RE)
    if (numbered) {
      out.push({ kind: 'numbered', index: numbered[1]!, text: numbered[2]!.trim() })
      continue
    }
    out.push({ kind: 'paragraph', text: line })
  }
  return out
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      )
    }
    return <Fragment key={i}>{p}</Fragment>
  })
}

export function ChatQuizResultCard({ result }: { result: QuizResultPayload }) {
  const percentage =
    result.total > 0 ? Math.round((result.score / result.total) * 100) : 0
  const tone =
    percentage >= 80
      ? 'emerald'
      : percentage >= 50
      ? 'amber'
      : 'red'

  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
      : tone === 'amber'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-red-50 border-red-200 text-red-900'

  const fillClass =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
      ? 'bg-amber-500'
      : 'bg-red-500'

  const accentDot =
    tone === 'emerald'
      ? 'bg-emerald-400'
      : tone === 'amber'
      ? 'bg-amber-400'
      : 'bg-red-400'

  const blocks = parseFeedback(result.insights)

  return (
    <div className={`mt-2 rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Quiz Result</p>
          <p className="text-xs opacity-80">
            Score: {result.score}/{result.total}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl leading-none font-bold">{percentage}%</p>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
        <div
          className={`h-full rounded-full transition-all duration-500 ${fillClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="mt-3 rounded-md border border-white/70 bg-white/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
          Feedback
        </p>
        {blocks.length === 0 ? (
          <p className="mt-2 text-xs">{result.insights}</p>
        ) : (
          <div className="mt-2 space-y-1.5 text-xs leading-relaxed">
            {blocks.map((block, i) => {
              if (block.kind === 'header') {
                return (
                  <p
                    key={i}
                    className="mt-2 text-[11px] font-semibold uppercase tracking-wide opacity-80 first:mt-0"
                  >
                    {block.text}
                  </p>
                )
              }
              if (block.kind === 'bullet') {
                return (
                  <div key={i} className="flex gap-2 pl-1">
                    <span
                      aria-hidden
                      className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${accentDot}`}
                    />
                    <span className="min-w-0 flex-1">{renderInline(block.text)}</span>
                  </div>
                )
              }
              if (block.kind === 'numbered') {
                return (
                  <div key={i} className="flex gap-2 pl-1">
                    <span className="shrink-0 font-semibold tabular-nums opacity-80">
                      {block.index}.
                    </span>
                    <span className="min-w-0 flex-1">{renderInline(block.text)}</span>
                  </div>
                )
              }
              return (
                <p key={i} className="pl-1">
                  {renderInline(block.text)}
                </p>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
