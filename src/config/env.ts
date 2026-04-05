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
} as const;
