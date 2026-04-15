import type { ChunkVectorStore } from "./chunk-vector-store.interface.js";
import { getQdrantChunkVectorStore } from "./qdrant-chunk-vector-store.js";

// single backend today: qdrant. swap factory if you add another adapter.
export function getChunkVectorStore(): ChunkVectorStore {
  return getQdrantChunkVectorStore();
}

export type { ChunkVectorRecord, ChunkVectorSearchRow, ChunkVectorStore } from "./chunk-vector-store.interface.js";
