import { randomUUID } from "node:crypto";
import { ChunkContentType, Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { getChunkVectorStore } from "../vector-store/index.js";
import type { ChunkVectorRecord } from "../vector-store/chunk-vector-store.interface.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";

export type ChunkInsertRow = {
  content: string;
  embedding: number[];
  chunkIndex: number;
  tokenCount: number;
  chunkContentType?: ChunkContentType;
  chunkMeta?: Prisma.JsonValue | null;
};

function sanitizeChunkContentForPg(text: string): string {
  return text.replace(/\u0000/g, "");
}

// Replace all chunks for one content: postgres metadata + qdrant vectors.
export async function replaceContentChunks(
  contentId: string,
  rows: ChunkInsertRow[]
): Promise<void> {
  const ids = rows.map(() => randomUUID());

  const tPg0 = Date.now();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "file_chunks" WHERE "content_id" = ${contentId}::uuid
    `;
    if (rows.length === 0) return;

    const fragments = rows.map((r, i) => {
      const ct = r.chunkContentType ?? ChunkContentType.text;
      const metaSql =
        r.chunkMeta === undefined || r.chunkMeta === null
          ? Prisma.sql`NULL::jsonb`
          : Prisma.sql`CAST(${JSON.stringify(r.chunkMeta)} AS jsonb)`;
      return Prisma.sql`(${ids[i]}::uuid, ${contentId}::uuid, ${sanitizeChunkContentForPg(
        r.content
      )}, ${r.chunkIndex}::int, ${r.tokenCount}::int, ${ct}::"ChunkContentType", ${metaSql})`;
    });

    await tx.$executeRaw`
      INSERT INTO "file_chunks" ("id", "content_id", "content", "chunk_index", "token_count", "chunk_type", "chunk_meta")
      VALUES ${Prisma.join(fragments)}
    `;
  });
  const tPg1 = Date.now();

  log.info(
    filePipelinePanel("FILE PIPELINE · index · postgres file_chunks", contentId, {
      rows: rows.length,
      ms: tPg1 - tPg0,
    })
  );

  const vectorRows: ChunkVectorRecord[] = rows.map((r, i) => ({
    id: ids[i]!,
    contentId,
    content: r.content,
    chunkIndex: r.chunkIndex,
    tokenCount: r.tokenCount,
    embedding: r.embedding,
    chunkContentType: r.chunkContentType ?? ChunkContentType.text,
    chunkMeta: r.chunkMeta === undefined ? null : r.chunkMeta,
  }));

  await getChunkVectorStore().replaceContentChunks(contentId, vectorRows);
}
