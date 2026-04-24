import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

function resolveBaseDir(): string {
  const override = env.PDF_EXTRACT_CACHE_DIR;
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), ".cache", "pdf-extract");
}

export async function savePdfExtractWebp(
  contentId: string,
  slot: number,
  webp: Buffer
): Promise<void> {
  const dir = path.join(resolveBaseDir(), contentId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slot}.webp`), webp);
}

export async function readPdfExtractWebp(
  contentId: string,
  slot: number
): Promise<Buffer | null> {
  try {
    return await readFile(path.join(resolveBaseDir(), contentId, `${slot}.webp`));
  } catch {
    return null;
  }
}
