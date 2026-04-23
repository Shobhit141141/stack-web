import { googleGenerateRagCompletion } from "../client/google-genai.client.js";
import { openaiGenerateRagCompletion } from "../client/openai.client.js";
import { env } from "../config/env.js";
import type { RagCompletionResult } from "../types/rag-completion.js";

export async function generateRagCompletion(params: {
  systemInstruction: string;
  userMessage: string;
  temperature: number;
  /** when set, overrides OPENAI_CHAT_MODEL / GEMINI_CHAT_MODEL for this call */
  model?: string;
}): Promise<RagCompletionResult> {
  if (env.RAG_COMPLETION_PROVIDER === "google") {
    return googleGenerateRagCompletion({
      model: params.model?.trim() || env.GEMINI_CHAT_MODEL,
      systemInstruction: params.systemInstruction,
      userMessage: params.userMessage,
      temperature: params.temperature,
    });
  }
  return openaiGenerateRagCompletion({
    model: params.model?.trim() || env.OPENAI_CHAT_MODEL,
    systemInstruction: params.systemInstruction,
    userMessage: params.userMessage,
    temperature: params.temperature,
  });
}
