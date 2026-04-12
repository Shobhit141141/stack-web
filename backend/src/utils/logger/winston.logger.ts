import winston from "winston";
import type { Log } from "../../types/log.js";

export function createWinstonLogger(level: string): Log {
  const { combine, timestamp, colorize, printf, errors } = winston.format;
  const w = winston.createLogger({
    level,
    format: combine(
      errors({ stack: true }),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      colorize({ all: true }),
      printf(({ level, message, timestamp, stack }) => {
        const line = `${timestamp} ${level}: ${message}`;
        return stack ? `${line}\n${stack}` : line;
      })
    ),
    transports: [new winston.transports.Console()],
  });

  return {
    http: (m) => w.http(m),
    info: (m) => w.info(m),
    warn: (m) => w.warn(m),
    error: (m) => w.error(m),
    debug: (m) => w.debug(m),
  };
}
