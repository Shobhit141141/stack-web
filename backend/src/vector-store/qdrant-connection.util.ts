import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config/env.js";

export type QdrantPingResult =
  | { ok: true; url: string; collection: string; hasCollection: boolean }
  | { ok: false; error: string };

// single round-trip to confirm qdrant api is reachable (used at server startup)
export async function checkQdrantConnection(): Promise<QdrantPingResult> {
  const url = env.QDRANT_URL?.trim();
  if (!url) {
    return { ok: false, error: "QDRANT_URL not set" };
  }
  try {
    const client = new QdrantClient({
      url,
      ...(env.QDRANT_API_KEY?.trim()
        ? { apiKey: env.QDRANT_API_KEY.trim() }
        : {}),
    });
    const cols = await client.getCollections();
    const hasCollection = cols.collections.some(
      (c) => c.name === env.QDRANT_COLLECTION
    );
    return {
      ok: true,
      url,
      collection: env.QDRANT_COLLECTION,
      hasCollection,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
