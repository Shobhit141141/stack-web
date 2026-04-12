import { env } from "../../config/env.js";
import { createConsoleLogger } from "./console.logger.js";
import { createWinstonLogger } from "./winston.logger.js";

export type { Log } from "../../types/log.js";

export const log =
  env.LOG_PROVIDER === "console"
    ? createConsoleLogger()
    : createWinstonLogger(env.LOG_LEVEL);
