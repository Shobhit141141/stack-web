import { performance } from "node:perf_hooks";
import { env, ragCompletionModelDefault } from "../config/env.js";
import { buildAskSystemInstruction, buildAskUserMessage } from "../rag/prompt.js";
import * as embeddingService from "./embedding.service.js";
import * as ragCompletionService from "./rag-completion.service.js";
import * as fileRepository from "../repositories/file.repository.js";
import * as searchRepository from "../repositories/search.repository.js";
import * as workspaceRepository from "../repositories/workspace.repository.js";
import { askApiPanel } from "../utils/ask-log.util.js";
import { log } from "../utils/logger/index.js";

export type AskSource = {
  fileId: string;
  fileName: string;
  snippet: string;
};

export type AskResult = {
  answer: string;
  sources: AskSource[];
};

type ChunkHit = searchRepository.ChunkSearchRow & { score: number };

const SNIPPET_MAX_CHARS = 400;

function distanceToScore(distance: number): number {
  return 1 / (1 + Math.max(distance, 0));
}

function truncateSnippet(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= SNIPPET_MAX_CHARS) return t;
  return `${t.slice(0, SNIPPET_MAX_CHARS)}…`;
}

function trimContextToMax(context: string, max: number): string {
  if (context.length <= max) return context;
  return `${context.slice(0, max)}…`;
}

function summarizeSelectedChunks(chunks: ChunkHit[]): string {
  if (chunks.length === 0) return "(none)";
  return chunks
    .map(
      (c) =>
        `${c.contentId}|idx${c.chunkIndex}|score${c.score.toFixed(4)}`
    )
    .join("; ");
}

function formatScoresFromPacks(
  packs: Array<{ contentId: string; bestScore: number }>
): string {
  if (packs.length === 0) return "(none)";
  return packs
    .map((p) => `${p.contentId}=${p.bestScore.toFixed(4)}`)
    .join("; ");
}

