import type { QuizResultPayload } from '../../services/ask-service'

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

  const bullets = result.insights
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

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

      <div className="mt-3 rounded-md border border-white/70 bg-white/60 p-2">
        <p className="text-xs font-semibold">Feedback</p>
        {bullets.length > 0 ? (
          <ul className="mt-1 space-y-1 text-xs">
            {bullets.map((line, i) => (
              <li key={i}>• {line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs">{result.insights}</p>
        )}
      </div>
    </div>
  )
}
