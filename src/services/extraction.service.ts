import { env } from "../config/env.js";
import { DOCX_MIME, PDF_MIME } from "../constants/upload-file-types.js";
import { extractDocxText } from "../utils/extraction/docx.util.js";
import { extractPdfText } from "../utils/extraction/pdf.util.js";
import { tryOcrPdf } from "../utils/extraction/ocr.util.js";
import { cleanExtractedText } from "../utils/extraction/text-clean.util.js";
import {
  FILE_PIPELINE_RULE,
  filePipelinePanel,
} from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { scheduleDocumentIndexAfterExtraction } from "./document-index.service.js";

export type ExtractResult = {
  text: string;
  cleanedText: string;
  likelyScanned: boolean;
  ocrUsed: boolean;
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
  const { buffer, mimeType } = file;
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
  if (likelyScanned && env.OCR_ENABLED) {
    const ocrText = await tryOcrPdf(buffer);
    if (ocrText && ocrText.trim().length > cleaned.length) {
      cleaned = cleanExtractedText(ocrText);
      ocrUsed = true;
    }
  }

  return {
    text: raw,
    cleanedText: cleaned,
    likelyScanned,
    ocrUsed,
  };
}


export function scheduleExtractionAfterUpload(ctx: {
  fileId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): void {
  if (ctx.mimeType !== PDF_MIME && ctx.mimeType !== DOCX_MIME) {
    log.info(
      filePipelinePanel("FILE PIPELINE · extract · skipped", ctx.fileId, {
        mime: ctx.mimeType,
        reason: "only application/pdf and DOCX run text extraction",
      })
    );
    return;
  }

  log.info(
    filePipelinePanel("FILE PIPELINE · extract · queued", ctx.fileId, {
      mime: ctx.mimeType,
      originalName: ctx.originalName,
      bufferBytes: ctx.buffer.length,
    })
  );

  setImmediate(() => {
    extractText({
      buffer: ctx.buffer,
      mimeType: ctx.mimeType,
      originalName: ctx.originalName,
    })
      .then((r) => {
        log.info(
          filePipelinePanel("FILE PIPELINE · extract · done", ctx.fileId, {
            cleanedChars: r.cleanedText.length,
            rawChars: r.text.length,
            likelyScanned: r.likelyScanned,
            ocrUsed: r.ocrUsed,
            next: "chunk → embed → DB (setImmediate)",
          })
        );
        log.info(
          [
            filePipelinePanel("FILE PIPELINE · extract · text preview", ctx.fileId, {
              note: `up to ${EXTRACTION_LOG_TEXT_MAX} chars`,
            }),
            excerptForLog(r.cleanedText),
            FILE_PIPELINE_RULE,
          ].join("\n")
        );
        scheduleDocumentIndexAfterExtraction(ctx.fileId, r.cleanedText);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(
          filePipelinePanel("FILE PIPELINE · extract · failed", ctx.fileId, {
            error: msg,
          })
        );
      });
  });
}
