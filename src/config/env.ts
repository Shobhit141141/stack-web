const nodeEnv = process.env.NODE_ENV ?? "development";

const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
] as const;

function assertProductionEnv(): void {
  if (nodeEnv !== "production") return;

  const missing: string[] = [];
  for (const name of REQUIRED_IN_PRODUCTION) {
    const raw = process.env[name];
    if (typeof raw !== "string" || raw.trim() === "") {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(", ")}. Use UPPER_SNAKE_CASE names only (e.g. SUPABASE_ANON_KEY, not supabaseAnonKey).`
    );
  }
}

assertProductionEnv();

export type EmbeddingProvider = "openai" | "google";

function parseEmbeddingProvider(): EmbeddingProvider {
  const v = process.env.EMBEDDING_PROVIDER?.trim().toLowerCase() ?? "";
  if (v === "google" || v === "gemini") return "google";
  return "openai";
}

const embeddingProvider = parseEmbeddingProvider();

export type RagCompletionProvider = "openai" | "google";

function parseRagCompletionProvider(): RagCompletionProvider {
  const v = process.env.RAG_COMPLETION_PROVIDER?.trim().toLowerCase() ?? "";
  if (v === "google" || v === "gemini") return "google";
  return "openai";
}

const ragCompletionProvider = parseRagCompletionProvider();

export const env = {
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: nodeEnv === "production",

  PORT: Number(process.env.PORT) || 3000,

  CORS_ORIGIN: process.env.CORS_ORIGIN,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? "files",
  SIGNED_URL_EXPIRES_SECONDS:
    Number(process.env.SIGNED_URL_EXPIRES_SECONDS) || 3600,

  LOG_PROVIDER: process.env.LOG_PROVIDER ?? "winston",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "http",

  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,

  OCR_ENABLED: process.env.OCR_ENABLED === "true",

  EMBEDDING_PROVIDER: embeddingProvider,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  EMBEDDING_MODEL:
    process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small",

  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  GOOGLE_EMBEDDING_MODEL:
    process.env.GOOGLE_EMBEDDING_MODEL?.trim() || "text-embedding-004",

  RAG_COMPLETION_PROVIDER: ragCompletionProvider,

  OPENAI_CHAT_MODEL:
    process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",

  GEMINI_CHAT_MODEL:
    process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash-lite",

  RAG_VECTOR_CHUNK_LIMIT: Math.min(
    200,
    Math.max(1, Number(process.env.RAG_VECTOR_CHUNK_LIMIT) || 20),
  ),

  RAG_TOP_CONTENT_COUNT: (() => {
    const n = Number(process.env.RAG_TOP_CONTENT_COUNT);
    const v = Number.isFinite(n) ? n : 6;
    return Math.min(7, Math.max(5, Math.floor(v)));
  })(),

  RAG_MAX_CHUNKS_PER_CONTENT: Math.min(
    10,
    Math.max(1, Number(process.env.RAG_MAX_CHUNKS_PER_CONTENT) || 2),
  ),

  RAG_MIN_CHUNK_SCORE: (() => {
    const x = Number(process.env.RAG_MIN_CHUNK_SCORE);
    return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.08;
  })(),

  RAG_MAX_CONTEXT_CHARS: Math.min(
    100_000,
    Math.max(2000, Number(process.env.RAG_MAX_CONTEXT_CHARS) || 12_000),
  ),

  RAG_TEMPERATURE: (() => {
    const t = Number(process.env.RAG_TEMPERATURE);
    return Number.isFinite(t) ? Math.min(2, Math.max(0, t)) : 0.2;
  })(),
} as const;

export function hasEmbeddingApiKey(): boolean {
  if (env.EMBEDDING_PROVIDER === "google") {
    return Boolean(env.GEMINI_API_KEY?.trim());
  }
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export function embeddingRuntimeLabel(): string {
  if (env.EMBEDDING_PROVIDER === "google") {
    return `google:${env.GOOGLE_EMBEDDING_MODEL}`;
  }
  return `openai:${env.EMBEDDING_MODEL}`;
}

export function ragCompletionModelDefault(): string {
  if (env.RAG_COMPLETION_PROVIDER === "google") {
    return env.GEMINI_CHAT_MODEL;
  }
  return env.OPENAI_CHAT_MODEL;
}

export function hasRagCompletionConfigured(): boolean {
  if (env.RAG_COMPLETION_PROVIDER === "google") {
    return Boolean(env.GEMINI_API_KEY?.trim());
  }
  return Boolean(env.OPENAI_API_KEY?.trim());
}
