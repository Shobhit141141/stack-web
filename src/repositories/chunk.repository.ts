import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { EMBEDDING_DIM } from "../constants/embeddings.js";
import { prisma } from "./db.js";

export type ChunkInsertRow = {
  content: string;
  embedding: number[];
  chunkIndex: number;
  tokenCount: number;
};

function assertEmbeddingShape(v: number[]): void {
  if (v.length !== EMBEDDING_DIM) {
    throw new Error(`Expected embedding length ${EMBEDDING_DIM}, got ${v.length}`);
  }
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) {
      throw new Error("Embedding contains non-finite value");
    }
  }
}

// safe pgvector literal: only commas and numeric characters from validated floats.
function vectorSql(embedding: number[]): Prisma.Sql {
  assertEmbeddingShape(embedding);
  const inner = embedding.join(",");
  return Prisma.raw(`'[${inner}]'::vector`);
}

  // replace all chunks for a file in one transaction: delete existing, then a single multi-row INSERT.
export async function replaceFileChunks(fileId: string, rows: ChunkInsertRow[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.fileChunk.deleteMany({ where: { fileId } });
    if (rows.length === 0) return;

    const fragments = rows.map(
      (r) =>
        Prisma.sql`(${randomUUID()}::uuid, ${fileId}::uuid, ${r.content}, ${vectorSql(
          r.embedding
        )}, ${r.chunkIndex}::int, ${r.tokenCount}::int)`
    );

    await tx.$executeRaw`
      INSERT INTO "file_chunks" ("id", "file_id", "content", "embedding", "chunk_index", "token_count")
      VALUES ${Prisma.join(fragments)}
    `;
  });
}
