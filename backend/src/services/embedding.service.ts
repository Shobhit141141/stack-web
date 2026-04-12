import { googleEmbedQueryText } from "../client/google-genai.client.js";
import { env } from "../config/env.js";
import { createTextEmbeddings } from "./ai.service.js";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return createTextEmbeddings(texts);
}

export async function embedQuery(text: string): Promise<number[]> {
  if (env.EMBEDDING_PROVIDER === "google") {
    return googleEmbedQueryText({
      model: env.GOOGLE_EMBEDDING_MODEL,
      text,
    });
  }
  const [v] = await embedTexts([text]);
  if (!v) throw new Error("Expected query embedding");
  return v;
}
