import { EMBEDDING_DIM } from "../constants/embeddings.js";

// validates length and finite values before sending vectors to qdrant or embedders
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
