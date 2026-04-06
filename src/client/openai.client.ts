import OpenAI from "openai";
import { env } from "../config/env.js";

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
  const body: OpenAI.Embeddings.EmbeddingCreateParams = {
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
