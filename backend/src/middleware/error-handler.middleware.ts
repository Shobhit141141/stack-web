import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { log } from "../utils/logger/index.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    if (err.status >= 400 && err.status < 500) {
      log.warn(`Client ${err.status} ${req.method} ${req.originalUrl} — ${err.message}`);
    }
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    let message = "Upload error";
    let detail = `Upload error (${err.code})`;
    if (err.code === "LIMIT_FILE_SIZE") {
      message = "File too large";
      detail = "File too large (max 10MB per file)";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Unexpected file field";
      detail =
        'Unexpected file field (use only the field name "file"; max files per request may be exceeded)';
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Too many files";
      detail = "Too many files in one request";
    }
    log.warn(`Client 400 ${req.method} ${req.originalUrl} — ${detail}`);
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: message });
      return;
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
    return;
  }
  if (err instanceof Error) {
    log.error(err);
  } else {
    log.error(String(err));
  }
  res.status(500).json(
    env.IS_PRODUCTION
      ? { error: "Internal server error" }
      : {
          error: "Internal server error",
          detail: err instanceof Error ? err.message : String(err),
        }
  );
}
