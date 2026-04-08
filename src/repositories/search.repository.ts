import { prisma } from "./db.js";
import { vectorSql } from "./pgvector.util.js";

export type ChunkSearchRow = {
  contentId: string;
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
      contentId: string;
      content: string;
      chunkIndex: number;
      distance: unknown;
    }>
  >`
    SELECT fc.content_id AS "contentId",
           fc.content AS "content",
           fc.chunk_index AS "chunkIndex",
           fc.embedding <-> ${vec} AS distance
    FROM file_chunks fc
    WHERE EXISTS (
      SELECT 1
      FROM files f
      WHERE f.content_id = fc.content_id
        AND f.user_id = ${params.userId}::uuid
    )
    ORDER BY fc.embedding <-> ${vec} ASC
    LIMIT ${params.limit}
  `;
  return rows.map((r) => ({
    contentId: r.contentId,
    content: r.content,
    chunkIndex: r.chunkIndex,
    distance: Number(r.distance),
  }));
}
