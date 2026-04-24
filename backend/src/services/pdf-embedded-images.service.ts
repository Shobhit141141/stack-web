import type { Prisma } from "@prisma/client";
import sharp from "sharp";
import { env, hasRagCompletionConfigured } from "../config/env.js";
import {
  extractRasterImagesFromPdf,
  renderPdfPagesAsImages,
} from "../utils/extraction/pdf-images.util.js";
import { countTokens } from "../utils/tokenizer.util.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { generatePdfEmbeddedImageCaption } from "./image-index.service.js";
import * as pdfExtractStorage from "./pdf-extract-storage.service.js";
import { logPdfVisualPipeline } from "../utils/debug-log.util.js";

export type PdfImageIndexItem = {
  caption: string;
  tokenCount: number;
  chunkMeta: Prisma.JsonValue;
};

/**
 * Extract embedded PDF images, caption with vision, persist webp previews for the UI.
 */
export async function buildPdfImageIndexItems(params: {
  buffer: Buffer;
  contentId: string;
  parentFileId: string;
  originalName: string;
  fallbackWhenNoRasters?: boolean;
  fallbackMaxPages?: number;
}): Promise<PdfImageIndexItem[]> {
  if (!env.PDF_EMBEDDED_IMAGES_ENABLED) {
    logPdfVisualPipeline({
      phase: "skipped",
      reason: "PDF_EMBEDDED_IMAGES_ENABLED is false",
      contentId: params.contentId,
      parentFileId: params.parentFileId,
      originalName: params.originalName,
    });
    return [];
  }
  if (!hasRagCompletionConfigured()) {
    log.info(
      filePipelinePanel("FILE PIPELINE · pdf-images · skipped", params.contentId, {
        reason: "RAG completion / vision not configured",
      })
    );
    logPdfVisualPipeline({
      phase: "skipped",
      reason: "RAG completion / vision not configured",
      contentId: params.contentId,
      parentFileId: params.parentFileId,
      originalName: params.originalName,
    });
    return [];
  }

  logPdfVisualPipeline({
    phase: "start",
    contentId: params.contentId,
    parentFileId: params.parentFileId,
    originalName: params.originalName,
    pdfBytes: params.buffer.length,
  });

  const t0 = Date.now();
  const rasters = await extractRasterImagesFromPdf(params.buffer);
  const rasterMs = Date.now() - t0;
  log.info(
    filePipelinePanel("FILE PIPELINE · pdf-images · raster extract", params.contentId, {
      count: rasters.length,
      ms: rasterMs,
    })
  );
  logPdfVisualPipeline({
    phase: "rasters_extracted",
    contentId: params.contentId,
    parentFileId: params.parentFileId,
    rasterCount: rasters.length,
    pages: [...new Set(rasters.map((x) => x.page))].sort((a, b) => a - b),
    dimsSample: rasters.slice(0, 8).map((x) => ({ page: x.page, w: x.width, h: x.height })),
    ms: rasterMs,
  });

  let visuals = rasters;
  if (rasters.length === 0) {
    logPdfVisualPipeline({
      phase: "no_rasters",
      contentId: params.contentId,
      parentFileId: params.parentFileId,
      note: "No embedded raster images found (vector-only pages are not rendered here)",
    });

    if (params.fallbackWhenNoRasters) {
      const rendered = await renderPdfPagesAsImages(
        params.buffer,
        params.fallbackMaxPages ?? 1
      );
      logPdfVisualPipeline({
        phase: "fallback_rendered_pages",
        contentId: params.contentId,
        parentFileId: params.parentFileId,
        renderedCount: rendered.length,
        pages: rendered.map((r) => r.page),
      });
      visuals = rendered;
    }
  }

  if (visuals.length === 0) {
    return [];
  }

  const items: PdfImageIndexItem[] = [];
  let slot = 0;

  for (let i = 0; i < visuals.length; i++) {
    const r = visuals[i]!;
    let caption: string;
    try {
      caption = await generatePdfEmbeddedImageCaption({
        pngBuffer: r.pngBuffer,
        originalName: params.originalName,
        page: r.page,
        index: slot,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log.warn(
        filePipelinePanel("FILE PIPELINE · pdf-images · caption failed", params.contentId, {
          page: r.page,
          slot,
          error: errMsg,
        })
      );
      logPdfVisualPipeline({
        phase: "caption_failed",
        contentId: params.contentId,
        parentFileId: params.parentFileId,
        page: r.page,
        slot,
        rasterIndex: i,
        error: errMsg,
      });
      continue;
    }

    if (!caption.trim()) {
      logPdfVisualPipeline({
        phase: "caption_empty",
        contentId: params.contentId,
        page: r.page,
        slot,
        rasterIndex: i,
      });
      continue;
    }

    let webp: Buffer;
    try {
      webp = await sharp(r.pngBuffer).webp({ quality: 82 }).toBuffer();
    } catch (webpErr) {
      logPdfVisualPipeline({
        phase: "webp_encode_failed",
        contentId: params.contentId,
        page: r.page,
        slot,
        error: webpErr instanceof Error ? webpErr.message : String(webpErr),
      });
      continue;
    }

    await pdfExtractStorage.savePdfExtractWebp(params.contentId, slot, webp);

    const prefix = `[PDF figure page ${r.page}] `;
    const fullText = `${prefix}${caption}`;
    const chunkMeta: Prisma.JsonValue = {
      source: "pdf_embedded_image",
      page: r.page,
      pdfExtraction: { fileId: params.parentFileId, slot },
    };

    items.push({
      caption: fullText,
      tokenCount: Math.max(1, countTokens(fullText)),
      chunkMeta,
    });

    slot += 1;
  }

  const msTotal = Date.now() - t0;
  log.info(
    filePipelinePanel("FILE PIPELINE · pdf-images · captions done", params.contentId, {
      indexedFigures: items.length,
      ms_total: msTotal,
    })
  );
  logPdfVisualPipeline({
    phase: "figures_complete",
    contentId: params.contentId,
    parentFileId: params.parentFileId,
    originalName: params.originalName,
    indexedFigures: items.length,
    captionPreviewSample: items[0]?.caption.slice(0, 500),
    figureSummary: items.slice(0, 24).map((it) => {
      const m = it.chunkMeta as Record<string, unknown>;
      const pe = m.pdfExtraction as Record<string, unknown> | undefined;
      return {
        page: m.page,
        slot: pe?.slot,
        captionChars: it.caption.length,
        tokens: it.tokenCount,
      };
    }),
    msTotal,
  });

  return items;
}
