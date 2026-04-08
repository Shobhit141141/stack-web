import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { vectorSql } from "./pgvector.util.js";

export type ChunkInsertRow = {
  content: string;
  embedding: number[];
  chunkIndex: number;
  tokenCount: number;
};

function sanitizeChunkContentForPg(text: string): string {
  return text.replace(/\u0000/g, "");
}

// Replace all chunks for one content in a single transaction.
export async function replaceContentChunks(
  contentId: string,
  rows: ChunkInsertRow[]
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "file_chunks" WHERE "content_id" = ${contentId}::uuid
    `;
    if (rows.length === 0) return;

    const fragments = rows.map(
      (r) =>
        Prisma.sql`(${randomUUID()}::uuid, ${contentId}::uuid, ${sanitizeChunkContentForPg(
          r.content
        )}, ${vectorSql(r.embedding)}, ${r.chunkIndex}::int, ${r.tokenCount}::int)`
    );

    await tx.$executeRaw`
      INSERT INTO "file_chunks" ("id", "content_id", "content", "embedding", "chunk_index", "token_count")
      VALUES ${Prisma.join(fragments)}
    `;
  });
}
