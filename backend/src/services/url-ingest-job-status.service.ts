import { env } from "../config/env.js";
import { getUrlIngestJobById } from "../queue/url-ingest.queue.js";
import { HttpError } from "../utils/http-error.js";

export type UrlIngestJobStatusDto = {
  jobId: string;
  state: string;
  fileId?: string;
  fileName?: string;
  error?: string;
};

function parseReturnValue(raw: unknown): { fileId: string; fileName: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const fileId = (raw as { fileId?: unknown }).fileId;
  const fileName = (raw as { fileName?: unknown }).fileName;
  if (typeof fileId !== "string" || typeof fileName !== "string") return null;
  return { fileId, fileName };
}

export async function getUrlIngestJobStatus(
  userId: string,
  jobId: string
): Promise<UrlIngestJobStatusDto> {
  if (!env.REDIS_URL) {
    throw new HttpError(
      503,
      "URL ingest unavailable (Redis not configured)"
    );
  }

  const job = await getUrlIngestJobById(jobId);
  if (!job || job.data.userId !== userId) {
    throw new HttpError(404, "Job not found");
  }

  const state = await job.getState();
  const out: UrlIngestJobStatusDto = { jobId, state };

  if (state === "completed") {
    const parsed = parseReturnValue(job.returnvalue);
    if (parsed) {
      out.fileId = parsed.fileId;
      out.fileName = parsed.fileName;
    }
  }

  if (state === "failed") {
    out.error = job.failedReason?.trim() || "Job failed";
  }

  return out;
}
