import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

let client: SupabaseClient | null = null;

export function getSupabaseAnonClient(): SupabaseClient {
  if (client) return client;
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  client = createClient(url, anonKey);
  return client;
}

/** Storage (and other) calls that must run as the authenticated user (RLS). */
export function getSupabaseClientForAccessToken(
  accessToken: string
): SupabaseClient {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
