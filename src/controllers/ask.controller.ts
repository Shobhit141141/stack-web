import type { NextFunction, Request, Response } from "express";
import {
  hasEmbeddingApiKey,
  hasRagCompletionConfigured,
} from "../config/env.js";
import * as askService from "../services/ask.service.js";

export async function postAsk(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const body = req.body as { query?: unknown; fileIds?: unknown };
    if (typeof body.query !== "string") {
      res.status(400).json({ error: "query must be a string" });
      return;
    }
    const query = body.query.trim();
    if (!query) {
      res.status(400).json({ error: "query must not be empty" });
      return;
    }

    let fileIds: string[] | undefined;
    if (body.fileIds !== undefined) {
      if (!Array.isArray(body.fileIds)) {
        res.status(400).json({ error: "fileIds must be an array of strings when provided" });
        return;
      }
      const ids = body.fileIds.filter((x): x is string => typeof x === "string");
      if (ids.length !== body.fileIds.length) {
        res.status(400).json({ error: "fileIds must contain only strings" });
        return;
      }
      fileIds = ids;
    }

    if (!hasEmbeddingApiKey()) {
      res.status(503).json({ error: "Search embeddings are not configured" });
      return;
    }
    if (!hasRagCompletionConfigured()) {
      res.status(503).json({
        error:
          "RAG answer model is not configured. Set OPENAI_API_KEY for OpenAI (default), or RAG_COMPLETION_PROVIDER=google and GEMINI_API_KEY.",
      });
      return;
    }

    const result = await askService.askUserFiles({ userId, query, fileIds });
    res.json(result);
  } catch (e) {
    if (e instanceof askService.InvalidFileIdsError) {
      res.status(400).json({
        error: "One or more file IDs are invalid or not owned by you",
      });
      return;
    }
    next(e);
  }
}
