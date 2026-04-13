import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { getSupabaseAnonClient } from "../client/supabase.client.js";

export async function getAuthUser(
  accessToken: string
): Promise<SupabaseAuthUser | null> {
  const supabase = getSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

// exchanges refresh_token with supabase; input: refresh_token string; output: session or null when invalid
export async function refreshSessionWithToken(
  refreshToken: string
): Promise<Session | null> {
  const supabase = getSupabaseAnonClient();
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) return null;
  return data.session;
}
