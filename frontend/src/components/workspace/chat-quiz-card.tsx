import { useState } from 'react'
import type { QuizPayload } from '../../services/ask-service'

type Props = {
  quiz: QuizPayload
  disabled?: boolean
  onSubmit: (answers: Array<{ questionId: string; selectedOptionId: string }>) => Promise<void>
}

export function ChatQuizCard({ quiz, disabled = false, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
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
      <div className="mt-3 space-y-3">
        {quiz.questions.map((q, idx) => (
          <div key={q.questionId} className="rounded-md border border-neutral-100 bg-neutral-50 p-2">
            <p className="text-sm font-medium text-neutral-900">
              {idx + 1}. {q.prompt}
            </p>
            <div className="mt-2 space-y-1">
              {q.options.map((opt) => (
                <label key={opt.optionId} className="flex cursor-pointer items-center gap-2 text-xs text-neutral-700">
                  <input
                    type="radio"
                    name={`quiz-${quiz.quizId}-${q.questionId}`}
                    value={opt.optionId}
                    checked={answers[q.questionId] === opt.optionId}
                    disabled={disabled || submitting}
                    onChange={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.questionId]: opt.optionId,
                      }))
                    }
                  />
                  <span>{opt.text}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || submitting}
        onClick={() => void submit()}
        className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit quiz'}
      </button>
    </div>
  )
}
