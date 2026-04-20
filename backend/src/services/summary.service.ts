import {
  hasRagCompletionConfigured,
  ragCompletionModelDefault,
} from "../config/env.js";
import * as fileRepository from "../repositories/file.repository.js";
import * as ragCompletionService from "./rag-completion.service.js";
import { log } from "../utils/logger/index.js";

const SUMMARY_SOURCE_MAX_CHARS = 24_000;
const SUMMARY_OUT_MAX_CHARS = 1_200;

function truncateSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const hardCut = text.slice(0, maxChars);
  const sentenceCut = hardCut.lastIndexOf(". ");
  if (sentenceCut >= Math.floor(maxChars * 0.6)) {
    return hardCut.slice(0, sentenceCut + 1).trimEnd();
  }
  const wordCut = hardCut.lastIndexOf(" ");
  if (wordCut >= Math.floor(maxChars * 0.8)) {
    return hardCut.slice(0, wordCut).trimEnd();
  }
  return hardCut.trimEnd();
}

function normalizeSummary(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return truncateSummary(cleaned, SUMMARY_OUT_MAX_CHARS);
}

function buildSummarySystemInstruction(): string {
  return [
    "You summarize uploaded files for a file manager UI.",
    "Return a concise plain-text summary in 2-4 sentences.",
    "Focus on purpose, key topics, and notable entities or decisions.",
    "Do not add markdown, bullets, headings, or preambles.",
    "If content is too weak/noisy, still provide the best concise gist from the provided text only.",
  ].join("\n");
}

function buildSummaryUserMessage(extractedText: string): string {
  const body =
    extractedText.length > SUMMARY_SOURCE_MAX_CHARS
      ? `${extractedText.slice(0, SUMMARY_SOURCE_MAX_CHARS)}\n…`
      : extractedText;
  return `Extracted text:\n${body}`;
}

// schedules async content summary generation and stores state on contents.
export function scheduleContentSummaryGeneration(params: {
  contentId: string;
  extractedText: string;
}): void {
  setImmediate(() => {
    void (async () => {
      if (!hasRagCompletionConfigured()) {
        await fileRepository.markContentSummaryFailed(params.contentId);
        log.warn(
          `content summary skipped contentId=${params.contentId} reason=rag_not_configured`
        );
        return;
      }

      const source = params.extractedText.trim();
      if (!source) {
        await fileRepository.markContentSummaryFailed(params.contentId);
        return;
      }

      await fileRepository.markContentSummaryPending(params.contentId);

      try {
        const out = await ragCompletionService.generateRagCompletion({
          systemInstruction: buildSummarySystemInstruction(),
          userMessage: buildSummaryUserMessage(source),
          temperature: 0.2,
        });
        const summary = normalizeSummary(out.text);
        if (!summary) {
          await fileRepository.markContentSummaryFailed(params.contentId);
          return;
        }
        await fileRepository.markContentSummaryReady({
          contentId: params.contentId,
          summary,
        });
        log.info(
          `content summary ready contentId=${params.contentId} model=${out.model || ragCompletionModelDefault()}`
        );
      } catch (e) {
        await fileRepository.markContentSummaryFailed(params.contentId);
        log.warn(
          `content summary failed contentId=${params.contentId} err=${e instanceof Error ? e.message : String(e)}`
        );
      }
    })();
  });
}
