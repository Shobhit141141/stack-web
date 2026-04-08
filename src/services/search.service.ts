import * as embeddingService from "./embedding.service.js";
import * as fileRepository from "../repositories/file.repository.js";
import * as searchRepository from "../repositories/search.repository.js";
import { publicFileTypeLabel } from "../utils/file-query-parser.js";

const NEAREST_CHUNK_LIMIT = 30;
const MAX_RESULTS = 10;
const SNIPPET_MAX_CHARS = 400;

function truncateSnippet(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= SNIPPET_MAX_CHARS) return t;
  return `${t.slice(0, SNIPPET_MAX_CHARS)}…`;
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
  query: string
): Promise<{ results: SemanticSearchResultItem[] }> {
  const embedding = await embeddingService.embedQuery(query);
  const chunks = await searchRepository.findNearestChunksForUser({
    userId,
    embedding,
    limit: NEAREST_CHUNK_LIMIT,
  });

  const seen = new Map<string, { snippet: string; score: number }>();
  for (const row of chunks) {
    if (seen.has(row.contentId)) continue;
    seen.set(row.contentId, {
      snippet: truncateSnippet(row.content),
      score: 1 / (1 + Math.max(row.distance, 0)),
    });
    if (seen.size >= MAX_RESULTS) break;
  }

  const orderedContentIds = [...seen.keys()];
  if (orderedContentIds.length === 0) {
    return { results: [] };
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

  return { results };
}
