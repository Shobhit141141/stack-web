import type { NextFunction, Request, Response } from "express";
import { scheduleExtractionAfterUpload } from "../services/extraction.service.js";
import * as fileService from "../services/file.service.js";
import { log } from "../utils/logger/index.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import {
  parseFileListQuery,
  parseSearchQuery,
} from "../utils/file-query-parser.js";
import { isUuid } from "../utils/uuid.js";

export async function listFiles(
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
    const parsed = parseFileListQuery(req.query as Record<string, unknown>);
    const result = await fileService.listUserFiles(userId, parsed);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function searchFiles(
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
    const parsed = parseSearchQuery(req.query as Record<string, unknown>);
    const result = await fileService.listUserFiles(userId, parsed);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getFileById(
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
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isUuid(id)) {
    res.status(400).json({ error: "Invalid file id" });
    return;
  }
  try {
    const result = await fileService.getUserFileWithSignedUrl({
      accessToken: token,
      userId,
      fileId: id,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

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

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0 || files.some((f) => !f.buffer?.length)) {
    log.warn(
      `400 POST ${req.originalUrl} — Missing file(s): multipart field name must be "file" (repeat for multiple PDF/DOCX). Content-Type was ${String(
        req.headers["content-type"] ?? "(none)"
      )}`
    );
    res.status(400).json({ error: "Missing file" });
    return;
  }

  try {
    const created: Array<{
      id: string;
      name: string;
      storagePath: string;
      createdAt: string;
    }> = [];

    for (const file of files) {
      const row = await fileService.uploadUserFile({
        accessToken: token,
        userId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      });
      const item = {
        id: row.id,
        name: row.originalName,
        storagePath: row.storagePath,
        createdAt: row.createdAt.toISOString(),
      };
      created.push(item);

      log.info(
        filePipelinePanel("FILE PIPELINE · upload · HTTP 201", row.id, {
          name: row.originalName,
          mime: file.mimetype,
          sizeBytes: file.buffer.length,
          storagePath: row.storagePath,
          batchIndex: `${created.length}/${files.length}`,
          next: "response after all parts; background extract/index if PDF/DOCX",
        })
      );
      scheduleExtractionAfterUpload({
        fileId: row.id,
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
      });
    }

    if (created.length === 1) {
      const one = created[0]!;
      res.status(201).json({
        id: one.id,
        name: one.name,
        storagePath: one.storagePath,
        createdAt: one.createdAt,
      });
    } else {
      res.status(201).json({ files: created });
    }
  } catch (e) {
    next(e);
  }
}
