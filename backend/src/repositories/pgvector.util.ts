import { Prisma } from "@prisma/client";
import { EMBEDDING_DIM } from "../constants/embeddings.js";

export function assertEmbeddingShape(v: number[]): void {
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
export function vectorSql(embedding: number[]): Prisma.Sql {
  assertEmbeddingShape(embedding);
  const inner = embedding.join(",");
  return Prisma.raw(`'[${inner}]'::vector`);
}
