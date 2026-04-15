import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { enqueueUrlIngest } from "../queue/url-ingest.queue.js";
import { scheduleExtractionAfterUpload } from "../services/extraction.service.js";
import * as activityService from "../services/activity.service.js";
import * as fileService from "../services/file.service.js";
import * as urlIngestJobStatusService from "../services/url-ingest-job-status.service.js";
import { log } from "../utils/logger/index.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import {
  parseFileListQuery,
  parseSearchQuery,
} from "../utils/file-query-parser.js";
import { mapWithConcurrency } from "../utils/map-with-concurrency.js";
import { isUuid } from "../utils/uuid.js";

/** Batches of this size or smaller run fully in parallel; larger batches cap at this concurrency. */
const UPLOAD_CONCURRENCY = 5;

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

export async function listRecentFiles(
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
    const result = await fileService.listRecentUserFiles(userId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function patchFile(
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
    res.status(400).json({ error: "Invalid file id" });
    return;
  }
  const body = req.body as { workspaceId?: unknown };
  if (!("workspaceId" in body)) {
    res.status(400).json({
      error: "workspaceId is required (uuid string or null to unassign)",
    });
    return;
  }
  const wid = body.workspaceId;
  let workspaceId: string | null;
  if (wid === null) {
    workspaceId = null;
  } else if (typeof wid === "string" && isUuid(wid)) {
    workspaceId = wid;
  } else {
    res.status(400).json({
      error: "workspaceId must be a uuid string or null",
    });
    return;
  }
  try {
    const row = await fileService.assignUserFileWorkspace({
      userId,
      fileId: id,
      workspaceId,
    });
    res.json(row);
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

const MAX_URL_LENGTH = 2048;

export async function getUrlIngestJobStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = req.params.jobId;
  const jobId = Array.isArray(raw) ? raw[0] : raw;
  if (!jobId || !String(jobId).trim()) {
    res.status(400).json({ error: "Missing job id" });
    return;
  }
  try {
    const result = await urlIngestJobStatusService.getUrlIngestJobStatus(
      userId,
      String(jobId).trim()
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function createFileFromUrl(
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

  const raw = req.body?.url;
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "Missing url" });
    return;
  }
  const url = raw.trim();
  if (url.length > MAX_URL_LENGTH) {
    res.status(400).json({ error: "URL is too long" });
    return;
  }

  if (!env.REDIS_URL) {
    res
      .status(503)
      .json({ error: "URL ingestion unavailable (Redis not configured)" });
    return;
  }

  let workspaceId: string | undefined;
  const rawWs = req.body?.workspaceId;
  if (rawWs !== undefined && rawWs !== null && rawWs !== "") {
    if (typeof rawWs !== "string" || !isUuid(rawWs)) {
      res.status(400).json({ error: "workspaceId must be a uuid string when provided" });
      return;
    }
    workspaceId = rawWs;
  }

  try {
    const { id } = await enqueueUrlIngest({
      userId,
      accessToken: token,
      sourceUrl: url,
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    });
    log.info(
      `202 POST ${req.originalUrl} — url ingest queued jobId=${id} userId=${userId}`
    );
    res.status(202).json({ jobId: id, status: "queued" });
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

  let uploadWorkspaceId: string | undefined;
  const rawWs = req.query.workspaceId;
  if (rawWs !== undefined && rawWs !== null && String(rawWs).trim() !== "") {
    const w = String(Array.isArray(rawWs) ? rawWs[0] : rawWs).trim();
    if (!isUuid(w)) {
      res.status(400).json({ error: "Invalid workspaceId query parameter" });
      return;
    }
    uploadWorkspaceId = w;
  }

  try {
    const created: Array<{
      id: string;
      name: string;
      storagePath: string;
      createdAt: string;
    }> = [];

    const uploadOne = (file: (typeof files)[number]) =>
      fileService.uploadUserFile({
        accessToken: token,
        userId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
        ...(uploadWorkspaceId !== undefined
          ? { workspaceId: uploadWorkspaceId }
          : {}),
      });

    const outcomes =
      files.length <= UPLOAD_CONCURRENCY
        ? await Promise.all(files.map((file) => uploadOne(file)))
        : await mapWithConcurrency(files, UPLOAD_CONCURRENCY, uploadOne);

    for (let i = 0; i < outcomes.length; i++) {
      const uploaded = outcomes[i]!;
      const row = uploaded.file;
      const file = files[i]!;
      created.push({
        id: row.id,
        name: row.originalName,
        storagePath: row.storagePath,
        createdAt: row.createdAt.toISOString(),
      });

      activityService.logActivity({
        userId,
        type: "upload",
        metadata: { fileId: row.id, fileName: row.originalName },
      });

      log.info(
        filePipelinePanel("FILE PIPELINE · upload · HTTP 201", row.id, {
          name: row.originalName,
          mime: file.mimetype,
          sizeBytes: file.buffer.length,
          storagePath: row.storagePath,
          batchIndex: `${i + 1}/${files.length}`,
          next: "response after all parts; background extract/index if PDF/DOCX",
        })
      );
      if (uploaded.shouldIndexContent) {
        scheduleExtractionAfterUpload({
          contentId: uploaded.contentId,
          buffer: file.buffer,
          mimeType: file.mimetype,
          originalName: file.originalname,
        });
      }
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
