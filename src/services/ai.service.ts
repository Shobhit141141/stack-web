import { googleCreateEmbeddings } from "../client/google-genai.client.js";
import { openaiCreateEmbeddings } from "../client/openai.client.js";
import { EMBEDDING_DIM } from "../constants/embeddings.js";
import { env } from "../config/env.js";
import { log } from "../utils/logger/index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function embeddingsAttemptLabel(): string {
  return env.EMBEDDING_PROVIDER === "google"
    ? "Google (Gemini) embeddings"
    : "OpenAI embeddings";
}

// input : ["Hello, world!", "Hello, universe!"]
// output : [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
export async function createTextEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let out: number[][];
      if (env.EMBEDDING_PROVIDER === "google") {
        out = await googleCreateEmbeddings({
          model: env.GOOGLE_EMBEDDING_MODEL,
          texts,
        });
      } else {
        const model = env.EMBEDDING_MODEL;
        const dimensions = model.startsWith("text-embedding-3") ? EMBEDDING_DIM : undefined;
        out = await openaiCreateEmbeddings({
          model,
          input: texts,
          dimensions,
        });
      }

      for (const v of out) {
        if (v.length !== EMBEDDING_DIM) {
          throw new Error(`Expected ${EMBEDDING_DIM} dims, got ${v.length}`);
        }
      }
      if (out.length !== texts.length) {
        throw new Error("Embedding batch size mismatch");
      }
      return out;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`${embeddingsAttemptLabel()} attempt ${attempt + 1}/3 failed: ${msg}`);
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
