import { apiFetchOkAuthed } from '../lib/api-authed'

export type AskSource = {
  fileId: string
  fileName: string
  snippet: string
}

export type QuizQuestionOption = {
  optionId: string
  text: string
}

export type QuizQuestion = {
  questionId: string
  prompt: string
  options: QuizQuestionOption[]
}

export type QuizPayload = {
  kind: 'quiz'
  quizId: string
  title: string
  prompt: string
  questions: QuizQuestion[]
}

export type QuizSubmissionPayload = {
  kind: 'quiz_submission'
  quizId: string
  quizMessageId: string
  answers: Array<{
    questionId: string
    selectedOptionId: string
  }>
}

export type QuizResultPayload = {
  kind: 'quiz_result'
  quizId: string
  score: number
  total: number
  perQuestion: Array<{
    questionId: string
    selectedOptionId: string | null
    correctOptionId: string
    isCorrect: boolean
    explanation: string
  }>
  insights: string
}

export type ChatPayload = QuizPayload | QuizSubmissionPayload | QuizResultPayload

export type AskResponse = {
  answer: string
  sources: AskSource[]
  payload?: ChatPayload
}

// calls rag ask endpoint; input: query and optional workspace or file scope
export async function postAsk(params: {
  query: string
  displayQuery?: string
  workspaceId?: string
  fileIds?: string[]
  conversationId?: string
}): Promise<AskResponse> {
  const res = await apiFetchOkAuthed('/ask', {
    method: 'POST',
    json: {
      query: params.query,
      ...(params.displayQuery ? { displayQuery: params.displayQuery } : {}),
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
      ...(params.fileIds?.length ? { fileIds: params.fileIds } : {}),
      ...(params.conversationId ? { conversationId: params.conversationId } : {}),
    },
  })
  return (await res.json()) as AskResponse
}

export async function postQuizSubmit(params: {
  conversationId: string
  quizMessageId: string
  answers: Array<{
    questionId: string
    selectedOptionId: string
  }>
}): Promise<{
  userMessage: {
    content: string
    payload: QuizSubmissionPayload
  }
  assistantMessage: {
    answer: string
    payload: QuizResultPayload
  }
}> {
  const res = await apiFetchOkAuthed('/ask/quiz/submit', {
    method: 'POST',
    json: {
      conversationId: params.conversationId,
      quizMessageId: params.quizMessageId,
      answers: params.answers,
    },
  })
  return (await res.json()) as {
    userMessage: {
      content: string
      payload: QuizSubmissionPayload
    }
    assistantMessage: {
      answer: string
      payload: QuizResultPayload
    }
  }
}
