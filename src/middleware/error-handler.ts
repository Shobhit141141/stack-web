import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { log } from "../utils/logger/index.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File too large" });
      return;
    }
    res.status(400).json({ error: "Upload error" });
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