export async function askUserFiles(params: {
  userId: string;
  query: string;
  fileIds?: string[];
  workspaceId?: string;
}): Promise<AskResult> {
  const t0 = performance.now();
  const rawQuery = params.query.trim();

  let scopedFileIds = 0;
  let restrictContentIds: string[] | undefined;

  let effectiveFileIds: string[] | undefined;

  if (params.workspaceId) {
    const ws = await workspaceRepository.findWorkspaceByIdForUser(
      params.workspaceId,
      params.userId
    );
    if (!ws) {
      throw new InvalidWorkspaceError();
    }
    const wsFileIds = await fileRepository.findFileIdsByWorkspaceForUser(
      params.userId,
      params.workspaceId
    );
    const wsSet = new Set(wsFileIds);
    if (params.fileIds && params.fileIds.length > 0) {
      const unique = [...new Set(params.fileIds)];
      for (const id of unique) {
        if (!wsSet.has(id)) {
          throw new InvalidFileIdsError();
        }
      }
      effectiveFileIds = unique;
    } else {
      effectiveFileIds = wsFileIds;
    }
  } else if (params.fileIds && params.fileIds.length > 0) {
    effectiveFileIds = params.fileIds;
  }

  if (effectiveFileIds !== undefined) {
    const uniqueFileIds = [...new Set(effectiveFileIds)];
    scopedFileIds = uniqueFileIds.length;
    if (uniqueFileIds.length === 0) {
      restrictContentIds = [];
    } else {
      const map = await fileRepository.findContentIdsByFileIdsForUser(
        params.userId,
        uniqueFileIds
      );
      if (map.size !== uniqueFileIds.length) {
        throw new InvalidFileIdsError();
      }
      restrictContentIds = [...new Set([...map.values()])];
    }
  }

  const tEmbed = performance.now();
  const embedding = await embeddingService.embedQuery(rawQuery);
  const embedMs = performance.now() - tEmbed;

  const tVec = performance.now();
  const rows = await searchRepository.findNearestChunksForUser({
    userId: params.userId,
    embedding,
    limit: env.RAG_VECTOR_CHUNK_LIMIT,
    restrictContentIds,
  });
  const vectorMs = performance.now() - tVec;

  // min chunk score means : how close the chunk is to the query
  const minScore = env.RAG_MIN_CHUNK_SCORE;
  const hits: ChunkHit[] = rows
    .map((r) => ({
      ...r,
      score: distanceToScore(r.distance),
    }))
    .filter((h) => h.score >= minScore);

  const byContent = new Map<string, ChunkHit[]>();
  for (const h of hits) {
    const arr = byContent.get(h.contentId) ?? [];
    arr.push(h);

    // contentId is the id of the content that the chunk belongs to
    // arr is an array of chunks that belong to the same content
    byContent.set(h.contentId, arr);
  }

  const maxCp = env.RAG_MAX_CHUNKS_PER_CONTENT;
  type ContentPack = {
    contentId: string;
    bestScore: number;
    chunks: ChunkHit[];
  };
  const packs: ContentPack[] = [];

  // input : a map of contentId to an array of chunks that belong to the same content
  // output : an array of content packs
  // a content pack is an object with the following properties:
  // - contentId: the id of the content that the pack belongs to
  // - bestScore: the score of the best chunk in the pack
  // - chunks: an array of chunks that belong to the pack, sorted by score in descending order, sliced to maxCp
  for (const [contentId, arr] of byContent) {
    arr.sort((a, b) => b.score - a.score);
    const chunks = arr.slice(0, maxCp);
    const bestScore = chunks[0]?.score ?? 0;
    packs.push({ contentId, bestScore, chunks });
  }

  packs.sort((a, b) => b.bestScore - a.bestScore);
  const topPacks = packs.slice(0, env.RAG_TOP_CONTENT_COUNT);

  const topContentIds = topPacks.map((p) => p.contentId);

  let selectedChunks: ChunkHit[] = [];
  for (const p of topPacks) {
    selectedChunks = selectedChunks.concat(p.chunks);
  }

  const chunksAfterScoreFilter = hits.length;

  const contentIdsBeforeDedup = [...new Set(packs.map((p) => p.contentId))].sort();
  const contentIdsAfterDedup = topPacks.map((p) => p.contentId);
  const scoresBeforeDedup = formatScoresFromPacks(packs);
  const scoresAfterDedup = formatScoresFromPacks(topPacks);

  if (topPacks.length === 0) {
    const totalMs = performance.now() - t0;
    log.info(
      askApiPanel({
        userId: params.userId,
        query: rawQuery,
        queryChars: rawQuery.length,
        scopedFileIds,
        embedMs,
        vectorMs,
        llmMs: 0,
        totalMs,
        chunksFetched: rows.length,
        chunksAfterScoreFilter,
        distinctContentsPacked: packs.length,
        contentIdsBeforeDedup,
        contentIdsAfterDedup,
        scoresBeforeDedup,
        scoresAfterDedup,
        selectedChunksDetail: "(none)",
        selectedChunkCount: 0,
        contextChars: 0,
        model: ragCompletionModelDefault(),
        modelVersion: undefined,
      })
    );
    return { answer: "Not found in files", sources: [] };
  }

  const files = await fileRepository.findFilesByContentIdsForUser(
    params.userId,
    topContentIds
  );
  const byContentFiles = new Map<string, typeof files>();
  for (const f of files) {
    const arr = byContentFiles.get(f.contentId) ?? [];
    arr.push(f);
    byContentFiles.set(f.contentId, arr);
  }
  for (const [, arr] of byContentFiles) {
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const contextParts: string[] = [];
  for (const p of topPacks) {
    const group = byContentFiles.get(p.contentId) ?? [];
    const file = group[0];
    if (!file) continue;
    const chunkTexts = p.chunks.map((c) => c.content.trim()).filter(Boolean);
    if (chunkTexts.length === 0) continue;
    const body = chunkTexts.join("\n\n");
    contextParts.push(`[File: ${file.originalName}]\n${body}`);
  }

  let context = contextParts.join("\n\n");
  if (!context.trim()) {
    const totalMs = performance.now() - t0;
    log.info(
      // askApiPanel is a function that logs the ask API call to the console
      askApiPanel({
        userId: params.userId,
        query: rawQuery,
        queryChars: rawQuery.length,
        scopedFileIds,
        embedMs,
        vectorMs,
        llmMs: 0,
        totalMs,
        chunksFetched: rows.length,
        chunksAfterScoreFilter,
        distinctContentsPacked: packs.length,
        contentIdsBeforeDedup,
        contentIdsAfterDedup,
        scoresBeforeDedup,
        scoresAfterDedup,
        selectedChunksDetail: summarizeSelectedChunks(selectedChunks),
        selectedChunkCount: selectedChunks.length,
        contextChars: 0,
        model: ragCompletionModelDefault(),
        modelVersion: undefined,
      })
    );
    return { answer: "Not found in files", sources: [] };
  }

  context = trimContextToMax(context, env.RAG_MAX_CONTEXT_CHARS);

  const systemInstruction = buildAskSystemInstruction();
  const userMessage = buildAskUserMessage({ context, query: rawQuery });

  const tLlm = performance.now();
  let answer: string;
  let genModel = ragCompletionModelDefault();
  let genModelVersion: string | undefined;
  let tokensPrompt: number | undefined;
  let tokensCandidates: number | undefined;
  let tokensTotal: number | undefined;
  try {
    const gen = await ragCompletionService.generateRagCompletion({
      systemInstruction,
      userMessage,
      temperature: env.RAG_TEMPERATURE,
    });
    answer = gen.text;
    genModel = gen.model;
    genModelVersion = gen.modelVersion;
    tokensPrompt = gen.usage.promptTokens;
    tokensCandidates = gen.usage.completionTokens;
    tokensTotal = gen.usage.totalTokens;
  } catch (e) {
    const totalMs = performance.now() - t0;
    const llmErrMs = performance.now() - tLlm;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`askUserFiles: RAG completion failed: ${msg}`);
    log.info(
      askApiPanel({
        userId: params.userId,
        query: rawQuery,
        queryChars: rawQuery.length,
        scopedFileIds,
        embedMs,
        vectorMs,
        llmMs: llmErrMs,
        totalMs,
        chunksFetched: rows.length,
        chunksAfterScoreFilter,
        distinctContentsPacked: packs.length,
        contentIdsBeforeDedup,
        contentIdsAfterDedup,
        scoresBeforeDedup,
        scoresAfterDedup,
        selectedChunksDetail: summarizeSelectedChunks(selectedChunks),
        selectedChunkCount: selectedChunks.length,
        contextChars: context.length,
        model: genModel,
        modelVersion: genModelVersion,
      })
    );
    throw e;
  }
  const llmMs = performance.now() - tLlm;

  const trimmed = answer.trim();
  if (!trimmed) {
    answer = "Not found in files";
  } else {
    answer = trimmed;
  }

  const sources: AskSource[] = [];
  for (const p of topPacks) {
    const group = byContentFiles.get(p.contentId) ?? [];
    const file = group[0];
    if (!file) continue;
    for (const ch of p.chunks) {
      sources.push({
        fileId: file.id,
        fileName: file.originalName,
        snippet: truncateSnippet(ch.content),
      });
    }
  }

  const totalMs = performance.now() - t0;
  log.info(
    askApiPanel({
      userId: params.userId,
      query: rawQuery,
      queryChars: rawQuery.length,
      scopedFileIds,
      embedMs,
      vectorMs,
      llmMs,
      totalMs,
      chunksFetched: rows.length,
      chunksAfterScoreFilter,
      distinctContentsPacked: packs.length,
      contentIdsBeforeDedup,
      contentIdsAfterDedup,
      scoresBeforeDedup,
      scoresAfterDedup,
      selectedChunksDetail: summarizeSelectedChunks(selectedChunks),
      selectedChunkCount: selectedChunks.length,
      contextChars: context.length,
      tokensPrompt,
      tokensCandidates,
      tokensTotal,
      model: genModel,
      modelVersion: genModelVersion,
    })
  );

  return { answer, sources };
}

export class InvalidFileIdsError extends Error {
  constructor() {
    super("INVALID_FILE_IDS");
    this.name = "InvalidFileIdsError";
  }
}

export class InvalidWorkspaceError extends Error {
  constructor() {
    super("INVALID_WORKSPACE");
    this.name = "InvalidWorkspaceError";
  }
}
