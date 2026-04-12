import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { getSupabaseAnonClient } from "../client/supabase.client.js";

export async function getAuthUser(
  accessToken: string
): Promise<SupabaseAuthUser | null> {
  const supabase = getSupabaseAnonClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}
