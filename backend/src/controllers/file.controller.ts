import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { USER_FILE_QUOTA_MAX_FILES } from "../constants/user-file-limits.js";
import { enqueueUrlIngest } from "../queue/url-ingest.queue.js";
import * as fileRepository from "../repositories/file.repository.js";
import { scheduleExtractionAfterUpload } from "../services/extraction.service.js";
import { scheduleImageIndexAfterUpload } from "../services/image-index.service.js";
import * as activityService from "../services/activity.service.js";
import * as deleteQueueService from "../services/delete-queue.service.js";
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
import {
  DOCX_MIME,
  PDF_MIME,
  isImageMimeType,
} from "../constants/upload-file-types.js";

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

export async function getFileStorageSummary(
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
    const summary = await fileService.getUserFileStorageSummary(userId);
    res.json(summary);
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
  const body = req.body as { workspaceId?: unknown; name?: unknown };
  const hasWorkspace = "workspaceId" in body;
  const hasName = "name" in body;
  if (!hasWorkspace && !hasName) {
    res.status(400).json({
      error: "Provide at least one field: workspaceId (uuid|null) and/or name (string)",
    });
    return;
  }

  let workspaceId: string | null | undefined;
  if (hasWorkspace) {
    const wid = body.workspaceId;
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
  }

  let name: string | undefined;
  if (hasName) {
    if (typeof body.name !== "string") {
      res.status(400).json({ error: "name must be a string" });
      return;
    }
    name = body.name;
  }

  try {
    let row:
      | Awaited<ReturnType<typeof fileService.assignUserFileWorkspace>>
      | Awaited<ReturnType<typeof fileService.renameUserFile>>
      | undefined;

    if (workspaceId !== undefined) {
      row = await fileService.assignUserFileWorkspace({
        userId,
        fileId: id,
        workspaceId,
      });
    }
    if (name !== undefined) {
      row = await fileService.renameUserFile({
        userId,
        fileId: id,
        name,
      });
    }
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteFile(
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
    const file = await fileRepository.findFileByIdForUser(id, userId);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const job = deleteQueueService.enqueueFileDelete({
      accessToken: token,
      userId,
      fileId: id,
    });
    res.status(202).json(job);
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

function safeAttachmentFileName(name: string): string {
  return name.replace(/[\r\n"]/g, "_").trim() || "file";
}

export async function downloadFileByIdAttachment(
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
    const upstream = await fetch(result.signedUrl);
    if (!upstream.ok) {
      res.status(502).json({ error: "Could not fetch file bytes for download" });
      return;
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const fileName = safeAttachmentFileName(result.name);
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.status(200).send(bytes);
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
    const agg = await fileRepository.aggregateUserFilesForUser(userId);
    if (agg.count >= USER_FILE_QUOTA_MAX_FILES) {
      res.status(400).json({
        error: `You already have ${USER_FILE_QUOTA_MAX_FILES} files (the maximum). Delete a file to import from a link.`,
      });
      return;
    }

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
    const existing = await fileRepository.aggregateUserFilesForUser(userId);
    if (existing.count + files.length > USER_FILE_QUOTA_MAX_FILES) {
      const room = Math.max(0, USER_FILE_QUOTA_MAX_FILES - existing.count);
      res.status(400).json({
        error:
          room === 0
            ? `You already have ${USER_FILE_QUOTA_MAX_FILES} files (the maximum). Delete a file to upload more.`
            : `You can have at most ${USER_FILE_QUOTA_MAX_FILES} files (${existing.count} now). This upload has ${files.length} file(s); you can add at most ${room} more.`,
      });
      return;
    }

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
        metadata: {
          fileId: row.id,
          fileName: row.originalName,
          ...(uploadWorkspaceId !== undefined
            ? { workspaceId: uploadWorkspaceId }
            : {}),
        },
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
        if (file.mimetype === PDF_MIME || file.mimetype === DOCX_MIME) {
          scheduleExtractionAfterUpload({
            contentId: uploaded.contentId,
            buffer: file.buffer,
            mimeType: file.mimetype,
            originalName: file.originalname,
          });
        } else if (isImageMimeType(file.mimetype)) {
          scheduleImageIndexAfterUpload({
            contentId: uploaded.contentId,
            buffer: file.buffer,
            mimeType: file.mimetype,
            originalName: file.originalname,
          });
        }
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
