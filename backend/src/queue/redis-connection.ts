import { Redis } from "ioredis";

import { env } from "../config/env.js";

export function createRedisConnection(): Redis {
  const url = env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return new Redis(url, { maxRetriesPerRequest: null });
}
