import {
  hasRagCompletionConfigured,
  ragCompletionModelDefault,
  env,
} from "../config/env.js";
import { googleDescribeImage } from "../client/google-genai.client.js";
import { openaiDescribeImage } from "../client/openai.client.js";
import { isImageMimeType } from "../constants/upload-file-types.js";
import { log } from "../utils/logger/index.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { scheduleDocumentIndexAfterExtraction } from "./document-index.service.js";
import { scheduleContentSummaryGeneration } from "./summary.service.js";

const IMAGE_DESC_MAX_CHARS = 4_000;

// builds a concise instruction for semantic indexing text from an image.
function imageDescriptionSystemInstruction(): string {
  return [
    "You create semantic search text for an uploaded image in a file manager.",
    "Describe visible objects, scene context, and key attributes users may search for.",
    "Output one concise plain-text paragraph.",
    "Do not use markdown, bullets, or headings.",
  ].join("\n");
}

// builds the user prompt used for image description generation.
function imageDescriptionUserMessage(originalName: string): string {
  return [
    `File name: ${originalName}`,
    "Describe what is visually present so text search queries can match this image.",
  ].join("\n");
}

// normalizes generated image description text for embedding/indexing.
function normalizeImageDescription(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= IMAGE_DESC_MAX_CHARS) return cleaned;
  return cleaned.slice(0, IMAGE_DESC_MAX_CHARS).trimEnd();
}

// generates searchable text from an image using the configured completion provider.
async function generateImageSearchText(params: {
  mimeType: string;
  buffer: Buffer;
  originalName: string;
}): Promise<string> {
  const systemInstruction = imageDescriptionSystemInstruction();
  const userMessage = imageDescriptionUserMessage(params.originalName);
  if (env.RAG_COMPLETION_PROVIDER === "google") {
    const out = await googleDescribeImage({
      model: env.GEMINI_CHAT_MODEL,
      systemInstruction,
      userMessage,
      temperature: 0.2,
      imageMimeType: params.mimeType,
      imageBytes: params.buffer,
    });
    return normalizeImageDescription(out.text);
  }
  const out = await openaiDescribeImage({
    model: env.OPENAI_CHAT_MODEL,
    systemInstruction,
    userMessage,
    temperature: 0.2,
    imageMimeType: params.mimeType,
    imageBytes: params.buffer,
  });
  return normalizeImageDescription(out.text);
}

// queues async image semantic indexing and summary generation.
export function scheduleImageIndexAfterUpload(ctx: {
  contentId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}): void {
  if (!isImageMimeType(ctx.mimeType)) {
    log.info(
      filePipelinePanel("FILE PIPELINE · image-index · skipped", ctx.contentId, {
        mime: ctx.mimeType,
        reason: "only image uploads run image semantic indexing",
      })
    );
    return;
  }
  if (!hasRagCompletionConfigured()) {
    log.warn(
      filePipelinePanel("FILE PIPELINE · image-index · skipped", ctx.contentId, {
        mime: ctx.mimeType,
        reason: "completion provider not configured",
      })
    );
    return;
  }
  log.info(
    filePipelinePanel("FILE PIPELINE · image-index · queued", ctx.contentId, {
      mime: ctx.mimeType,
      originalName: ctx.originalName,
      bytes: ctx.buffer.length,
      next: "vision description -> embed -> qdrant",
    })
  );
  setImmediate(() => {
    void (async () => {
      try {
        const searchText = await generateImageSearchText({
          mimeType: ctx.mimeType,
          buffer: ctx.buffer,
          originalName: ctx.originalName,
        });
        if (!searchText) {
          log.warn(
            filePipelinePanel("FILE PIPELINE · image-index · skipped", ctx.contentId, {
              mime: ctx.mimeType,
              reason: "empty generated description",
            })
          );
          return;
        }
        scheduleDocumentIndexAfterExtraction(ctx.contentId, searchText);
        scheduleContentSummaryGeneration({
          contentId: ctx.contentId,
          extractedText: searchText,
        });
        log.info(
          filePipelinePanel("FILE PIPELINE · image-index · done", ctx.contentId, {
            mime: ctx.mimeType,
            generatedChars: searchText.length,
            model: ragCompletionModelDefault(),
          })
        );
      } catch (e) {
        log.warn(
          filePipelinePanel("FILE PIPELINE · image-index · failed", ctx.contentId, {
            mime: ctx.mimeType,
            error: e instanceof Error ? e.message : String(e),
          })
        );
      }
    })();
  });
}
