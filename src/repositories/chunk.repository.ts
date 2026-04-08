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

// replace all chunks for a file in one transaction: delete existing, then a single multi-row INSERT.
export async function replaceFileChunks(fileId: string, rows: ChunkInsertRow[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.fileChunk.deleteMany({ where: { fileId } });
    if (rows.length === 0) return;

    const fragments = rows.map(
      (r) =>
        Prisma.sql`(${randomUUID()}::uuid, ${fileId}::uuid, ${sanitizeChunkContentForPg(
          r.content
        )}, ${vectorSql(r.embedding)}, ${r.chunkIndex}::int, ${r.tokenCount}::int)`
    );

    await tx.$executeRaw`
      INSERT INTO "file_chunks" ("id", "file_id", "content", "embedding", "chunk_index", "token_count")
      VALUES ${Prisma.join(fragments)}
    `;
  });
}
