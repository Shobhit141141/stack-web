import { OpenAI } from "openai";
import { env } from "../config/env.js";
import type { RagCompletionResult } from "../types/rag-completion.js";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  client = new OpenAI({ apiKey: key });
  return client;
}

export async function openaiCreateEmbeddings(params: {
  model: string;
  input: string[];
  dimensions?: number;
}): Promise<number[][]> {
  const openai = getOpenAIClient();
  const body: {
    model: string;
    input: string[];
    dimensions?: number;
  } = {
    model: params.model,
    input: params.input,
  };
  if (params.dimensions != null) {
    body.dimensions = params.dimensions;
  }
  const res = await openai.embeddings.create(body);
  const ordered = [...res.data].sort((a, b) => a.index - b.index);
  return ordered.map((d) => d.embedding.map(Number));
}

export async function openaiGenerateRagCompletion(params: {
  model: string;
  systemInstruction: string;
  userMessage: string;
  temperature: number;
}): Promise<RagCompletionResult> {
  const openai = getOpenAIClient();
  const res = await openai.chat.completions.create({
    model: params.model,
    messages: [
      { role: "system", content: params.systemInstruction },
      { role: "user", content: params.userMessage },
    ],
    temperature: params.temperature,
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI returned empty text");
  }
  const u = res.usage;
  return {
    text,
    model: params.model,
    modelVersion: res.model,
    usage: {
      promptTokens: u?.prompt_tokens,
      completionTokens: u?.completion_tokens,
      totalTokens: u?.total_tokens,
    },
  };
}
