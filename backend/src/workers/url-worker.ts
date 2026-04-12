import "dotenv/config";

import { env } from "../config/env.js";
import { log } from "../utils/logger/index.js";
import { startUrlIngestWorker } from "./url-ingest.worker.js";

if (!env.REDIS_URL) {
  log.error("REDIS_URL is required for the URL ingest worker");
  process.exit(1);
}

const worker = startUrlIngestWorker();
log.info("Standalone URL ingest worker listening on Redis");

async function shutdown(signal: string) {
  log.info(`URL ingest worker ${signal}, closing…`);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
