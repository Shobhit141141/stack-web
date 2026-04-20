import { env } from "../config/env.js";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  USER_FILE_QUOTA_MAX_BYTES_PER_FILE,
  USER_FILE_QUOTA_MAX_FILES,
} from "../constants/user-file-limits.js";
import { HttpError } from "../utils/http-error.js";
import {
  buildFileOrderBy,
  buildFileWhere,
  publicFileTypeLabel,
  sizeToSafeNumber,
  type ParsedFileListQuery,
} from "../utils/file-query-parser.js";
import { log } from "../utils/logger/index.js";
import * as activityRepository from "../repositories/activity.repository.js";
import * as conversationRepository from "../repositories/conversation.repository.js";
import * as fileRepository from "../repositories/file.repository.js";
import type { FileDbClient } from "../repositories/file.repository.js";
import * as workspaceRepository from "../repositories/workspace.repository.js";
import * as workspaceService from "./workspace.service.js";
import * as storageService from "./storage.service.js";
import { getChunkVectorStore } from "../vector-store/index.js";
import { prisma } from "../repositories/db.js";

const RECENTS_LIMIT = 15;
const USER_FILE_QUOTA_PG_LOCK_NS = 582_019_411;

// serializes per-user file quota checks across concurrent uploads
async function acquireUserFileQuotaLock(
  db: Pick<typeof prisma, "$executeRaw">,
  userId: string
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      ${USER_FILE_QUOTA_PG_LOCK_NS}::integer,
      hashtext(${userId}::text)::integer
    )
  `);
}

// runs after bytes are in storage: enforces max file count + creates db row (caller deletes storage on throw)
export async function commitUserFileRecordAfterStorage(params: {
  userId: string;
  contentHash: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  sourceType: string;
  sourceUrl?: string | null;
  workspaceId?: string | null;
}): Promise<{
  file: Awaited<ReturnType<typeof fileRepository.createFileRecord>>;
  shouldIndexContent: boolean;
  contentId: string;
}> {
  if (params.sizeBytes > USER_FILE_QUOTA_MAX_BYTES_PER_FILE) {
    throw new HttpError(
      400,
      `File exceeds maximum size of ${USER_FILE_QUOTA_MAX_BYTES_PER_FILE / (1024 * 1024)} MB`
    );
  }

  return prisma.$transaction(async (tx) => {
    await acquireUserFileQuotaLock(tx, params.userId);
    const fileCount = await tx.file.count({
      where: { userId: params.userId },
    });
    if (fileCount >= USER_FILE_QUOTA_MAX_FILES) {
      throw new HttpError(
        400,
        `You can have at most ${USER_FILE_QUOTA_MAX_FILES} files. Delete one to upload more.`
      );
    }

    let content = await fileRepository.findContentByHash(
      params.contentHash,
      tx as unknown as FileDbClient
    );
    let shouldIndexContent = false;
    if (!content) {
      content = await fileRepository.createContent(
        params.contentHash,
        tx as unknown as FileDbClient
      );
      shouldIndexContent = true;
    }

    const file = await fileRepository.createFileRecord(
      {
        userId: params.userId,
        contentId: content.id,
        originalName: params.originalName,
        mimeType: params.mimeType,
        size: params.sizeBytes,
        storagePath: params.storagePath,
        sourceType: params.sourceType,
        sourceUrl: params.sourceUrl ?? null,
        ...(params.workspaceId !== undefined && params.workspaceId !== null
          ? { workspaceId: params.workspaceId }
          : {}),
      },
      tx as unknown as FileDbClient
    );

    return { file, shouldIndexContent, contentId: content.id };
  });
}

export async function getUserFileStorageSummary(userId: string): Promise<{
  fileCount: number;
  maxFiles: number;
  totalSizeBytes: number;
  maxBytesPerFile: number;
  maxTotalBytesIfFull: number;
}> {
  const agg = await fileRepository.aggregateUserFilesForUser(userId);
  const total =
    agg.totalSizeBytes > BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Number(agg.totalSizeBytes);
  return {
    fileCount: agg.count,
    maxFiles: USER_FILE_QUOTA_MAX_FILES,
    totalSizeBytes: total,
    maxBytesPerFile: USER_FILE_QUOTA_MAX_BYTES_PER_FILE,
    maxTotalBytesIfFull: USER_FILE_QUOTA_MAX_FILES * USER_FILE_QUOTA_MAX_BYTES_PER_FILE,
  };
}

const FILE_NAME_MAX = 255;

function normalizeFileName(raw: string): string {
  const name = raw.replace(/^.*[/\\]/, "").trim();
  if (!name) throw new HttpError(400, "name must not be empty");
  if (name.length > FILE_NAME_MAX) {
    throw new HttpError(400, `name must be at most ${FILE_NAME_MAX} characters`);
  }
  return name;
}

function logStorageUploadFailure(
  e: unknown,
  ctx: {
    storagePath: string;
    userId: string;
    mimeType: string;
    sizeBytes: number;
  }
) {
  const header = [
    "File storage upload failed",
    `  storagePath: ${ctx.storagePath}`,
    `  userId:      ${ctx.userId}`,
    `  mimeType:    ${ctx.mimeType}`,
    `  sizeBytes:   ${ctx.sizeBytes}`,
    "---",
  ].join("\n");

  if (e instanceof Error) {
    log.error(`${header}\n${e.stack ?? `${e.name}: ${e.message}`}`);
    return;
  }
  if (e !== null && typeof e === "object") {
    try {
      log.error(
        `${header}\n${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)}`
      );
    } catch {
      log.error(`${header}\n${String(e)}`);
    }
    return;
  }
  log.error(`${header}\n${String(e)}`);
}

export async function uploadUserFile(params: {
  accessToken: string;
  userId: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  /** when set, file is created inside this workspace */
  workspaceId?: string;
}): Promise<{
  file: Awaited<ReturnType<typeof fileRepository.createFileRecord>>;
  shouldIndexContent: boolean;
  contentId: string;
}> {
  if (params.buffer.length === 0) {
    throw new HttpError(400, "Empty file");
  }
  if (params.buffer.length > USER_FILE_QUOTA_MAX_BYTES_PER_FILE) {
    throw new HttpError(
      400,
      `File exceeds maximum size of ${USER_FILE_QUOTA_MAX_BYTES_PER_FILE / (1024 * 1024)} MB`
    );
  }

  const storagePath = storageService.buildStorageObjectPath(
    params.userId,
    params.originalName
  );
  const contentHash = createHash("sha256").update(params.buffer).digest("hex");
  const name =
    params.originalName.replace(/^.*[/\\]/, "") || params.originalName || "file";

  try {
    await storageService.uploadToFilesBucket({
      accessToken: params.accessToken,
      storagePath,
      body: params.buffer,
      contentType: params.mimeType,
    });
  } catch (e) {
    logStorageUploadFailure(e, {
      storagePath,
      userId: params.userId,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
    });
    throw new HttpError(502, "Could not store file");
  }

  if (params.workspaceId) {
    await workspaceService.assertWorkspaceOwned(
      params.userId,
      params.workspaceId
    );
  }

  try {
    return await commitUserFileRecordAfterStorage({
      userId: params.userId,
      contentHash,
      originalName: name,
      mimeType: params.mimeType,
      sizeBytes: params.buffer.length,
      storagePath,
      sourceType: "upload",
      sourceUrl: null,
      workspaceId: params.workspaceId ?? null,
    });
  } catch (e) {
    await storageService
      .deleteFromFilesBucket(params.accessToken, storagePath)
      .catch(() => {});
    throw e;
  }
}

export async function listUserFiles(
  userId: string,
  parsed: ParsedFileListQuery
): Promise<{
  files: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    workspaceId: string | null;
    summary: string | null;
    summaryStatus: "pending" | "ready" | "failed";
    createdAt: string;
  }>;
  pagination: { page: number; total: number };
}> {
  if (parsed.workspaceId) {
    await workspaceService.assertWorkspaceOwned(userId, parsed.workspaceId);
  }
  const where = buildFileWhere(userId, parsed);
  const orderBy = buildFileOrderBy(parsed.sort);
  const skip = (parsed.page - 1) * parsed.limit;
  const [rows, total] = await Promise.all([
    fileRepository.findFilesForList({
      where,
      orderBy,
      skip,
      take: parsed.limit,
    }),
    fileRepository.countFiles(where),
  ]);
  return {
    files: rows.map((row) => ({
      id: row.id,
      name: row.originalName,
      type: publicFileTypeLabel(row.originalName, row.mimeType),
      size: sizeToSafeNumber(row.size),
      workspaceId: row.workspaceId ?? null,
      summary: row.contentRef.summary ?? null,
      summaryStatus: row.contentRef.summaryStatus,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: {
      page: parsed.page,
      total,
    },
  };
}

// assigns a file to a workspace or removes it from any workspace (workspaceId null).
export async function assignUserFileWorkspace(params: {
  userId: string;
  fileId: string;
  workspaceId: string | null;
}): Promise<{
  id: string;
  name: string;
  type: string;
  size: number;
  workspaceId: string | null;
  createdAt: string;
}> {
  const row = await fileRepository.findFileByIdForUser(
    params.fileId,
    params.userId
  );
  if (!row) {
    throw new HttpError(404, "File not found");
  }
  if (params.workspaceId !== null) {
    await workspaceService.assertWorkspaceOwned(
      params.userId,
      params.workspaceId
    );
  }
  const ok = await fileRepository.updateFileWorkspaceForUser(
    params.fileId,
    params.userId,
    params.workspaceId
  );
  if (!ok) {
    throw new HttpError(404, "File not found");
  }
  const updated = await fileRepository.findFileByIdForUser(
    params.fileId,
    params.userId
  );
  if (!updated) {
    throw new HttpError(404, "File not found");
  }
  return {
    id: updated.id,
    name: updated.originalName,
    type: publicFileTypeLabel(updated.originalName, updated.mimeType),
    size: sizeToSafeNumber(updated.size),
    workspaceId: updated.workspaceId ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function renameUserFile(params: {
  userId: string;
  fileId: string;
  name: string;
}): Promise<{
  id: string;
  name: string;
  type: string;
  size: number;
  workspaceId: string | null;
  createdAt: string;
}> {
  const row = await fileRepository.findFileByIdForUser(params.fileId, params.userId);
  if (!row) {
    throw new HttpError(404, "File not found");
  }
  const nextName = normalizeFileName(params.name);
  const ok = await fileRepository.updateFileNameForUser(
    params.fileId,
    params.userId,
    nextName
  );
  if (!ok) throw new HttpError(404, "File not found");
  const updated = await fileRepository.findFileByIdForUser(params.fileId, params.userId);
  if (!updated) throw new HttpError(404, "File not found");
  return {
    id: updated.id,
    name: updated.originalName,
    type: publicFileTypeLabel(updated.originalName, updated.mimeType),
    size: sizeToSafeNumber(updated.size),
    workspaceId: updated.workspaceId ?? null,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function deleteUserFile(params: {
  accessToken: string;
  userId: string;
  fileId: string;
}): Promise<void> {
  const row = await fileRepository.findFileByIdForUser(params.fileId, params.userId);
  if (!row) throw new HttpError(404, "File not found");

  // delete storage first so failed storage removal never leaves db partially cleaned
  try {
    await storageService.deleteFromFilesBucket(params.accessToken, row.storagePath);
  } catch (e) {
    logStorageUploadFailure(e, {
      storagePath: row.storagePath,
      userId: params.userId,
      mimeType: row.mimeType,
      sizeBytes: sizeToSafeNumber(row.size),
    });
    throw new HttpError(502, "Could not delete file from storage");
  }

  const ok = await fileRepository.deleteFileByIdForUser(params.fileId, params.userId);
  if (!ok) throw new HttpError(404, "File not found");

  const remaining = await fileRepository.countFilesByContentId(
    row.contentId
  );
  if (remaining === 0) {
    await getChunkVectorStore().deleteChunksForContent(row.contentId);
    // content delete cascades file_chunks via FK
    await fileRepository.deleteContentById(row.contentId);
  }

  // best-effort: drop upload activities and chat citations that pointed at this file
  try {
    await activityRepository.deleteUploadActivitiesForFile(
      params.userId,
      params.fileId
    );
  } catch (e) {
    log.warn(
      `activity cleanup after file delete failed fileId=${params.fileId}: ${String(e)}`
    );
  }
  try {
    await conversationRepository.removeFileIdFromAssistantSourcesForUser(
      params.userId,
      params.fileId
    );
  } catch (e) {
    log.warn(
      `chat sources cleanup after file delete failed fileId=${params.fileId}: ${String(e)}`
    );
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const size = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;
  let firstError: unknown;

  const worker = async () => {
    while (true) {
      if (firstError) return;
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      try {
        await fn(items[i]!);
      } catch (e) {
        firstError = e;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: size }, () => worker()));
  if (firstError) throw firstError;
}

// deletes every file in the workspace (storage, db, vectors when content unused), chat threads, workspace-tagged activities, then the workspace row.
export async function deleteWorkspaceAndRelated(params: {
  accessToken: string;
  userId: string;
  workspaceId: string;
}): Promise<void> {
  await workspaceService.assertWorkspaceOwned(
    params.userId,
    params.workspaceId
  );
  const files = await fileRepository.findFilesForWorkspaceDeleteForUser(
    params.userId,
    params.workspaceId
  );
  const fileIds = files.map((f) => f.id);
  const uniqueContentIds = [...new Set(files.map((f) => f.contentId))];

  // delete storage paths concurrently; fail before db mutation if storage delete fails
  try {
    await mapWithConcurrency(files, 6, async (f) => {
      await storageService.deleteFromFilesBucket(params.accessToken, f.storagePath);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new HttpError(502, `Could not delete workspace files from storage: ${msg}`);
  }

  if (fileIds.length > 0) {
    await fileRepository.deleteFilesByIdsForUser(params.userId, fileIds);
  }

  const contentUseCounts = await fileRepository.countFilesForContentIds(uniqueContentIds);
  const orphanContentIds = uniqueContentIds.filter(
    (contentId) => (contentUseCounts.get(contentId) ?? 0) === 0
  );

  if (orphanContentIds.length > 0) {
    await mapWithConcurrency(orphanContentIds, 4, async (contentId) => {
      await getChunkVectorStore().deleteChunksForContent(contentId);
    });
    // content delete cascades file_chunks via FK
    await fileRepository.deleteContentsByIds(orphanContentIds);
  }

  await conversationRepository.deleteConversationsForWorkspace(
    params.userId,
    params.workspaceId
  );

  try {
    if (fileIds.length > 0) {
      await activityRepository.deleteUploadActivitiesForFiles(params.userId, fileIds);
    }
    await activityRepository.deleteActivitiesForWorkspace(
      params.userId,
      params.workspaceId
    );
  } catch (e) {
    log.warn(`activity cleanup for workspace delete failed: ${String(e)}`);
  }

  try {
    if (fileIds.length > 0) {
      await conversationRepository.removeFileIdsFromAssistantSourcesForUser(
        params.userId,
        fileIds
      );
    }
  } catch (e) {
    log.warn(`chat sources cleanup for workspace delete failed: ${String(e)}`);
  }

  const ok = await workspaceRepository.deleteWorkspace(
    params.workspaceId,
    params.userId
  );
  if (!ok) throw new HttpError(404, "Workspace not found");
}

export async function getUserFileWithSignedUrl(params: {
  accessToken: string;
  userId: string;
  fileId: string;
}): Promise<{
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  signedUrl: string;
}> {
  const row = await fileRepository.findFileByIdForUser(
    params.fileId,
    params.userId
  );
  if (!row) {
    throw new HttpError(404, "File not found");
  }

  let signedUrl: string;
  try {
    signedUrl = await storageService.createSignedReadUrl({
      accessToken: params.accessToken,
      storagePath: row.storagePath,
      expiresIn: env.SIGNED_URL_EXPIRES_SECONDS,
    });
  } catch {
    throw new HttpError(502, "Could not generate download link");
  }

  await fileRepository.touchFileLastOpened(params.fileId, params.userId);

  return {
    id: row.id,
    name: row.originalName,
    type: publicFileTypeLabel(row.originalName, row.mimeType),
    size: sizeToSafeNumber(row.size),
    createdAt: row.createdAt.toISOString(),
    signedUrl,
  };
}

export async function listRecentUserFiles(userId: string): Promise<{
  files: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    workspaceId: string | null;
    createdAt: string;
  }>;
}> {
  const rows = await fileRepository.findRecentFilesForUser(
    userId,
    RECENTS_LIMIT
  );
  return {
    files: rows.map((row) => ({
      id: row.id,
      name: row.originalName,
      type: publicFileTypeLabel(row.originalName, row.mimeType),
      size: sizeToSafeNumber(row.size),
      workspaceId: row.workspaceId ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
