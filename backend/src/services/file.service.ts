import { env } from "../config/env.js";
import { createHash } from "node:crypto";
import { HttpError } from "../utils/http-error.js";
import {
  buildFileOrderBy,
  buildFileWhere,
  publicFileTypeLabel,
  sizeToSafeNumber,
  type ParsedFileListQuery,
} from "../utils/file-query-parser.js";
import { log } from "../utils/logger/index.js";
import * as fileRepository from "../repositories/file.repository.js";
import * as workspaceService from "./workspace.service.js";
import * as storageService from "./storage.service.js";
import { getChunkVectorStore } from "../vector-store/index.js";

const RECENTS_LIMIT = 15;
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
    let content = await fileRepository.findContentByHash(contentHash);
    let shouldIndexContent = false;
    if (!content) {
      content = await fileRepository.createContent(contentHash);
      shouldIndexContent = true;
    }
    const file = await fileRepository.createFileRecord({
      userId: params.userId,
      contentId: content.id,
      originalName: name,
      mimeType: params.mimeType,
      size: params.buffer.length,
      storagePath,
      sourceType: "upload",
      ...(params.workspaceId !== undefined
        ? { workspaceId: params.workspaceId }
        : {}),
    });
    return { file, shouldIndexContent, contentId: content.id };
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
