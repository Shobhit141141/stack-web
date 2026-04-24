// abstraction for chunk embeddings: pluggable vector db (qdrant) behind one interface

export type ChunkVectorContentType = "text" | "table" | "image";

export type ChunkVectorRecord = {
  id: string;
  contentId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  embedding: number[];
  chunkContentType?: ChunkVectorContentType;
  chunkMeta?: unknown | null;
};

export type ChunkVectorSearchRow = {
  contentId: string;
  content: string;
  chunkIndex: number;
  distance: number;
  chunkContentType: ChunkVectorContentType;
  chunkMeta?: unknown;
};

export interface ChunkVectorStore {
  // replaces all vectors for one content (delete then upsert); empty chunks deletes only
  replaceContentChunks(contentId: string, chunks: ChunkVectorRecord[]): Promise<void>;

  // removes vectors when content row is deleted from postgres
  deleteChunksForContent(contentId: string): Promise<void>;

  // euclidean distance in result matches former pgvector <-> l2
  searchNearest(params: {
    embedding: number[];
    limit: number;
    filterContentIds: string[];
  }): Promise<ChunkVectorSearchRow[]>;
}
