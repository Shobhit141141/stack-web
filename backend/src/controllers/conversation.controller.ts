import type { NextFunction, Request, Response } from "express";
import * as conversationService from "../services/conversation.service.js";
import { isUuid } from "../utils/uuid.js";

export async function getCurrentConversation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const workspaceIdRaw = req.query.workspaceId;
  const workspaceId =
    typeof workspaceIdRaw === "string" ? workspaceIdRaw.trim() : "";
  if (!workspaceId || !isUuid(workspaceId)) {
    res.status(400).json({ error: "workspaceId query must be a uuid string" });
    return;
  }
  try {
    const result = await conversationService.getOrCreateConversationForWorkspace({
      userId,
      workspaceId,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getConversationMessages(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rawId = req.params.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!conversationId || !isUuid(conversationId)) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  try {
    const result = await conversationService.getConversationMessages({
      userId,
      conversationId,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}
