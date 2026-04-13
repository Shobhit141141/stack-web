import { UnrecoverableError, Worker } from "bullmq";

import { env } from "../config/env.js";
import {
  URL_INGEST_QUEUE_NAME,
  type UrlIngestJobPayload,
} from "../queue/url-ingest.queue.js";
import { createRedisConnection } from "../queue/redis-connection.js";
import { processUrlIngestJob } from "../services/url-ingest.service.js";
import { log } from "../utils/logger/index.js";

export function startUrlIngestWorker(): Worker<UrlIngestJobPayload> {
  const connection = createRedisConnection();
  const worker = new Worker<UrlIngestJobPayload>(
    URL_INGEST_QUEUE_NAME,
    async (job) => {
      return processUrlIngestJob(job.data, {
        jobId: job.id !== undefined ? String(job.id) : "unknown",
      });
    },
    { connection, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    const id = job?.id !== undefined ? String(job.id) : "(unknown)";
    const msg = err instanceof Error ? err.message : String(err);
    const unrecoverable = err instanceof UnrecoverableError;
    log.warn(
      `URL ingest job failed id=${id} unrecoverable=${unrecoverable} msg=${msg}`
    );
  });

  return worker;
}

export function maybeStartUrlIngestWorker(): Worker<UrlIngestJobPayload> | null {
  if (!env.REDIS_URL || !env.START_URL_INGEST_WORKER) {
    return null;
  }
  const w = startUrlIngestWorker();
  log.info("URL ingest BullMQ worker started");
  return w;
}
