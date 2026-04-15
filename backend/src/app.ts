import express from "express";
import { env } from "./config/env.js";
import { corsMiddleware } from "./middleware/cors.middleware.js";
import { errorHandler } from "./middleware/error-handler.middleware.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";
import routes from "./routes/index.routes.js";
import { log } from "./utils/logger/index.js";
import { checkQdrantConnection } from "./vector-store/qdrant-connection.util.js";
import "./types/express-augment.js";

// verifies qdrant before listen; prod fails fast if url missing or api unreachable
export async function assertQdrantForStartup(): Promise<void> {
  const url = env.QDRANT_URL?.trim();
  if (!url) {
    if (env.IS_PRODUCTION) {
      throw new Error("QDRANT_URL is required in production");
    }
    log.info("qdrant: skipped (QDRANT_URL unset — vector index/search need it)");
    return;
  }
  const r = await checkQdrantConnection();
  if (!r.ok) {
    const line = `qdrant: unreachable (${url}) — ${r.error}`;
    if (env.IS_PRODUCTION) {
      throw new Error(line);
    }
    log.warn(line);
    return;
  }
  log.info(
    `qdrant: ok url=${r.url} collection=${r.collection} exists=${r.hasCollection}`
  );
}

const app = express();
app.use(corsMiddleware);
app.use(requestLogger);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(routes);
app.use(errorHandler);

// export the configured express app instance
export default app;
