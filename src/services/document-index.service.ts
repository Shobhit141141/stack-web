import { embeddingRuntimeLabel, env, hasEmbeddingApiKey } from "../config/env.js";
import { replaceFileChunks } from "../repositories/chunk.repository.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { chunkExtractedText } from "./chunking.service.js";
import { embedTexts } from "./embedding.service.js";

export async function indexExtractedTextForFile(
  fileId: string,
  cleanedText: string
): Promise<void> {
  const t0 = Date.now();

  if (!cleanedText.trim()) {
    log.info(
      filePipelinePanel("FILE PIPELINE · index · skipped", fileId, {
        reason: "cleaned text empty after extraction",
      })
    );
    return;
  }

  if (!hasEmbeddingApiKey()) {
    log.warn(
      filePipelinePanel("FILE PIPELINE · index · skipped", fileId, {
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
      filePipelinePanel("FILE PIPELINE · index · skipped", fileId, {
        reason: "chunking produced zero segments",
      })
    );
    return;
  }

  const tChunk = Date.now();
  const tokenCounts = chunks.map((c) => c.tokenCount);
  const totalChunkTokens = tokenCounts.reduce((a, b) => a + b, 0);

  log.info(
    filePipelinePanel("FILE PIPELINE · index · chunking done", fileId, {
      chunkCount: chunks.length,
      totalChunkTokens,
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
      ms: tChunk - t0,
      next: `${embeddingRuntimeLabel()} batch → replaceFileChunks`,
    })
  );

  const embeddings = await embedTexts(chunks.map((c) => c.content));
  const tEmbed = Date.now();

  const rows = chunks.map((c, i) => ({
    content: c.content,
    embedding: embeddings[i]!,
    chunkIndex: i,
    tokenCount: c.tokenCount,
  }));

  await replaceFileChunks(fileId, rows);
  const tDb = Date.now();

  log.info(
    filePipelinePanel("FILE PIPELINE · index · complete", fileId, {
      chunksWritten: rows.length,
      embedding: embeddingRuntimeLabel(),
      ms_chunking: tChunk - t0,
      ms_embeddings: tEmbed - tChunk,
      ms_database: tDb - tEmbed,
      ms_total: tDb - t0,
    })
  );
}

export function scheduleDocumentIndexAfterExtraction(fileId: string, cleanedText: string): void {
  log.info(
    filePipelinePanel("FILE PIPELINE · index · queued", fileId, {
      provider: env.EMBEDDING_PROVIDER,
      embedding: embeddingRuntimeLabel(),
      cleanedChars: cleanedText.length,
      next: "setImmediate → chunk → embed → replaceFileChunks",
    })
  );
  setImmediate(() => {
    void indexExtractedTextForFile(fileId, cleanedText).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(
        filePipelinePanel("FILE PIPELINE · index · failed", fileId, {
          error: msg,
        })
      );
    });
  });
}
