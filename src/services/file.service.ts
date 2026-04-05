import { HttpError } from "../utils/http-error.js";
import { log } from "../utils/logger/index.js";
import * as fileRepository from "../repositories/file.repository.js";
import * as storageService from "./storage.service.js";

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
}) {
  if (params.buffer.length === 0) {
    throw new HttpError(400, "Empty file");
  }

  const storagePath = storageService.buildStorageObjectPath(
    params.userId,
    params.originalName
  );
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

  try {
    return await fileRepository.createFileRecord({
      userId: params.userId,
      originalName: name,
      mimeType: params.mimeType,
      size: params.buffer.length,
      storagePath,
    });
  } catch (e) {
    await storageService
      .deleteFromFilesBucket(params.accessToken, storagePath)
      .catch(() => {});
    throw e;
  }
}
