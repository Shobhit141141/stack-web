import "dotenv/config";
import {
  embeddingRuntimeLabel,
  env,
  ragCompletionModelDefault,
} from "./config/env.js";
import { maybeStartUrlIngestWorker } from "./workers/url-ingest.worker.js";
import { log } from "./utils/logger/index.js";
import app, { assertQdrantForStartup } from "./app.js";

const port = env.PORT;

maybeStartUrlIngestWorker();

// start the express server asynchronously
async function startServer() {
  await assertQdrantForStartup();
  app.listen(port, () => {
    log.info(
      `Model config · embedding=${embeddingRuntimeLabel()} rag=${env.RAG_COMPLETION_PROVIDER}:${ragCompletionModelDefault()} voice=${env.OPENAI_CHAT_MODEL_VOICE}`,
    );
    log.info(`Listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  log.error(`Error starting server: ${err}`);
  process.exit(1);
});
