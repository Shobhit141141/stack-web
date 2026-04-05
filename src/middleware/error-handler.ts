import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { log } from "../utils/logger/index.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
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
