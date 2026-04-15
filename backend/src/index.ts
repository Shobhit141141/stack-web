import "dotenv/config";
import { env } from "./config/env.js";
import { maybeStartUrlIngestWorker } from "./workers/url-ingest.worker.js";
import { log } from "./utils/logger/index.js";
import app from "./app.js";

const port = env.PORT;

maybeStartUrlIngestWorker();

// start the express server asynchronously
async function startServer() {
  app.listen(port, () => {
    log.info(`Listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  log.error(`Error starting server: ${err}`);
  process.exit(1);
});
