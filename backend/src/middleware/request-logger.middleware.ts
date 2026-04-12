import morgan from "morgan";
import { log } from "../utils/logger/index.js";

function accessLogLevel(line: string): "error" | "warn" | "http" {
  const status = parseHttpStatus(line);
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "http";
}

function parseHttpStatus(line: string): number {
  const tiny = line.match(/ (\d{3}) \d+ - [\d.]+ ms\s*$/);
  if (tiny) return Number(tiny[1]);
  const combined = line.match(/HTTP\/[^"]+" (\d{3})\b/);
  if (combined) return Number(combined[1]);
  return 0;
}

function writeAccessLine(message: string) {
  const line = message.trimEnd();
  const level = accessLogLevel(line);
  if (level === "error") log.error(line);
  else if (level === "warn") log.warn(line);
  else log.http(line);
}

/** Short line (no User-Agent / Referer). Enable with `LOG_LEVEL=http`. */
export const requestLogger = morgan("tiny", {
  stream: { write: writeAccessLine },
});
