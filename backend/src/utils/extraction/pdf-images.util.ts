import { createHash } from "node:crypto";
import { extractImages, getDocumentProxy, renderPageAsImage } from "unpdf";
import sharp from "sharp";
import { log } from "../logger/index.js";
import { logPdfVisualPipeline } from "../debug-log.util.js";

const MIN_SIDE = 24;
const MAX_IMAGES_PER_PDF = 40;
const MAX_SIDE = 4096;

export type PdfRasterImage = {
  page: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
};

export type PdfRenderedPageImage = {
  page: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
};

/**
 * Pull embedded raster images from a PDF (per-page XObjects). Vector-only figures are not included.
 */
export async function extractRasterImagesFromPdf(buffer: Buffer): Promise<PdfRasterImage[]> {
  const out: PdfRasterImage[] = [];
  const seenHashes = new Set<string>();

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const numPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= numPages && out.length < MAX_IMAGES_PER_PDF; pageNum++) {
      let images: Awaited<ReturnType<typeof extractImages>>;
      try {
        images = await extractImages(pdf, pageNum);
      } catch {
        continue;
      }

      for (const img of images) {
        if (out.length >= MAX_IMAGES_PER_PDF) break;
        if (img.width < MIN_SIDE || img.height < MIN_SIDE) continue;
        if (img.width > MAX_SIDE || img.height > MAX_SIDE) continue;

        try {
          const raw = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
          const pngBuffer = await sharp(raw, {
            raw: {
              width: img.width,
              height: img.height,
              channels: img.channels,
            },
          })
            .png()
            .toBuffer();

          const h = createHash("sha256").update(pngBuffer).digest("hex").slice(0, 24);
          if (seenHashes.has(h)) continue;
          seenHashes.add(h);

          out.push({
            page: pageNum,
            pngBuffer,
            width: img.width,
            height: img.height,
          });
        } catch {
          // skip unreadable bitmaps
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`pdf embedded image extract failed: ${msg}`);
    logPdfVisualPipeline({
      phase: "raster_extract_exception",
      error: msg,
    });
  }

  return out;
}

/**
 * Fallback path: render PDF pages when there are no embedded rasters.
 */
export async function renderPdfPagesAsImages(
  buffer: Buffer,
  maxPages: number
): Promise<PdfRenderedPageImage[]> {
  const out: PdfRenderedPageImage[] = [];
  const safeMax = Math.max(1, maxPages);
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const total = Math.min(pdf.numPages, safeMax);

    for (let page = 1; page <= total; page++) {
      try {
        const raw = await renderPageAsImage(pdf, page);
        const pngBuffer = Buffer.from(raw);
        const meta = await sharp(pngBuffer).metadata();
        out.push({
          page,
          pngBuffer,
          width: meta.width ?? 0,
          height: meta.height ?? 0,
        });
      } catch (e) {
        logPdfVisualPipeline({
          phase: "page_render_failed",
          page,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } catch (e) {
    logPdfVisualPipeline({
      phase: "render_fallback_exception",
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return out;
}
