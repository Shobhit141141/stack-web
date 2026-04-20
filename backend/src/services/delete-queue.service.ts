import * as fileService from "./file.service.js";
import { log } from "../utils/logger/index.js";

type DeleteJobStatus = "queued" | "running" | "completed" | "failed";

type DeleteJobRecord = {
  id: string;
  kind: "file" | "workspace";
  status: DeleteJobStatus;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

const jobs = new Map<string, DeleteJobRecord>();
let seq = 0;

function nextJobId(kind: "file" | "workspace"): string {
  seq += 1;
  return `${kind}-delete-${Date.now()}-${seq}`;
}

function queueJob(
  kind: "file" | "workspace",
  run: () => Promise<void>
): { jobId: string; status: "queued" } {
  const jobId = nextJobId(kind);
  jobs.set(jobId, {
    id: jobId,
    kind,
    status: "queued",
    queuedAt: Date.now(),
  });

  setImmediate(() => {
    void (async () => {
      const row = jobs.get(jobId);
      if (!row) return;
      row.status = "running";
      row.startedAt = Date.now();
      try {
        await run();
        row.status = "completed";
      } catch (e) {
        row.status = "failed";
        row.error = e instanceof Error ? e.message : String(e);
        log.error(`${kind} delete job failed id=${jobId} err=${row.error}`);
      } finally {
        row.finishedAt = Date.now();
      }
    })();
  });

  return { jobId, status: "queued" };
}

export function enqueueFileDelete(params: {
  accessToken: string;
  userId: string;
  fileId: string;
}): { jobId: string; status: "queued" } {
  return queueJob("file", async () => {
    await fileService.deleteUserFile(params);
  });
}

export function enqueueWorkspaceDelete(params: {
  accessToken: string;
  userId: string;
  workspaceId: string;
}): { jobId: string; status: "queued" } {
  return queueJob("workspace", async () => {
    await fileService.deleteWorkspaceAndRelated(params);
  });
}

export function getDeleteJob(jobId: string): DeleteJobRecord | undefined {
  return jobs.get(jobId);
}
