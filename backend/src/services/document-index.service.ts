import { inspect } from "node:util";
import { embeddingRuntimeLabel, env, hasEmbeddingApiKey } from "../config/env.js";
import { replaceContentChunks } from "../repositories/chunk.repository.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { chunkExtractedText } from "./chunking.service.js";
import { embedTexts } from "./embedding.service.js";

// adds qdrant context when vector index is configured (current backend).
function qdrantPipelineFields(): Record<string, string> {
  if (!env.QDRANT_URL?.trim()) return {};
  return {
    vectorBackend: "qdrant",
    qdrantCollection: env.QDRANT_COLLECTION,
  };
}

export async function indexExtractedTextForFile(
  contentId: string,
  cleanedText: string
): Promise<void> {
  const t0 = Date.now();

  if (!cleanedText.trim()) {
    log.info(
      filePipelinePanel("FILE PIPELINE · index · skipped", contentId, {
        reason: "cleaned text empty after extraction",
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

  const chunks = chunkExtractedText(cleanedText);
  if (chunks.length === 0) {
    log.info(
      filePipelinePanel("FILE PIPELINE · index · skipped", contentId, {
        reason: "chunking produced zero segments",
      })
    );
    return;
  }

  const tChunk = Date.now();
  const tokenCounts = chunks.map((c) => c.tokenCount);
  const totalChunkTokens = tokenCounts.reduce((a, b) => a + b, 0);
  const totalChunkChars = chunks.reduce((a, c) => a + c.content.length, 0);
  const firstPreview =
    chunks[0]?.content.slice(0, 120) +
    (chunks[0] && chunks[0].content.length > 120 ? "…" : "");

  log.info(
    filePipelinePanel("FILE PIPELINE · index · chunking done", contentId, {
      cleanedTextChars: cleanedText.length,
      chunkCount: chunks.length,
      totalChunkChars,
      totalChunkTokens,
      avgChunkChars: Math.round(totalChunkChars / chunks.length),
      avgChunkTokens: Math.round(totalChunkTokens / chunks.length),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
      firstChunkPreview: firstPreview || "(none)",
      ms: tChunk - t0,
      next: `${embeddingRuntimeLabel()} batch → replaceContentChunks (pg + qdrant)`,
      ...qdrantPipelineFields(),
    })
  );

  const embeddings = await embedTexts(chunks.map((c) => c.content));
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

  const rows = chunks.map((c, i) => ({
    content: c.content,
    embedding: embeddings[i]!,
    chunkIndex: i,
    tokenCount: c.tokenCount,
  }));

  log.info(
    filePipelinePanel("FILE PIPELINE · index · persist start", contentId, {
      rows: rows.length,
      steps: "postgres file_chunks → qdrant upsert",
      ...qdrantPipelineFields(),
    })
  );

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
}

export function scheduleDocumentIndexAfterExtraction(
  contentId: string,
  cleanedText: string
): void {
  log.info(
    filePipelinePanel("FILE PIPELINE · index · queued", contentId, {
      provider: env.EMBEDDING_PROVIDER,
      embedding: embeddingRuntimeLabel(),
      cleanedChars: cleanedText.length,
      next: "setImmediate → chunk → embed → replaceContentChunks (pg + qdrant)",
      ...qdrantPipelineFields(),
    })
  );
  setImmediate(() => {
    void indexExtractedTextForFile(contentId, cleanedText).catch((e) => {
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
