import type { NextFunction, Request, Response } from "express";
import * as fileService from "../services/file.service.js";

export async function uploadFile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  const token = req.accessToken;
  if (!userId || !token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ error: "Missing file" });
    return;
  }

  try {
    const row = await fileService.uploadUserFile({
      accessToken: token,
      userId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
    res.status(201).json({
      id: row.id,
      name: row.originalName,
      storagePath: row.storagePath,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (e) {
    next(e);
  }
}
