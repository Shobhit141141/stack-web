import * as fileRepository from "./file.repository.js";
import { getChunkVectorStore } from "../vector-store/index.js";
import type { ChunkVectorSearchRow } from "../vector-store/chunk-vector-store.interface.js";

export type ChunkSearchRow = ChunkVectorSearchRow;

export async function findNearestChunksForUser(params: {
  userId: string;
  embedding: number[];
  limit: number;
  /** When set, only chunks for these contents (e.g. from scoped file IDs). */
  restrictContentIds?: string[];
}): Promise<ChunkSearchRow[]> {
  const restrict = params.restrictContentIds;
  if (restrict && restrict.length === 0) {
    return [];
  }

  const filterContentIds =
    restrict ??
    (await fileRepository.findDistinctContentIdsForUser(params.userId));

  if (filterContentIds.length === 0) {
    return [];
  }

  return getChunkVectorStore().searchNearest({
    embedding: params.embedding,
    limit: params.limit,
    filterContentIds,
  });
}
