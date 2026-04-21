import sharp from "sharp";
import { log } from "../utils/logger/index.js";

// builds a small webp preview (max edge 240px) for list/grid thumbnails without storage transforms.
export async function tryBuildWebpThumbnail(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .rotate()
      .resize(240, 240, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
  } catch (e) {
    log.warn(
      `thumbnail generation skipped: ${e instanceof Error ? e.message : String(e)}`
    );
    return null;
  }
}

export function thumbnailPathForMainStoragePath(mainStoragePath: string): string {
  return `${mainStoragePath}.thumb.webp`;
}
