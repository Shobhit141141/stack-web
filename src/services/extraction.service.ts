import { env } from "../config/env.js";
import { DOCX_MIME, PDF_MIME } from "../constants/upload-file-types.js";
import { extractDocxText } from "../utils/extraction/docx.util.js";
import { extractPdfText } from "../utils/extraction/pdf.util.js";
import { tryOcrPdf } from "../utils/extraction/ocr.util.js";
import { cleanExtractedText } from "../utils/extraction/text-clean.util.js";
import { log } from "../utils/logger/index.js";

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
    return;
  }

  setImmediate(() => {
    extractText({
      buffer: ctx.buffer,
      mimeType: ctx.mimeType,
      originalName: ctx.originalName,
    })
      .then((r) => {
        log.info(
          `Extraction done fileId=${ctx.fileId} cleanedChars=${r.cleanedText.length} likelyScanned=${r.likelyScanned} ocr=${r.ocrUsed}`
        );
        log.info(
          `Extraction text fileId=${ctx.fileId}\n${excerptForLog(r.cleanedText)}`
        );
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`Extraction failed fileId=${ctx.fileId}: ${msg}`);
      });
  });
}
