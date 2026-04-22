import { useMemo, useState } from 'react'
import type {
  QuizPayload,
  QuizResultPayload,
  QuizSubmissionPayload,
} from '../../services/ask-service'

type Props = {
  quiz: QuizPayload
  disabled?: boolean
  onSubmit: (answers: Array<{ questionId: string; selectedOptionId: string }>) => Promise<void>
  result?: QuizResultPayload
  submission?: QuizSubmissionPayload
}

function answersMapFromSubmission(
  submission: QuizSubmissionPayload | undefined,
): Record<string, string> {
  if (!submission) return {}
  return submission.answers.reduce<Record<string, string>>((acc, a) => {
    if (a.selectedOptionId) acc[a.questionId] = a.selectedOptionId
    return acc
  }, {})
}

export function ChatQuizCard({
  quiz,
  disabled = false,
  onSubmit,
  result,
  submission,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    answersMapFromSubmission(submission),
  )
  const [submitting, setSubmitting] = useState(false)
  const reviewMode = Boolean(result)
  const selectedByQuestion = useMemo(
    () => (reviewMode ? answersMapFromSubmission(submission) : answers),
    [reviewMode, submission, answers],
  )
  const answeredCount = quiz.questions.filter((q) => selectedByQuestion[q.questionId]).length
  const total = quiz.questions.length
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0
  const resultByQuestion = useMemo(() => {
    const m = new Map<string, QuizResultPayload['perQuestion'][number]>()
    if (!result) return m
    for (const row of result.perQuestion) m.set(row.questionId, row)
    return m
  }, [result])

  async function submit() {
    if (reviewMode) return
    const payload = quiz.questions
      .map((q) => ({
        questionId: q.questionId,
        selectedOptionId: answers[q.questionId] ?? '',
      }))
      .filter((a) => a.selectedOptionId)
    if (payload.length === 0) return
    setSubmitting(true)
    try {
      await onSubmit(payload)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold text-neutral-900">{quiz.title}</p>
      <p className="mt-1 text-xs text-neutral-500">{quiz.prompt}</p>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-neutral-500">
          <span>{reviewMode ? 'Completed' : 'Progress'}</span>
          <span>
            {answeredCount}/{total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className={[
              'h-full rounded-full transition-all duration-300',
              reviewMode ? 'bg-emerald-500' : 'bg-sky-500',
            ].join(' ')}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {quiz.questions.map((q, idx) => (
          <div key={q.questionId} className="rounded-md border border-neutral-100 bg-neutral-50 p-2">
            <p className="text-sm font-medium text-neutral-900">
              {idx + 1}. {q.prompt}
            </p>
            <div className="mt-2 space-y-1">
              {q.options.map((opt) => {
                const selected = selectedByQuestion[q.questionId] === opt.optionId
                const resultRow = resultByQuestion.get(q.questionId)
                const isCorrect = resultRow?.correctOptionId === opt.optionId
                const isWrongSelected = Boolean(reviewMode && selected && !isCorrect)
                return (
                  <button
                    key={opt.optionId}
                    type="button"
                    disabled={disabled || submitting || reviewMode}
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.questionId]: opt.optionId,
                      }))
                    }
                    className={[
                      'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                      reviewMode && isCorrect
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : reviewMode && isWrongSelected
                        ? 'border-red-300 bg-red-50 text-red-900'
                        : selected
                        ? 'border-sky-300 bg-sky-50 text-sky-900'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100',
                      disabled || submitting || reviewMode ? 'cursor-default' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'inline-flex size-4 items-center justify-center rounded-full border text-[10px] font-semibold',
                        reviewMode && isCorrect
                          ? 'border-emerald-400 text-emerald-700'
                          : reviewMode && isWrongSelected
                          ? 'border-red-400 text-red-700'
                          : selected
                          ? 'border-sky-400 text-sky-700'
                          : 'border-neutral-300 text-neutral-500',
                      ].join(' ')}
                    >
                      {String.fromCharCode(65 + q.options.findIndex((x) => x.optionId === opt.optionId))}
                    </span>
                    <span className="flex-1">{opt.text}</span>
                    {reviewMode && isCorrect ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Correct
                      </span>
                    ) : null}
                    {reviewMode && isWrongSelected ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Your pick
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {reviewMode && resultByQuestion.get(q.questionId) ? (
                <div className="rounded-md border border-neutral-200 bg-white px-2 py-1.5">
                  <p className="text-[11px] font-medium text-neutral-700">
                    Correct answer:{' '}
                    <span className="text-neutral-900">
                      {
                        q.options.find(
                          (opt) =>
                            opt.optionId === resultByQuestion.get(q.questionId)!.correctOptionId,
                        )?.text
                      }
                    </span>
                  </p>
                  {resultByQuestion.get(q.questionId)!.explanation ? (
                    <p className="mt-1 text-[11px] text-neutral-600">
                      {resultByQuestion.get(q.questionId)!.explanation}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || submitting || reviewMode}
        onClick={() => void submit()}
        className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {reviewMode ? 'Submitted' : submitting ? 'Submitting...' : 'Submit quiz'}
      </button>
    </div>
  )
}
