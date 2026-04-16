import { QdrantClient } from "@qdrant/js-client-rest";
import { EMBEDDING_DIM } from "../constants/embeddings.js";
import { env } from "../config/env.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { assertEmbeddingShape } from "./embedding.util.js";
import type {
  ChunkVectorRecord,
  ChunkVectorSearchRow,
  ChunkVectorStore,
} from "./chunk-vector-store.interface.js";

const BATCH = 128;

const CONTENT_ID_PAYLOAD_FIELD = "content_id";

function sanitizePayloadText(text: string): string {
  return text.replace(/\u0000/g, "");
}

/** Qdrant REST / OpenAPI client: missing collection or nothing to delete */
function isQdrantNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const o = err as { status?: number; message?: string };
  if (o.status === 404) return true;
  if (typeof o.message === "string" && /not\s*found/i.test(o.message)) return true;
  return false;
}

export class QdrantChunkVectorStore implements ChunkVectorStore {
  private readonly client: QdrantClient;
  private readonly collection: string;
  private ensurePromise: Promise<void> | null = null;
  private collectionLifecycleLogged = false;

  constructor(url: string, apiKey: string | undefined, collection: string) {
    this.client = new QdrantClient({
      url,
      ...(apiKey ? { apiKey } : {}),
    });
    this.collection = collection;
  }

  // creates collection once if missing; cosine distance for normalized similarity scores (0-1)
  private async ensureCollection(): Promise<void> {
    const cols = await this.client.getCollections();
    const exists = cols.collections.some((c) => c.name === this.collection);
    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: {
          size: EMBEDDING_DIM,
          distance: "Cosine",
        },
      });
    }
    await this.ensureContentIdPayloadIndex();
    if (!this.collectionLifecycleLogged) {
      this.collectionLifecycleLogged = true;
      log.info(
        filePipelinePanel("FILE PIPELINE · qdrant · collection", "-", {
          collection: this.collection,
          vectorSize: EMBEDDING_DIM,
          distance: "Cosine",
          created: exists ? "no" : "yes",
        })
      );
    }
  }

  // qdrant cloud requires a payload index before filter delete/search on content_id.
  private async ensureContentIdPayloadIndex(): Promise<void> {
    const info = await this.client.getCollection(this.collection);
    const schema = info.payload_schema ?? {};
    if (schema[CONTENT_ID_PAYLOAD_FIELD] != null) return;
    try {
      await this.client.createPayloadIndex(this.collection, {
        field_name: CONTENT_ID_PAYLOAD_FIELD,
        field_schema: "uuid",
        wait: true,
      });
      log.info(
        filePipelinePanel("FILE PIPELINE · qdrant · payload index created", "-", {
          collection: this.collection,
          field: CONTENT_ID_PAYLOAD_FIELD,
          fieldSchema: "uuid",
        })
      );
    } catch (e) {
      const again = await this.client.getCollection(this.collection);
      if (again.payload_schema?.[CONTENT_ID_PAYLOAD_FIELD] != null) return;
      throw e;
    }
  }

  private async ensureCollectionOnce(): Promise<void> {
    this.ensurePromise ??= this.ensureCollection();
    return this.ensurePromise;
  }

  async deleteChunksForContent(contentId: string): Promise<void> {
    await this.ensureCollectionOnce();
    try {
      await this.client.delete(this.collection, {
        wait: true,
        filter: {
          must: [{ key: "content_id", match: { value: contentId } }],
        },
      });
    } catch (e) {
      // e.g. collection dropped elsewhere, or Qdrant returns 404 for empty / unknown resource
      if (isQdrantNotFoundError(e)) {
        log.warn(
          filePipelinePanel("FILE PIPELINE · qdrant · delete skipped", contentId, {
            collection: this.collection,
            reason: "not_found",
          })
        );
        return;
      }
      throw e;
    }
  }

  async replaceContentChunks(
    contentId: string,
    chunks: ChunkVectorRecord[]
  ): Promise<void> {
    const tAll = Date.now();
    await this.ensureCollectionOnce();

    const tDel0 = Date.now();
    await this.deleteChunksForContent(contentId);
    const tDel1 = Date.now();
    log.info(
      filePipelinePanel("FILE PIPELINE · index · qdrant delete", contentId, {
        collection: this.collection,
        ms: tDel1 - tDel0,
      })
    );

    if (chunks.length === 0) return;

    for (const c of chunks) {
      if (c.contentId !== contentId) {
        throw new Error("ChunkVectorRecord.contentId must match replaceContentChunks contentId");
      }
      assertEmbeddingShape(c.embedding);
    }

    const batchCount = Math.ceil(chunks.length / BATCH);
    let batchIndex = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      batchIndex += 1;
      const slice = chunks.slice(i, i + BATCH);
      const tBatch0 = Date.now();
      await this.client.upsert(this.collection, {
        wait: true,
        points: slice.map((c) => ({
          id: c.id,
          vector: c.embedding,
          payload: {
            content_id: c.contentId,
            chunk_index: c.chunkIndex,
            token_count: c.tokenCount,
            content: sanitizePayloadText(c.content),
          },
        })),
      });
      const tBatch1 = Date.now();
      const idxRange = `${slice[0]?.chunkIndex ?? i}–${slice[slice.length - 1]?.chunkIndex ?? i + slice.length - 1}`;
      log.info(
        filePipelinePanel("FILE PIPELINE · index · qdrant upsert batch", contentId, {
          collection: this.collection,
          batch: `${batchIndex}/${batchCount}`,
          pointsInBatch: slice.length,
          chunkIndexRange: idxRange,
          wait: true,
          ms: tBatch1 - tBatch0,
        })
      );
    }

    log.info(
      filePipelinePanel("FILE PIPELINE · index · qdrant upsert done", contentId, {
        collection: this.collection,
        points: chunks.length,
        batches: batchCount,
        ms_total: Date.now() - tAll,
      })
    );
  }

  async searchNearest(params: {
    embedding: number[];
    limit: number;
    filterContentIds: string[];
  }): Promise<ChunkVectorSearchRow[]> {
    if (params.filterContentIds.length === 0) return [];

    assertEmbeddingShape(params.embedding);
    await this.ensureCollectionOnce();

    const res = await this.client.search(this.collection, {
      vector: params.embedding,
      limit: params.limit,
      with_payload: true,
      filter: {
        must: [
          {
            key: "content_id",
            match: { any: params.filterContentIds },
          },
        ],
      },
    });

    return res.map((hit) => {
      const p = hit.payload ?? {};
      const contentId = String(p["content_id"] ?? "");
      const content = String(p["content"] ?? "");
      const chunkIndex = Number(p["chunk_index"]);
      if (!contentId || !Number.isFinite(chunkIndex)) {
        throw new Error("Qdrant hit missing content_id or chunk_index payload");
      }
      // Qdrant Cosine: hit.score = cosine similarity (0-1, higher = more similar)
      // Convert to distance for downstream compatibility (lower = more similar)
      return {
        contentId,
        content,
        chunkIndex,
        distance: 1 - hit.score,
      };
    });
  }
}

let instance: QdrantChunkVectorStore | null = null;

export function getQdrantChunkVectorStore(): QdrantChunkVectorStore {
  const url = env.QDRANT_URL?.trim();
  if (!url) {
    throw new Error("QDRANT_URL is not set");
  }
  instance ??= new QdrantChunkVectorStore(
    url,
    env.QDRANT_API_KEY?.trim() || undefined,
    env.QDRANT_COLLECTION
  );
  return instance;
}
