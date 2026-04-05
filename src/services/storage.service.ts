import { getSupabaseClientForAccessToken } from "../client/supabase.client.js";
import { env } from "../config/env.js";

export function buildStorageObjectPath(
  userId: string,
  originalName: string
): string {
  const base =
    originalName.replace(/^.*[/\\]/, "").replace(/[/\\]/g, "_") || "file";
  const trimmed = base.slice(0, 200);
  return `${userId}/${Date.now()}-${trimmed}`;
}

export async function uploadToFilesBucket(params: {
  accessToken: string;
  storagePath: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const supabase = getSupabaseClientForAccessToken(params.accessToken);
  const { error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(params.storagePath, params.body, {
      contentType: params.contentType,
      upsert: false,
    });
  if (error) throw new Error(error.message);
}

export async function deleteFromFilesBucket(
  accessToken: string,
  storagePath: string
): Promise<void> {
  const supabase = getSupabaseClientForAccessToken(accessToken);
  await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .remove([storagePath]);
}
