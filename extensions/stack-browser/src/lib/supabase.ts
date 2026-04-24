import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireEnv } from "./config"

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  client = createClient(requireEnv("VITE_SUPABASE_URL"), requireEnv("VITE_SUPABASE_ANON_KEY"), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  })
  return client
}
