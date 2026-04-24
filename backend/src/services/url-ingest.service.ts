import { createHash } from "node:crypto";

import { UnrecoverableError } from "bullmq";

import { env } from "../config/env.js";
import {
  DOCX_MIME,
  HTML_MIME,
  PDF_MIME,
  PLAIN_MIME,
  URL_INGEST_ALLOWED_MIME_TYPES,
  JPG_MIME,
  PNG_MIME,
  WEBP_MIME,
  isImageMimeType,
} from "../constants/upload-file-types.js";
import { USER_FILE_QUOTA_MAX_BYTES_PER_FILE } from "../constants/user-file-limits.js";
import * as fileRepository from "../repositories/file.repository.js";
import { HttpError } from "../utils/http-error.js";
import { cleanExtractedText } from "../utils/extraction/text-clean.util.js";
import { filePipelinePanel } from "../utils/file-pipeline-log.util.js";
import { log } from "../utils/logger/index.js";
import { scheduleDocumentIndexAfterExtraction } from "./document-index.service.js";
import { scheduleExtractionAfterUpload } from "./extraction.service.js";
import { scheduleImageIndexAfterUpload } from "./image-index.service.js";
import { scheduleContentSummaryGeneration } from "./summary.service.js";
import * as fileService from "./file.service.js";
import {
  thumbnailPathForMainStoragePath,
  tryBuildWebpThumbnail,
} from "./image-thumbnail.service.js";
import * as storageService from "./storage.service.js";
import * as workspaceService from "./workspace.service.js";
import { extractReadableTextFromHtml } from "../utils/url-ingest/html-readability.util.js";
import { assertUrlSafeForFetch } from "../utils/url-ingest/url-ssrf.util.js";

const MAX_REDIRECTS = 5;

// Purpose: Turn a user-facing error into a BullMQ non-retryable failure (client/validation class errors).
// Ex input: "Unsupported content type for URL ingest"
// Ex output: throws UnrecoverableError with that message (never returns).
function failClient(message: string): never {
  throw new UnrecoverableError(message);
}

// Purpose: Split a Content-Type header into lowercase MIME and optional charset parameter.
// Ex input: 'text/html; charset=utf-8' (or null when header missing)
// Ex output: { mime: 'text/html', charset: 'utf-8' } or { mime: 'application/octet-stream' } for null input
function parseMimeAndCharset(contentTypeHeader: string | null): {
  mime: string;
  charset?: string;
} {
  if (!contentTypeHeader) return { mime: "application/octet-stream" };
  const parts = contentTypeHeader.split(";").map((p) => p.trim());
  const mime = (parts[0] || "application/octet-stream").toLowerCase();
  let charset: string | undefined;
  for (let i = 1; i < parts.length; i++) {
    const m = /^charset\s*=\s*["']?([^"';\s]+)/i.exec(parts[i]!);
    if (m?.[1]) charset = m[1]!.toLowerCase();
  }
  return { mime, charset };
}

// Purpose: Detect PDF/DOCX from magic bytes when the server lied or omitted a useful Content-Type.
// Ex input: buffer starting with %PDF-, declaredMime 'application/octet-stream', pathname '/x/y.pdf'
// Ex output: 'application/pdf' (PDF_MIME)
function sniffMime(
  buffer: Buffer,
  declaredMime: string,
  pathname: string
): string {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("binary") === "%PDF-"
  ) {
    return PDF_MIME;
  }
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const lower = pathname.toLowerCase();
    if (
      lower.endsWith(".docx") ||
      declaredMime.includes("word") ||
      declaredMime.includes("officedocument")
    ) {
      return DOCX_MIME;
    }
  }
  return declaredMime;
}

// Purpose: Choose the MIME type we will treat as authoritative (header + sniff + URL path hints).
// Ex input: pdf buffer, 'application/octet-stream', 'https://cdn.example.com/reports/q4.pdf'
// Ex output: 'application/pdf'
function resolveEffectiveMime(
  buffer: Buffer,
  headerMime: string,
  finalUrl: string
): string {
  let path = "";
  try {
    path = new URL(finalUrl).pathname;
  } catch {
    path = "";
  }
  let m = headerMime;
  if (m === "application/octet-stream" || m === "binary/octet-stream") {
    m = sniffMime(buffer, m, path);
  }
  if (m === "application/octet-stream") {
    const lower = path.toLowerCase();
    if (lower.endsWith(".pdf")) return PDF_MIME;
    if (lower.endsWith(".docx")) return DOCX_MIME;
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return JPG_MIME;
    if (lower.endsWith(".png")) return PNG_MIME;
    if (lower.endsWith(".webp")) return WEBP_MIME;
  }
  return m;
}

