import type { ActivityType as PrismaActivityType, Prisma } from "@prisma/client";
import * as activityRepository from "../repositories/activity.repository.js";
import { HttpError } from "../utils/http-error.js";
import { isUuid } from "../utils/uuid.js";

export const ACTIVITY_TYPES = ["upload", "chat", "search"] as const;
export type ActivityTypeName = (typeof ACTIVITY_TYPES)[number];

// Default limit for activity pagination
const DEFAULT_LIMIT = 20;
// Maximum limit for activity pagination
const MAX_LIMIT = 100;
// Maximum length for activity metadata query
const MAX_METADATA_QUERY_LEN = 200;
// Debounce time for search logs
const SEARCH_LOG_DEBOUNCE_MS = 2_000;

const lastSearchLogAtByUser = new Map<string, number>();
const pendingSearchLogByUser = new Set<string>();

function isActivityTypeName(t: string): t is ActivityTypeName {
  return (ACTIVITY_TYPES as readonly string[]).includes(t);
}

function toPrismaType(t: ActivityTypeName): PrismaActivityType {
  return t as PrismaActivityType;
}

function trimQuery(value: string): string {
  const q = value.trim();
  if (q.length <= MAX_METADATA_QUERY_LEN) return q;
  return q.slice(0, MAX_METADATA_QUERY_LEN);
}

// Builds the metadata for an activity row
// input example:
// {
//   fileId: "123",
//   fileName: "weather.pdf",
//   query: "I want to find a file about the weather",
// }
// output example:
// { fileId: "123", fileName: "weather.pdf" }
// { query: "I want to find a file about the weather" }
function buildMetadata(
  type: ActivityTypeName,
  metadata: Record<string, unknown>
): Prisma.InputJsonValue | null {
  if (type === "upload") {
    const fileId = metadata.fileId;
    const fileName = metadata.fileName;
    if (typeof fileId !== "string" || !isUuid(fileId)) return null;
    if (typeof fileName !== "string" || !fileName.trim()) return null;
    const name = fileName.replace(/^.*[/\\]/, "").trim() || fileName.trim();
    const row: Record<string, string> = {
      fileId,
      fileName: name.slice(0, 512),
    };
    const ws = metadata.workspaceId;
    if (ws !== undefined && ws !== null && String(ws).trim() !== "") {
      if (typeof ws !== "string" || !isUuid(ws)) return null;
      row.workspaceId = ws;
    }
    return row as Prisma.InputJsonValue;
  }
  if (type === "chat" || type === "search") {
    const query = metadata.query;
    if (typeof query !== "string" || !query.trim()) return null;
    const row: Record<string, string> = { query: trimQuery(query) };
    const ws = metadata.workspaceId;
    if (ws !== undefined && ws !== null && String(ws).trim() !== "") {
      if (typeof ws !== "string" || !isUuid(ws)) return null;
      row.workspaceId = ws;
    }
    return row as Prisma.InputJsonValue;
  }
  return null;
}

// Logs an activity
// input example:
// {
//   userId: "123",
//   type: "upload",
//   metadata: { fileId: "123", fileName: "weather.pdf" },
// }
// output example:
// { id: "123", userId: "123", type: "upload", metadata: { fileId: "123", fileName: "weather.pdf" }, createdAt: "2026-04-13T12:00:00.000Z" }
export function logActivity(params: {
  userId: string;
  type: string;
  metadata: Record<string, unknown>;
}): void {
  if (!params.userId || !isActivityTypeName(params.type)) return;

  const type = params.type;
  const metadata = buildMetadata(type, params.metadata);
  if (!metadata) return;

  if (type === "search") {
    const now = Date.now();
    const last = lastSearchLogAtByUser.get(params.userId) ?? 0;
    if (now - last < SEARCH_LOG_DEBOUNCE_MS) return;
    if (pendingSearchLogByUser.has(params.userId)) return;
    pendingSearchLogByUser.add(params.userId);
  }

  void activityRepository
    .insertActivity({
      userId: params.userId,
      type: toPrismaType(type),
      metadata,
    })
    .catch(() => {})
    .finally(() => {
      if (type === "search") {
        pendingSearchLogByUser.delete(params.userId);
        lastSearchLogAtByUser.set(params.userId, Date.now());
      }
    });
}

export type ActivityCursorPayload = { t: string; i: string };

// Encodes an activity cursor
// input example:
// {
//   createdAt: "2026-04-13T12:00:00.000Z",
//   id: "123",
// }
// output example:
// "eyJ0IjoiMjAyNi0wNC0xM1QxMjowMDowMC4wMDBaIiwiaSI6IjEyMyJ9"
export function encodeActivityCursor(row: {
  createdAt: Date;
  id: string;
}): string {
  const payload: ActivityCursorPayload = {
    t: row.createdAt.toISOString(),
    i: row.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeActivityCursor(
  cursor: string
): ActivityCursorPayload | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const t = (parsed as { t?: unknown }).t;
    const i = (parsed as { i?: unknown }).i;
    if (typeof t !== "string" || typeof i !== "string") return null;
    const createdAt = new Date(t);
    if (Number.isNaN(createdAt.getTime()) || !isUuid(i)) return null;
    return { t, i };
  } catch {
    return null;
  }
}

export async function getUserActivity(params: {
  userId: string;
  limit?: number;
  cursor?: string | null;
  /** when set, only rows whose metadata.workspaceId equals this uuid */
  workspaceId?: string | null;
}): Promise<{
  items: Array<{
    id: string;
    type: ActivityTypeName;
    metadata: unknown;
    createdAt: string;
  }>;
  nextCursor: string | null;
}> {
  const rawLimit = params.limit ?? DEFAULT_LIMIT;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(rawLimit)) || DEFAULT_LIMIT)
  );

  const decoded =
    params.cursor && String(params.cursor).trim()
      ? decodeActivityCursor(String(params.cursor).trim())
      : null;
  if (params.cursor && String(params.cursor).trim() && !decoded) {
    throw new HttpError(400, "Invalid cursor");
  }

  const cursorDate = decoded ? new Date(decoded.t) : null;
  const cursorId = decoded?.i ?? null;

  const where: Prisma.ActivityWhereInput = {
    userId: params.userId,
    ...(params.workspaceId && isUuid(params.workspaceId)
      ? {
          metadata: {
            path: ["workspaceId"],
            equals: params.workspaceId,
          },
        }
      : {}),
    ...(cursorDate && cursorId
      ? {
          OR: [
            { createdAt: { lt: cursorDate } },
            {
              AND: [{ createdAt: cursorDate }, { id: { lt: cursorId } }],
            },
          ],
        }
      : {}),
  };

  const rows = await activityRepository.listActivities(where, limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeActivityCursor(last) : null;

  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type as ActivityTypeName,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  };
}
