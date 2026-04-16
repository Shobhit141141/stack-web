import { performance } from "node:perf_hooks";
import { env } from "../config/env.js";
import * as embeddingService from "./embedding.service.js";
import * as fileRepository from "../repositories/file.repository.js";
import * as searchRepository from "../repositories/search.repository.js";
import * as workspaceService from "./workspace.service.js";
import { publicFileTypeLabel } from "../utils/file-query-parser.js";
import { log } from "../utils/logger/index.js";
import { searchApiPanel } from "../utils/search-log.util.js";
import { logSemanticSearchDebug } from "../utils/debug-log.util.js";

const NEAREST_CHUNK_LIMIT = 30;
const MAX_RESULTS = 10;
const SNIPPET_MAX_CHARS = 400;

function truncateSnippet(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= SNIPPET_MAX_CHARS) return t;
  return `${t.slice(0, SNIPPET_MAX_CHARS)}…`;
}

function fallbackSnippetForFileName(name: string): string {
  return `Matched by filename: ${name}`;
}

export type SemanticSearchResultItem = {
  contentId: string;
  fileId: string;
  fileName: string;
  type: string;
  createdAt: string;
  score: number;
  snippet: string;
  duplicates: Array<{
    fileId: string;
    fileName: string;
    type: string;
    createdAt: string;
  }>;
};

export async function semanticSearchUserFiles(
  userId: string,
  query: string,
  options?: { workspaceId?: string }
): Promise<{ results: SemanticSearchResultItem[] }> {
  const t0 = performance.now();

  let restrictContentIds: string[] | undefined;
  if (options?.workspaceId) {
    await workspaceService.assertWorkspaceOwned(userId, options.workspaceId);
    const fids = await fileRepository.findFileIdsByWorkspaceForUser(
      userId,
      options.workspaceId
    );
    if (fids.length === 0) {
      restrictContentIds = [];
    } else {
      const map = await fileRepository.findContentIdsByFileIdsForUser(
        userId,
        fids
      );
      restrictContentIds = [...new Set([...map.values()])];
    }
  }

  const tEmbed = performance.now();
  const embedding = await embeddingService.embedQuery(query);
  const embedMs = performance.now() - tEmbed;

  const tVec = performance.now();
  const chunks = await searchRepository.findNearestChunksForUser({
    userId,
    embedding,
    limit: NEAREST_CHUNK_LIMIT,
    restrictContentIds,
  });
  const vectorMs = performance.now() - tVec;

  const tAsm = performance.now();
  // keep semantic threshold aligned with ask RAG retrieval so /search and /ask
  // return consistent matches for the same corpus/query.
  const minScore = env.RAG_MIN_CHUNK_SCORE;
  const seen = new Map<string, { snippet: string; score: number }>();
  for (const row of chunks) {
    if (seen.has(row.contentId)) continue;
    const score = Math.max(0, 1 - row.distance);
    if (score < minScore) continue;
    seen.set(row.contentId, {
      snippet: truncateSnippet(row.content),
      score,
    });
    if (seen.size >= MAX_RESULTS) break;
  }

  // if vector search returned neighbors but all are below threshold, keep top nearest
  // results as a fallback so semantic search does not appear broken on short/vague queries.
  if (seen.size === 0 && chunks.length > 0) {
    for (const row of chunks) {
      if (seen.has(row.contentId)) continue;
      const score = Math.max(0, 1 - row.distance);
      seen.set(row.contentId, {
        snippet: truncateSnippet(row.content),
        score,
      });
      if (seen.size >= MAX_RESULTS) break;
    }
  }

  const orderedContentIds = [...seen.keys()];
  if (orderedContentIds.length === 0) {
    const hinted = await fileRepository.findFilesByNameHintForUser(userId, query);
    const filteredHinted =
      options?.workspaceId === undefined
        ? hinted
        : hinted.filter((f) => f.workspaceId === options.workspaceId);
    const fallback = filteredHinted.slice(0, MAX_RESULTS).map((f) => ({
      contentId: "",
      fileId: f.id,
      fileName: f.originalName,
      type: publicFileTypeLabel(f.originalName, f.mimeType),
      createdAt: f.createdAt.toISOString(),
      score: 0,
      snippet: fallbackSnippetForFileName(f.originalName),
      duplicates: [],
    }));
    const assembleMs = performance.now() - tAsm;
    const totalMs = performance.now() - t0;
    log.info(
      searchApiPanel({
        userId,
        queryChars: query.length,
        embedMs,
        vectorMs,
        assembleMs,
        totalMs,
        chunksFetched: chunks.length,
        distinctContents: 0,
        resultsReturned: fallback.length,
        duplicateFilesListed: 0,
      })
    );
    logSemanticSearchDebug({
      userId,
      ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
      question: query,
      prompt: "embed query -> qdrant nearest-neighbor search -> score filter -> assemble results",
      response: "No semantic matches",
      sources: [],
    });
    return { results: fallback };
  }

  const files = await fileRepository.findFilesByContentIdsForUser(
    userId,
    orderedContentIds
  );
  const byContent = new Map<string, typeof files>();
  for (const f of files) {
    const bucket = byContent.get(f.contentId) ?? [];
    bucket.push(f);
    byContent.set(f.contentId, bucket);
  }

  const results: SemanticSearchResultItem[] = [];
  for (const contentId of orderedContentIds) {
    const group = byContent.get(contentId) ?? [];
    if (group.length === 0) continue;
    group.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const primary = group[0]!;
    const match = seen.get(contentId)!;
    results.push({
      contentId,
      fileId: primary.id,
      fileName: primary.originalName,
      type: publicFileTypeLabel(primary.originalName, primary.mimeType),
      createdAt: primary.createdAt.toISOString(),
      score: match.score,
      snippet: match.snippet,
      duplicates: group.slice(1).map((f) => ({
        fileId: f.id,
        fileName: f.originalName,
        type: publicFileTypeLabel(f.originalName, f.mimeType),
        createdAt: f.createdAt.toISOString(),
      })),
    });
  }

  const duplicateFilesListed = results.reduce(
    (n, r) => n + r.duplicates.length,
    0
  );
  const assembleMs = performance.now() - tAsm;
  const totalMs = performance.now() - t0;

  log.info(
    searchApiPanel({
      userId,
      queryChars: query.length,
      embedMs,
      vectorMs,
      assembleMs,
      totalMs,
      chunksFetched: chunks.length,
      distinctContents: seen.size,
      resultsReturned: results.length,
      duplicateFilesListed,
    })
  );
  logSemanticSearchDebug({
    userId,
    ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
    question: query,
    prompt: "embed query -> qdrant nearest-neighbor search -> score filter -> assemble results",
    response: `Returned ${results.length} search result(s)`,
    sources: results.map((r) => ({
      fileId: r.fileId,
      fileName: r.fileName,
      score: Number(r.score.toFixed(4)),
    })),
  });

  return { results };
}
