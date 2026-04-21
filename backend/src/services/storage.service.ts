import { getSupabaseClientForAccessToken } from "../client/supabase.client.js";
import { env } from "../config/env.js";
import { log } from "../utils/logger/index.js";

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
  const { error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .remove([storagePath]);
  if (error) throw new Error(error.message);
}

const MIN_SIGNED_TTL = 60;
const MAX_SIGNED_TTL = 604800;

export function clampSignedUrlExpiresSeconds(requested: number): number {
  if (!Number.isFinite(requested) || requested < MIN_SIGNED_TTL) return MIN_SIGNED_TTL;
  return Math.min(Math.floor(requested), MAX_SIGNED_TTL);
}

export async function createSignedReadUrl(params: {
  accessToken: string;
  storagePath: string;
  expiresIn: number;
}): Promise<string> {
  const supabase = getSupabaseClientForAccessToken(params.accessToken);
  const ttl = clampSignedUrlExpiresSeconds(params.expiresIn);
  const { data, error } = await supabase.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(params.storagePath, ttl);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create signed URL");
  }
  return data.signedUrl;
}

/** signed read for pre-generated thumbnail object (webp) or original image when no thumb exists */
export async function createSignedThumbnailUrl(params: {
  accessToken: string;
  storagePath: string;
  thumbnailStoragePath?: string | null;
  expiresIn: number;
}): Promise<string> {
  const path = params.thumbnailStoragePath ?? params.storagePath;
  const url = await createSignedReadUrl({
    accessToken: params.accessToken,
    storagePath: path,
    expiresIn: params.expiresIn,
  });
  log.info(
    `thumbnail signed url path=${path} source=${params.thumbnailStoragePath ? "pre_generated" : "original"}`
  );
  return url;
}
