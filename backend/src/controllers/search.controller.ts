import type { NextFunction, Request, Response } from "express";
import * as activityService from "../services/activity.service.js";
import * as searchService from "../services/search.service.js";
import { parseSearchQuery } from "../utils/file-query-parser.js";

export async function getSemanticSearch(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    // input example:
    // {
    //   q: "I want to find a file about the weather",
    //   limit: 10,
    //   offset: 0,
    //   sort: "createdAt_desc",
    //   filter: "file",
    //   searchType: "semantic",
    // }
    // output example:
    // {
    //   results: [
    //     {
    //       id: "123",
    //       name: "weather.pdf",
    //       type: "pdf",
    //     }
    //   ]
    const parsed = parseSearchQuery(req.query as Record<string, unknown>);
    const result = await searchService.semanticSearchUserFiles(userId, parsed.q!, {
      workspaceId: parsed.workspaceId,
    });
    activityService.logActivity({
      userId,
      type: "search",
      metadata: { query: parsed.q },
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}