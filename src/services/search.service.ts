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
  fileId: string;
  fileName: string;
  type: string;
  createdAt: string;
  snippet: string;
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

  const seen = new Map<string, string>();
  for (const row of chunks) {
    if (seen.has(row.fileId)) continue;
    seen.set(row.fileId, truncateSnippet(row.content));
    if (seen.size >= MAX_RESULTS) break;
  }

  const orderedIds = [...seen.keys()];
  if (orderedIds.length === 0) {
    return { results: [] };
  }

  const files = await fileRepository.findFilesByIdsForUser(userId, orderedIds);
  const byId = new Map(files.map((f) => [f.id, f]));

  const results: SemanticSearchResultItem[] = [];
  for (const id of orderedIds) {
    const f = byId.get(id);
    if (!f) continue;
    const snippet = seen.get(id) ?? "";
    results.push({
      fileId: f.id,
      fileName: f.originalName,
      type: publicFileTypeLabel(f.originalName, f.mimeType),
      createdAt: f.createdAt.toISOString(),
      snippet,
    });
  }

  return { results };
}
