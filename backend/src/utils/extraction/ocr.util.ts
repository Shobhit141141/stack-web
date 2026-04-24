import { createWorker } from "tesseract.js";
import { env, hasRagCompletionConfigured } from "../../config/env.js";
import { googleDescribeImage } from "../../client/google-genai.client.js";
import { openaiDescribeImage } from "../../client/openai.client.js";
import { log } from "../logger/index.js";
import {
  renderPdfPagesAsImages,
  type PdfRenderedPageImage,
} from "./pdf-images.util.js";

/** which engine produced the final OCR text in `tryOcrPdf` */
export type OcrPdfEngine = "none" | "tesseract" | "ai";

export type OcrPdfPipelineResult = {
  text: string | null;
  engine: OcrPdfEngine;
};

function aiOcrSystemInstruction(): string {
  return [
    "You perform OCR on a document page image.",
    "Transcribe every readable word, number, and symbol in natural reading order.",
    "Preserve line breaks where they help readability. Plain text only.",
    "Do not summarize, describe the image, or add commentary.",
  ].join(" ");
}

// runs vision OCR on each rendered page and joins with page markers when multi-page.
async function transcribePagesWithVision(
  pages: PdfRenderedPageImage[],
  originalName?: string
): Promise<string> {
  const parts: string[] = [];
  const total = pages.length;
  const label = originalName?.trim() || "document.pdf";

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const userMessage = [
      `File: ${label}`,
      `Page ${p.page} of ${total}.`,
      "Output the full OCR text only.",
    ].join("\n");

    let pageText: string;
    if (env.RAG_COMPLETION_PROVIDER === "google") {
      const out = await googleDescribeImage({
        model: env.GEMINI_CHAT_MODEL,
        systemInstruction: aiOcrSystemInstruction(),
        userMessage,
        temperature: 0,
        imageMimeType: "image/png",
        imageBytes: p.pngBuffer,
      });
      pageText = out.text.trim();
    } else {
      const out = await openaiDescribeImage({
        model: env.OPENAI_CHAT_MODEL,
        systemInstruction: aiOcrSystemInstruction(),
        userMessage,
        temperature: 0,
        imageMimeType: "image/png",
        imageBytes: p.pngBuffer,
      });
      pageText = out.text.trim();
    }

    if (pageText) {
      parts.push(total > 1 ? `[Page ${p.page}]\n${pageText}` : pageText);
    }
  }

  return parts.join("\n\n").trim();
}

// true when tesseract output should be replaced or supplemented by vision OCR.
function isWeakTesseract(
  text: string,
  pageCount: number,
  avgConfidence: number
): boolean {
  const t = text.trim();
  if (!t) return true;
  const minChars = Math.max(40, pageCount * 12);
  if (t.length < minChars) return true;
  if (avgConfidence > 0 && avgConfidence < 55) return true;
  return false;
}

// vision-only path when tesseract worker fails to start.
async function tryVisionOcrOnly(
  pages: PdfRenderedPageImage[],
  originalName?: string
): Promise<OcrPdfPipelineResult> {
  if (!hasRagCompletionConfigured()) {
    return { text: null, engine: "none" };
  }
  try {
    const text = await transcribePagesWithVision(pages, originalName);
    if (!text) return { text: null, engine: "none" };
    return { text, engine: "ai" };
  } catch (e) {
    log.warn(`AI OCR (no tesseract) failed: ${e instanceof Error ? e.message : String(e)}`);
    return { text: null, engine: "none" };
  }
}

/**
 * Rasterizes up to OCR_MAX_PAGES, runs Tesseract, then vision LLM when output is weak/empty
 * and OCR_AI_FALLBACK is on with a configured completion provider.
 */
export async function tryOcrPdf(
  buffer: Buffer,
  ctx?: { originalName?: string }
): Promise<OcrPdfPipelineResult> {
  if (!env.OCR_ENABLED) {
    return { text: null, engine: "none" };
  }

  const pages = await renderPdfPagesAsImages(buffer, env.OCR_MAX_PAGES);
  if (pages.length === 0) {
    return { text: null, engine: "none" };
  }

  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker("eng");
  } catch (e) {
    log.warn(
      `tesseract worker init failed: ${e instanceof Error ? e.message : String(e)}`
    );
    if (env.OCR_AI_FALLBACK) {
      return tryVisionOcrOnly(pages, ctx?.originalName);
    }
    return { text: null, engine: "none" };
  }

  const tessChunks: string[] = [];
  const confidences: number[] = [];

  try {
    for (const p of pages) {
      const { data } = await worker.recognize(p.pngBuffer);
      tessChunks.push(String(data.text ?? "").trim());
      if (typeof data.confidence === "number" && !Number.isNaN(data.confidence)) {
        confidences.push(data.confidence);
      }
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  const tessText = tessChunks.filter(Boolean).join("\n\n");
  const avgConf =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  if (!isWeakTesseract(tessText, pages.length, avgConf)) {
    return { text: tessText, engine: "tesseract" };
  }

  if (!env.OCR_AI_FALLBACK || !hasRagCompletionConfigured()) {
    return { text: tessText || null, engine: tessText ? "tesseract" : "none" };
  }

  try {
    const aiText = await transcribePagesWithVision(pages, ctx?.originalName);
    if (aiText) {
      return { text: aiText, engine: "ai" };
    }
  } catch (e) {
    log.warn(`AI OCR fallback failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { text: tessText || null, engine: tessText ? "tesseract" : "none" };
}
