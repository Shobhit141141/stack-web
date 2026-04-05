import morgan from "morgan";
import { log } from "../utils/logger/index.js";

export const requestLogger = morgan("combined", {
  stream: { write: (message) => log.http(message.trimEnd()) },
});
