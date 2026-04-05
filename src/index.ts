import "dotenv/config";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { log } from "./utils/logger/index.js";

const app = createApp();
const port = env.PORT;

app.listen(port, () => {
  log.info(`Listening on http://localhost:${port}`);
});
