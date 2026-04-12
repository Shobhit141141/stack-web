import { Queue } from "bullmq";

import { env } from "../config/env.js";
import { createRedisConnection } from "./redis-connection.js";

export const URL_INGEST_QUEUE_NAME = "url-ingest";

export type UrlIngestJobPayload = {
  userId: string;
  accessToken: string;
  sourceUrl: string;
};

let queue: Queue<UrlIngestJobPayload> | null = null;

function getUrlIngestQueue(): Queue<UrlIngestJobPayload> {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is not set");
  }
  if (!queue) {
    queue = new Queue<UrlIngestJobPayload>(URL_INGEST_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2500 },
        removeOnComplete: 500,
        removeOnFail: 2000,
      },
    });
  }
  return queue;
}

export async function enqueueUrlIngest(
  payload: UrlIngestJobPayload
): Promise<{ id: string }> {
  const q = getUrlIngestQueue();
  const job = await q.add("ingest", payload);
  const id = job.id;
  if (id === undefined) {
    throw new Error("Job id missing after enqueue");
  }
  return { id: String(id) };
}