// Purpose: derive a default filename from mime type for URL imports.
// Ex input: "image/png"
// Ex output: "image.png"
function defaultFileNameByMime(mimeType: string): string {
  if (mimeType === PDF_MIME) return "document.pdf";
  if (mimeType === DOCX_MIME) return "document.docx";
  if (mimeType === JPG_MIME) return "image.jpg";
  if (mimeType === PNG_MIME) return "image.png";
  if (mimeType === WEBP_MIME) return "image.webp";
  return "file";
}

// Purpose: Stream the fetch Response body into a Buffer, aborting if Content-Length or streamed size exceeds maxBytes.
// Ex input: fetch Response with body < maxBytes, maxBytes 10_000_000
// Ex output: Buffer of the full body
async function readBodyWithLimit(
  res: Response,
  maxBytes: number
): Promise<Buffer> {
  const lenRaw = res.headers.get("content-length");
  if (lenRaw) {
    const n = Number(lenRaw);
    if (Number.isFinite(n) && n > maxBytes) {
      failClient("Response body exceeds size limit");
    }
  }
  const body = res.body;
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    total += value.length;
    if (total > maxBytes) {
      failClient("Response body exceeds size limit");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Purpose: Decode bytes to a string using declared charset when valid, else UTF-8 with replacement for bad sequences.
// Ex input: Buffer.from('café', 'utf8'), charset undefined
// Ex output: 'café'
function decodeTextBuffer(buffer: Buffer, charset?: string): string {
  try {
    if (charset) {
      return new TextDecoder(charset, { fatal: false }).decode(buffer);
    }
  } catch {
    // fall through
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

// Purpose: Derive a filesystem-safe display filename from the URL path (for PDF/DOCX uploads).
// Ex input: 'https://example.com/docs/Annual%20Report.pdf', fallback 'document.pdf'
// Ex output: 'Annual_Report.pdf' (sanitized last path segment)
function displayNameFromUrl(urlStr: string, fallback: string): string {
  try {
    const seg = new URL(urlStr).pathname.split("/").filter(Boolean).pop();
    if (!seg) return fallback;
    const cleaned = seg.replace(/[^\w.\-()]+/g, "_").slice(0, 200);
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

// Purpose: Build a .txt artifact name for HTML/plain text ingests (host-based, safe for storage paths).
// Ex input: 'https://news.example.com/article/123'
// Ex output: 'news.example.com-page.txt'
function textArtifactName(sourceUrl: string): string {
  let host = "page";
  try {
    host =
      new URL(sourceUrl).hostname.replace(/[^\w.-]+/g, "_").slice(0, 120) ||
      "page";
  } catch {
    host = "page";
  }
  return `${host}-page.txt`;
}

// Purpose: Log structured context when Supabase/files bucket upload fails (no return value).
// Ex input: new Error('403'), { storagePath: 'u/…/x.pdf', userId: 'uuid', mimeType: 'application/pdf', sizeBytes: 1200 }
// Ex output: void (writes log.error)
function logStorageFailure(
  e: unknown,
  ctx: {
    storagePath: string;
    userId: string;
    mimeType: string;
    sizeBytes: number;
  }
) {
  const header = [
    "URL ingest storage upload failed",
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
  log.error(`${header}\n${String(e)}`);
}

export type UrlIngestJobSuccess = { fileId: string; fileName: string };

// Purpose: BullMQ job handler — fetch URL safely, normalize to allowed types, dedupe by content hash, upload + DB row, then schedule extract/index when content is new.
// Ex input: payload { userId: 'uuid', accessToken: 'jwt', sourceUrl: 'https://example.com/doc.pdf' }, meta { jobId: '42' }
// Ex output: resolves with file ids for BullMQ returnvalue; throws UnrecoverableError for client errors; throws Error for retryable failures (e.g. 502, storage after upload attempt).
export async function processUrlIngestJob(
  payload: {
    userId: string;
    accessToken: string;
    sourceUrl: string;
    workspaceId?: string;
  },
  meta: { jobId: string }
): Promise<UrlIngestJobSuccess> {
  const { userId, accessToken, sourceUrl, workspaceId } = payload;
  const jobId = meta.jobId;

  log.info(
    filePipelinePanel("FILE PIPELINE · url-ingest · queued (worker)", jobId, {
      sourceType: "url",
      sourceUrl,
    })
  );

  let fetchLatencyMs = 0;
  let contentTypeLogged = "";
  let finalUrl = "";

  try {
    if (workspaceId) {
      await workspaceService.assertWorkspaceOwned(userId, workspaceId);
    }

    const signal = AbortSignal.timeout(env.URL_FETCH_TIMEOUT_MS);
    const tFetch0 = Date.now();
    let current = sourceUrl.trim();

    let buffer!: Buffer;
    let contentTypeHeader: string | null = null;
    let settled = false;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = await assertUrlSafeForFetch(current);
      const res = await fetch(u.href, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          Accept: "*/*",
          "User-Agent":
            "Mozilla/5.0 (compatible; FileMindUrlIngest/1.0; +https://filemind.invalid/bot)",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          failClient(`HTTP ${res.status} redirect without Location`);
        }
        current = new URL(loc, u.href).href;
        continue;
      }

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          failClient(`HTTP ${res.status}`);
        }
        throw new Error(`HTTP ${res.status}`);
      }

      contentTypeHeader = res.headers.get("content-type");
      buffer = await readBodyWithLimit(res, env.URL_FETCH_MAX_BYTES);
      finalUrl = u.href;
      settled = true;
      break;
    }

    if (!settled) {
      failClient("Too many redirects");
    }

    fetchLatencyMs = Date.now() - tFetch0;
    const { mime: headerMime, charset } =
      parseMimeAndCharset(contentTypeHeader);
    const effectiveMime = resolveEffectiveMime(buffer, headerMime, finalUrl);
    contentTypeLogged = effectiveMime;

    log.info(
      filePipelinePanel("FILE PIPELINE · url-ingest · fetched", jobId, {
        sourceType: "url",
        sourceUrl,
        fetch_latency_ms: fetchLatencyMs,
        content_type: contentTypeLogged,
        finalUrl,
        bytes: buffer.length,
      })
    );

    if (!URL_INGEST_ALLOWED_MIME_TYPES.has(effectiveMime)) {
      failClient("Unsupported content type for URL ingest");
    }

    let uploadBody: Buffer;
    let uploadMime: string;
    let originalName: string;
    let contentHash: string;

    if (effectiveMime === HTML_MIME) {
      const html = decodeTextBuffer(buffer, charset);
      let extracted: string;
      try {
        extracted = extractReadableTextFromHtml(html);
      } catch {
        failClient("Could not parse HTML");
      }
      if (!extracted.trim()) {
        failClient("Could not extract readable text from HTML");
      }
      uploadBody = Buffer.from(extracted, "utf8");
      uploadMime = PLAIN_MIME;
      originalName = textArtifactName(sourceUrl);
      contentHash = createHash("sha256").update(uploadBody).digest("hex");
    } else if (effectiveMime === PLAIN_MIME) {
      const text = decodeTextBuffer(buffer, charset);
      const cleaned = cleanExtractedText(text);
      if (!cleaned.trim()) {
        failClient("Empty text content");
      }
      uploadBody = Buffer.from(cleaned, "utf8");
      uploadMime = PLAIN_MIME;
      originalName = textArtifactName(sourceUrl);
      contentHash = createHash("sha256").update(uploadBody).digest("hex");
    } else {
      uploadBody = buffer;
      uploadMime = effectiveMime;
      originalName = displayNameFromUrl(
        finalUrl,
        defaultFileNameByMime(effectiveMime)
      );
      if (
        effectiveMime === DOCX_MIME &&
        !originalName.toLowerCase().endsWith(".docx")
      ) {
        originalName = `${originalName}.docx`;
      }
      if (
        effectiveMime === PDF_MIME &&
        !originalName.toLowerCase().endsWith(".pdf")
      ) {
        originalName = `${originalName}.pdf`;
      }
      if (
        effectiveMime === JPG_MIME &&
        !originalName.toLowerCase().endsWith(".jpg") &&
        !originalName.toLowerCase().endsWith(".jpeg")
      ) {
        originalName = `${originalName}.jpg`;
      }
      if (
        effectiveMime === PNG_MIME &&
        !originalName.toLowerCase().endsWith(".png")
      ) {
        originalName = `${originalName}.png`;
      }
      if (
        effectiveMime === WEBP_MIME &&
        !originalName.toLowerCase().endsWith(".webp")
      ) {
        originalName = `${originalName}.webp`;
      }
      contentHash = createHash("sha256").update(uploadBody).digest("hex");
    }

    if (uploadBody.length > USER_FILE_QUOTA_MAX_BYTES_PER_FILE) {
      failClient(
        `Imported file exceeds maximum size of ${USER_FILE_QUOTA_MAX_BYTES_PER_FILE / (1024 * 1024)} MB`
      );
    }

    const storagePath = storageService.buildStorageObjectPath(
      userId,
      originalName
    );

    try {
      await storageService.uploadToFilesBucket({
        accessToken,
        storagePath,
        body: uploadBody,
        contentType: uploadMime,
      });
    } catch (e) {
      logStorageFailure(e, {
        storagePath,
        userId,
        mimeType: uploadMime,
        sizeBytes: uploadBody.length,
      });
      throw new Error("Could not store file");
    }

    let thumbnailStoragePath: string | undefined;
    if (uploadMime.toLowerCase().startsWith("image/")) {
      const thumbBuf = await tryBuildWebpThumbnail(uploadBody);
      if (thumbBuf) {
        const thumbPath = thumbnailPathForMainStoragePath(storagePath);
        try {
          await storageService.uploadToFilesBucket({
            accessToken,
            storagePath: thumbPath,
            body: thumbBuf,
            contentType: "image/webp",
          });
          thumbnailStoragePath = thumbPath;
        } catch (e) {
          log.warn(
            `url-ingest thumbnail upload skipped path=${thumbPath}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }

    let shouldIndexContent: boolean;
    let file: Awaited<ReturnType<typeof fileRepository.createFileRecord>>;
    let contentId: string;
    try {
      const committed = await fileService.commitUserFileRecordAfterStorage({
        userId,
        contentHash,
        originalName,
        mimeType: uploadMime,
        sizeBytes: uploadBody.length,
        storagePath,
        ...(thumbnailStoragePath ? { thumbnailStoragePath } : {}),
        sourceType: "url",
        sourceUrl,
        workspaceId: workspaceId ?? null,
      });
      file = committed.file;
      shouldIndexContent = committed.shouldIndexContent;
      contentId = committed.contentId;
    } catch (e) {
      await storageService
        .deleteFromFilesBucket(accessToken, storagePath)
        .catch(() => {});
      if (thumbnailStoragePath) {
        await storageService
          .deleteFromFilesBucket(accessToken, thumbnailStoragePath)
          .catch(() => {});
      }
      throw e;
    }

    log.info(
      filePipelinePanel("FILE PIPELINE · url-ingest · file row", file.id, {
        sourceType: "url",
        sourceUrl,
        fetch_latency_ms: fetchLatencyMs,
        content_type: contentTypeLogged,
        storagePath,
        mime: uploadMime,
        sizeBytes: uploadBody.length,
        contentId,
        dedup: shouldIndexContent ? "new_content" : "reused_content",
        next:
          shouldIndexContent && (uploadMime === PDF_MIME || uploadMime === DOCX_MIME)
            ? "background extract → index"
            : shouldIndexContent && uploadMime === PLAIN_MIME
              ? "background index"
              : shouldIndexContent && isImageMimeType(uploadMime)
                ? "background image-index → embed"
              : "no index (reused or unsupported for index)",
      })
    );

    if (!shouldIndexContent) {
      return { fileId: file.id, fileName: file.originalName };
    }

    if (uploadMime === PDF_MIME || uploadMime === DOCX_MIME) {
      scheduleExtractionAfterUpload({
        contentId,
        fileId: file.id,
        buffer: uploadBody,
        mimeType: uploadMime,
        originalName,
      });
    } else if (uploadMime === PLAIN_MIME) {
      const extractedText = uploadBody.toString("utf8");
      scheduleDocumentIndexAfterExtraction(contentId, extractedText);
      scheduleContentSummaryGeneration({
        contentId,
        extractedText,
      });
    } else if (isImageMimeType(uploadMime)) {
      scheduleImageIndexAfterUpload({
        contentId,
        buffer: uploadBody,
        mimeType: uploadMime,
        originalName,
      });
    }

    return { fileId: file.id, fileName: file.originalName };
  } catch (e) {
    if (e instanceof HttpError) {
      failClient(e.message);
    }
    if (e instanceof UnrecoverableError) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(
      filePipelinePanel("FILE PIPELINE · url-ingest · error", jobId, {
        sourceType: "url",
        sourceUrl,
        fetch_latency_ms: fetchLatencyMs,
        content_type: contentTypeLogged || "(n/a)",
        error: msg,
      })
    );
    throw e;
  }
}
