import type { Prisma } from "@prisma/client";

/** Optional asset id for source/search thumbnails (e.g. extracted image file). */
export function previewFileIdFromChunkMeta(
  meta: Prisma.JsonValue | unknown | undefined
): string | undefined {
  if (meta === undefined || meta === null) return undefined;
  if (typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const v = (meta as Record<string, unknown>).previewFileId;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export type PdfExtractionRef = { fileId: string; slot: number };

/** Reference to a cached webp extracted from a PDF (`/files/:fileId/pdf-extraction/:slot`). */
export function pdfExtractionRefFromChunkMeta(
  meta: Prisma.JsonValue | unknown | undefined
): PdfExtractionRef | undefined {
  if (meta === undefined || meta === null) return undefined;
  if (typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const nested = (meta as Record<string, unknown>).pdfExtraction;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return undefined;
  const o = nested as Record<string, unknown>;
  const fileId = o.fileId;
  const slot = o.slot;
  if (typeof fileId !== "string" || fileId.length === 0) return undefined;
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) return undefined;
  return { fileId, slot };
}
