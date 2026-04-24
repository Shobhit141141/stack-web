export function requireEnv(name: keyof ImportMetaEnv): string {
  const v = import.meta.env[name]?.trim()
  if (!v) throw new Error(`Missing ${name} in extension .env`)
  return v
}

export function apiBase(): string {
  return requireEnv("VITE_API_URL").replace(/\/$/, "")
}
