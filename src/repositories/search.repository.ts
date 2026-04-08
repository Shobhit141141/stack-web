import { prisma } from "./db.js";
import { vectorSql } from "./pgvector.util.js";

export type ChunkSearchRow = {
  fileId: string;
  content: string;
  chunkIndex: number;
  distance: number;
};

export async function findNearestChunksForUser(params: {
  userId: string;
  embedding: number[];
  limit: number;
}): Promise<ChunkSearchRow[]> {
  const vec = vectorSql(params.embedding);
  const rows = await prisma.$queryRaw<
    Array<{
      fileId: string;
      content: string;
      chunkIndex: number;
      distance: unknown;
    }>
  >`
    SELECT fc.file_id AS "fileId",
           fc.content AS "content",
           fc.chunk_index AS "chunkIndex",
           fc.embedding <-> ${vec} AS distance
    FROM file_chunks fc
    INNER JOIN files f ON f.id = fc.file_id
    WHERE f.user_id = ${params.userId}::uuid
    ORDER BY fc.embedding <-> ${vec} ASC
    LIMIT ${params.limit}
  `;
  return rows.map((r) => ({
    fileId: r.fileId,
    content: r.content,
    chunkIndex: r.chunkIndex,
    distance: Number(r.distance),
  }));
}
