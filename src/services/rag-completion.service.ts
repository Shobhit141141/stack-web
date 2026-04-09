import { googleGenerateRagCompletion } from "../client/google-genai.client.js";
import { openaiGenerateRagCompletion } from "../client/openai.client.js";
import { env } from "../config/env.js";
import type { RagCompletionResult } from "../types/rag-completion.js";

export async function generateRagCompletion(params: {
  systemInstruction: string;
  userMessage: string;
  temperature: number;
}): Promise<RagCompletionResult> {
  if (env.RAG_COMPLETION_PROVIDER === "google") {
    return googleGenerateRagCompletion({
      model: env.GEMINI_CHAT_MODEL,
      systemInstruction: params.systemInstruction,
      userMessage: params.userMessage,
      temperature: params.temperature,
    });
  }
  return openaiGenerateRagCompletion({
    model: env.OPENAI_CHAT_MODEL,
    systemInstruction: params.systemInstruction,
    userMessage: params.userMessage,
    temperature: params.temperature,
  });
}
