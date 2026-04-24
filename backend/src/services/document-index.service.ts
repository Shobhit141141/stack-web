import { inspect } from "node:util";
import { ChunkContentType } from "@prisma/client";
import { embeddingRuntimeLabel, env, hasEmbeddingApiKey } from "../config/env.js";
import { replaceContentChunks, type ChunkInsertRow } from "../repositories/chunk.repository.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { chunkExtractedText } from "./chunking.service.js";
import { embedTexts } from "./embedding.service.js";
import type { PdfImageIndexItem } from "./pdf-embedded-images.service.js";
import { logPdfVisualPipeline } from "../utils/debug-log.util.js";

// adds qdrant context when vector index is configured (current backend).
function qdrantPipelineFields(): Record<string, string> {
  if (!env.QDRANT_URL?.trim()) return {};
  return {
    vectorBackend: "qdrant",
    qdrantCollection: env.QDRANT_COLLECTION,
  };
}

export type DocumentIndexOptions = {
  pdfImageItems?: PdfImageIndexItem[];
};

export async function indexExtractedContentForFile(
  contentId: string,
  cleanedText: string,
  options?: DocumentIndexOptions
): Promise<void> {
  const t0 = Date.now();
  const pdfImages = options?.pdfImageItems ?? [];

  const textChunks = cleanedText.trim() ? chunkExtractedText(cleanedText) : [];

  if (textChunks.length === 0 && pdfImages.length === 0) {
    log.info(
      filePipelinePanel("FILE PIPELINE · index · skipped", contentId, {
        reason: "no text chunks and no PDF figure captions",
      })
    );
    return;
  }

  if (!hasEmbeddingApiKey()) {
    log.warn(
      filePipelinePanel("FILE PIPELINE · index · skipped", contentId, {
        provider: env.EMBEDDING_PROVIDER,
        reason:
          env.EMBEDDING_PROVIDER === "google"
            ? "GEMINI_API_KEY not set (Google AI Studio / Gemini API)"
            : "OPENAI_API_KEY not set",
      })
    );
    return;
  }

  const embedInputs: string[] = textChunks.map((c) => c.content);
  for (const img of pdfImages) {
    embedInputs.push(img.caption);
  }

  const tChunk = Date.now();
  log.info(
    filePipelinePanel("FILE PIPELINE · index · chunking done", contentId, {
      textChunkCount: textChunks.length,
      pdfFigureChunks: pdfImages.length,
      cleanedTextChars: cleanedText.length,
      ms: tChunk - t0,
      next: `${embeddingRuntimeLabel()} batch → replaceContentChunks (pg + qdrant)`,
      ...qdrantPipelineFields(),
    })
  );

  const embeddings = await embedTexts(embedInputs);
  const tEmbed = Date.now();
  const embedDims = embeddings[0]?.length ?? 0;

  log.info(
    filePipelinePanel("FILE PIPELINE · index · embeddings done", contentId, {
      vectors: embeddings.length,
      dims: embedDims,
      ms: tEmbed - tChunk,
      ...qdrantPipelineFields(),
    })
  );

  const rows: ChunkInsertRow[] = [];
  let ei = 0;
  for (let i = 0; i < textChunks.length; i++) {
    const c = textChunks[i]!;
    rows.push({
      content: c.content,
      embedding: embeddings[ei++]!,
      chunkIndex: i,
      tokenCount: c.tokenCount,
      chunkContentType: ChunkContentType.text,
    });
  }
  const textLen = textChunks.length;
  for (let j = 0; j < pdfImages.length; j++) {
    const img = pdfImages[j]!;
    rows.push({
      content: img.caption,
      embedding: embeddings[ei++]!,
      chunkIndex: textLen + j,
      tokenCount: img.tokenCount,
      chunkContentType: ChunkContentType.image,
      chunkMeta: img.chunkMeta,
    });
  }

  log.info(
    filePipelinePanel("FILE PIPELINE · index · persist start", contentId, {
      rows: rows.length,
      steps: "postgres file_chunks → qdrant upsert",
      ...qdrantPipelineFields(),
    })
  );

  if (pdfImages.length > 0) {
    logPdfVisualPipeline({
      phase: "index_embed_persist",
      contentId,
      textChunkCount: textChunks.length,
      pdfFigureChunkCount: pdfImages.length,
      totalRows: rows.length,
      embeddingModel: embeddingRuntimeLabel(),
    });
  }

  await replaceContentChunks(contentId, rows);
  const tDb = Date.now();

  log.info(
    filePipelinePanel("FILE PIPELINE · index · complete", contentId, {
      chunksWritten: rows.length,
      embedding: embeddingRuntimeLabel(),
      ms_chunking: tChunk - t0,
      ms_embeddings: tEmbed - tChunk,
      ms_persist: tDb - tEmbed,
      ms_total: tDb - t0,
      ...qdrantPipelineFields(),
    })
  );

  if (pdfImages.length > 0) {
    logPdfVisualPipeline({
      phase: "index_complete",
      contentId,
      chunksWritten: rows.length,
      ms_chunking: tChunk - t0,
      ms_embeddings: tEmbed - tChunk,
      ms_persist: tDb - tEmbed,
      ms_total: tDb - t0,
    });
  }
}

export function scheduleDocumentIndexAfterExtraction(
  contentId: string,
  cleanedText: string,
  options?: DocumentIndexOptions
): void {
  log.info(
    filePipelinePanel("FILE PIPELINE · index · queued", contentId, {
      provider: env.EMBEDDING_PROVIDER,
      embedding: embeddingRuntimeLabel(),
      cleanedChars: cleanedText.length,
      pdfFigureChunks: options?.pdfImageItems?.length ?? 0,
      next: "setImmediate → chunk → embed → replaceContentChunks (pg + qdrant)",
      ...qdrantPipelineFields(),
    })
  );
  setImmediate(() => {
    void indexExtractedContentForFile(contentId, cleanedText, options).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      const full = inspect(e, {
        depth: 12,
        colors: false,
        getters: true,
        maxStringLength: 20_000,
      });
      log.warn(
        [
          filePipelinePanel("FILE PIPELINE · index · failed", contentId, {
            error: msg,
          }),
          "  full error (inspect)",
          full.split("\n").map((line) => `  ${line}`).join("\n"),
        ].join("\n")
      );
    });
  });
}
