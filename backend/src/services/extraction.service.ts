import { env } from "../config/env.js";
import { DOCX_MIME, PDF_MIME } from "../constants/upload-file-types.js";
import { extractDocxText } from "../utils/extraction/docx.util.js";
import { extractPdfText } from "../utils/extraction/pdf.util.js";
import {
  tryOcrPdf,
  type OcrPdfEngine,
} from "../utils/extraction/ocr.util.js";
import { cleanExtractedText } from "../utils/extraction/text-clean.util.js";
import {
  FILE_PIPELINE_RULE,
  filePipelinePanel,
} from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { scheduleDocumentIndexAfterExtraction } from "./document-index.service.js";
import { scheduleContentSummaryGeneration } from "./summary.service.js";
import { buildPdfImageIndexItems } from "./pdf-embedded-images.service.js";
import { logPdfVisualPipeline } from "../utils/debug-log.util.js";

export type ExtractResult = {
  text: string;
  cleanedText: string;
  likelyScanned: boolean;
  ocrUsed: boolean;
  /** set when OCR ran and beat native extract; `none` otherwise */
  ocrEngine: OcrPdfEngine;
};

const EXTRACTION_LOG_TEXT_MAX = 32_768;

function isLikelyScannedPdf(pageCount: number, cleanedLen: number): boolean {
  if (cleanedLen === 0) return true;
  if (pageCount <= 0) return cleanedLen < 30;
  return cleanedLen < Math.max(50, pageCount * 12);
}

function excerptForLog(text: string): string {
  if (text.length <= EXTRACTION_LOG_TEXT_MAX) return text;
  return `${text.slice(0, EXTRACTION_LOG_TEXT_MAX)}… [truncated ${text.length - EXTRACTION_LOG_TEXT_MAX} chars]`;
}

export async function extractText(file: {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}): Promise<ExtractResult> {
  const { buffer, mimeType, originalName } = file;
  let raw = "";
  let pageCount = 0;

  if (mimeType === PDF_MIME) {
    try {
      const out = await extractPdfText(buffer);
      raw = out.text;
      pageCount = out.pageCount;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`PDF extract error: ${msg}`);
      throw new Error("PDF parsing failed");
    }
  } else if (mimeType === DOCX_MIME) {
    try {
      raw = await extractDocxText(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`DOCX extract error: ${msg}`);
      throw new Error("DOCX parsing failed");
    }
  } else {
    throw new Error("Unsupported type for extraction");
  }

  let cleaned = cleanExtractedText(raw);
  const likelyScanned =
    mimeType === PDF_MIME && isLikelyScannedPdf(pageCount, cleaned.length);

  let ocrUsed = false;
  let ocrEngine: OcrPdfEngine = "none";
  if (likelyScanned && env.OCR_ENABLED) {
    const ocr = await tryOcrPdf(buffer, { originalName });
    if (ocr.text && ocr.text.trim().length > cleaned.length) {
      cleaned = cleanExtractedText(ocr.text);
      ocrUsed = true;
      ocrEngine = ocr.engine;
    }
  }

  return {
    text: raw,
    cleanedText: cleaned,
    likelyScanned,
    ocrUsed,
    ocrEngine,
  };
}

export function scheduleExtractionAfterUpload(ctx: {
  contentId: string;
  fileId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): void {
  if (ctx.mimeType !== PDF_MIME && ctx.mimeType !== DOCX_MIME) {
    log.info(
      filePipelinePanel("FILE PIPELINE · extract · skipped", ctx.contentId, {
        mime: ctx.mimeType,
        reason: "only application/pdf and DOCX run text extraction",
      })
    );
    return;
  }

  log.info(
    filePipelinePanel("FILE PIPELINE · extract · queued", ctx.contentId, {
      mime: ctx.mimeType,
      originalName: ctx.originalName,
      bufferBytes: ctx.buffer.length,
      fileId: ctx.fileId,
    })
  );

  setImmediate(() => {
    void (async () => {
      try {
        const r = await extractText({
          buffer: ctx.buffer,
          mimeType: ctx.mimeType,
          originalName: ctx.originalName,
        });
        log.info(
          filePipelinePanel("FILE PIPELINE · extract · done", ctx.contentId, {
            cleanedChars: r.cleanedText.length,
            rawChars: r.text.length,
            likelyScanned: r.likelyScanned,
            ocrUsed: r.ocrUsed,
            ocrEngine: r.ocrEngine,
            next: "chunk → embed → DB (setImmediate)",
          })
        );
        log.info(
          [
            filePipelinePanel("FILE PIPELINE · extract · text preview", ctx.contentId, {
              note: `up to ${EXTRACTION_LOG_TEXT_MAX} chars`,
            }),
            excerptForLog(r.cleanedText),
            FILE_PIPELINE_RULE,
          ].join("\n")
        );

        // Kick off summary as soon as text is available. PDF figure captioning
        // (vision LLM, 5-30s on figure-heavy PDFs) doesn't feed the summary
        // unless cleanedText is empty, so don't make it a barrier.
        const hasCleanedText = r.cleanedText.trim().length > 0;
        if (hasCleanedText) {
          scheduleContentSummaryGeneration({
            contentId: ctx.contentId,
            extractedText: r.cleanedText,
          });
        }

        let pdfImageItems =
          ctx.mimeType === PDF_MIME
            ? await buildPdfImageIndexItems({
                buffer: ctx.buffer,
                contentId: ctx.contentId,
                parentFileId: ctx.fileId,
                originalName: ctx.originalName,
                // Required fallback: if no embedded rasters and no text, render page(s) then caption.
                fallbackWhenNoRasters: !hasCleanedText,
                fallbackMaxPages: 1,
              })
            : undefined;

        scheduleDocumentIndexAfterExtraction(ctx.contentId, r.cleanedText, {
          pdfImageItems,
        });

        if (ctx.mimeType === PDF_MIME) {
          logPdfVisualPipeline({
            phase: "extract_orchestration_done",
            contentId: ctx.contentId,
            fileId: ctx.fileId,
            originalName: ctx.originalName,
            cleanedTextChars: r.cleanedText.length,
            likelyScanned: r.likelyScanned,
            ocrUsed: r.ocrUsed,
            ocrEngine: r.ocrEngine,
            pdfFigureChunks: pdfImageItems?.length ?? 0,
          });
        }

        // Image-only docs (no extractable text) still need figure captions
        // before we can summarize — schedule once captions are ready.
        if (!hasCleanedText) {
          const captionsBase =
            pdfImageItems?.map((i) => i.caption).join("\n\n") ?? "";
          if (captionsBase.trim()) {
            scheduleContentSummaryGeneration({
              contentId: ctx.contentId,
              extractedText: captionsBase,
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(
          filePipelinePanel("FILE PIPELINE · extract · failed", ctx.contentId, {
            error: msg,
          })
        );
        logPdfVisualPipeline({
          phase: "extraction_job_failed",
          contentId: ctx.contentId,
          fileId: ctx.fileId,
          mimeType: ctx.mimeType,
          originalName: ctx.originalName,
          error: msg,
        });
      }
    })();
  });
}
