const nodeEnv = process.env.NODE_ENV ?? "development";

/** when `NODE_ENV=production` */
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

export const env = {
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: nodeEnv === "production",

  PORT: Number(process.env.PORT) || 3000,

  CORS_ORIGIN: process.env.CORS_ORIGIN,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? "files",
  SIGNED_URL_EXPIRES_SECONDS: Number(process.env.SIGNED_URL_EXPIRES_SECONDS) || 3600,

  LOG_PROVIDER: process.env.LOG_PROVIDER ?? "winston",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "http",

  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,

  OCR_ENABLED: process.env.OCR_ENABLED === "true",

  /** `openai` (default) or `google` / `gemini` for Gemini Developer API (AI Studio key). */
  EMBEDDING_PROVIDER: embeddingProvider,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,

  /** OpenAI embeddings model when `EMBEDDING_PROVIDER=openai`. */
  EMBEDDING_MODEL:
    process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small",

  /** Google AI Studio / Gemini API key when `EMBEDDING_PROVIDER=google`. */
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  /** Gemini embedding model id when `EMBEDDING_PROVIDER=google` (e.g. text-embedding-004, gemini-embedding-001). */
  GOOGLE_EMBEDDING_MODEL:
    process.env.GOOGLE_EMBEDDING_MODEL?.trim() || "text-embedding-004",
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
