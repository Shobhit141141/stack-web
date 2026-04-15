import type { NextFunction, Request, Response } from "express";
import * as activityService from "../services/activity.service.js";
import { isUuid } from "../utils/uuid.js";

function parseLimit(raw: unknown): number | undefined | null {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export async function getActivity(
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
    const limitParsed = parseLimit(req.query.limit);
    if (limitParsed === null) {
      res.status(400).json({ error: "Invalid limit" });
      return;
    }

    const cursorRaw = req.query.cursor;
    const cursor =
      typeof cursorRaw === "string" && cursorRaw.trim()
        ? cursorRaw.trim()
        : undefined;

    const workspaceRaw = req.query.workspaceId;
    let workspaceId: string | undefined;
    if (
      typeof workspaceRaw === "string" &&
      workspaceRaw.trim() !== ""
    ) {
      const w = workspaceRaw.trim();
      if (!isUuid(w)) {
        res.status(400).json({ error: "Invalid workspaceId" });
        return;
      }
      workspaceId = w;
    }

    const result = await activityService.getUserActivity({
      userId,
      ...(limitParsed !== undefined ? { limit: limitParsed } : {}),
      cursor,
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}
