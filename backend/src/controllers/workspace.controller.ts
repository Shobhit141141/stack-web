import type { NextFunction, Request, Response } from "express";
import * as workspaceService from "../services/workspace.service.js";
import { isUuid } from "../utils/uuid.js";

export async function listWorkspaces(
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
    const result = await workspaceService.listWorkspaces(userId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function postWorkspace(
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
    const name = req.body?.name;
    if (typeof name !== "string") {
      res.status(400).json({ error: "name must be a string" });
      return;
    }
    const row = await workspaceService.createWorkspace(userId, name);
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function patchWorkspace(
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
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isUuid(id)) {
    res.status(400).json({ error: "Invalid workspace id" });
    return;
  }
  try {
    const name = req.body?.name;
    if (typeof name !== "string") {
      res.status(400).json({ error: "name must be a string" });
      return;
    }
    const row = await workspaceService.renameWorkspace(userId, id, name);
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteWorkspace(
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
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isUuid(id)) {
    res.status(400).json({ error: "Invalid workspace id" });
    return;
  }
  try {
    await workspaceService.deleteWorkspace(userId, id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}
