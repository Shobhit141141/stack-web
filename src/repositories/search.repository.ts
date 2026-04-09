import { Prisma } from "@prisma/client";
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
  /** When set, only chunks for these contents (e.g. from scoped file IDs). */
  restrictContentIds?: string[];
}): Promise<ChunkSearchRow[]> {
  const vec = vectorSql(params.embedding);
  const restrict = params.restrictContentIds;
  if (restrict && restrict.length === 0) {
    return [];
  }

  // contentClause is a SQL clause that restricts the search to only chunks for the specified content IDs
  const contentClause =
    restrict && restrict.length > 0
      ? Prisma.sql`AND fc.content_id IN (${Prisma.join(
          restrict.map((id) => Prisma.sql`${id}::uuid`)
        )})`
      : Prisma.empty;

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
    ${contentClause}
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
