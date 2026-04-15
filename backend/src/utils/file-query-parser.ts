import type { Prisma } from "@prisma/client";
import {
  FILE_SHORT_TYPE_TO_MIME,
  isFileShortType,
  type FileShortType,
} from "../constants/upload-file-types.js";
import { HttpError } from "./http-error.js";
import { isUuid } from "./uuid.js";

export const FILE_LIST_SORT_VALUES = [
  "createdAt_desc",
  "createdAt_asc",
  "name_asc",
  "name_desc",
  "size_desc",
  "size_asc",
] as const;

export type FileListSort = (typeof FILE_LIST_SORT_VALUES)[number];

/** Alias for query `type=` param; same as `FileShortType`. */
export type FileTypeFilter = FileShortType;

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_Q_LENGTH = 200;

export type ParsedFileListQuery = {
  page: number;
  limit: number;
  sort: FileListSort;
  q?: string;
  type?: FileShortType;
  from?: Date;
  to?: Date;
  minSize?: bigint;
  maxSize?: bigint;
  /** when set, only files linked to this workspace */
  workspaceId?: string;
  /** when true, only files not in any workspace (mutually exclusive with workspaceId) */
  unassignedOnly?: boolean;
};

function parsePositiveInt(raw: unknown, fallback: number, max: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) throw new HttpError(400, "Invalid page or limit");
  return Math.min(n, max);
}

function parseOptionalBigInt(raw: unknown, label: string): bigint | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Invalid ${label}`);
  return BigInt(n);
}

function parseDateOnly(raw: string, endOfDay: boolean): Date {
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new HttpError(400, "Invalid date format (use YYYY-MM-DD)");
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(
    Date.UTC(
      y,
      mo,
      d,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    )
  );
  if (Number.isNaN(dt.getTime())) throw new HttpError(400, "Invalid date");
  return dt;
}

export function parseFileListQuery(qs: Record<string, unknown>): ParsedFileListQuery {
  const page = parsePositiveInt(qs.page, 1, 1_000_000);
  const limit = parsePositiveInt(qs.limit, DEFAULT_LIMIT, MAX_LIMIT);

  const sortRaw = qs.sort;
  const sort =
    sortRaw === undefined || sortRaw === null || sortRaw === ""
      ? "createdAt_desc"
      : String(sortRaw);
  if (!FILE_LIST_SORT_VALUES.includes(sort as FileListSort)) {
    throw new HttpError(400, "Invalid sort");
  }

  let q: string | undefined;
  if (qs.q !== undefined && qs.q !== null && String(qs.q).trim() !== "") {
    q = String(qs.q).trim();
    if (q.length > MAX_Q_LENGTH) {
      throw new HttpError(400, "Search query too long");
    }
  }

  let type: FileShortType | undefined;
  if (qs.type !== undefined && qs.type !== null && String(qs.type) !== "") {
    const t = String(qs.type).toLowerCase();
    if (!isFileShortType(t)) {
      throw new HttpError(400, "Invalid type filter (use pdf or docx)");
    }
    type = t;
  }

  let from: Date | undefined;
  let to: Date | undefined;
  if (qs.from !== undefined && qs.from !== null && String(qs.from) !== "") {
    from = parseDateOnly(String(qs.from), false);
  }
  if (qs.to !== undefined && qs.to !== null && String(qs.to) !== "") {
    to = parseDateOnly(String(qs.to), true);
  }
  if (from && to && from > to) {
    throw new HttpError(400, "from must be before or equal to to");
  }

  const minSize = parseOptionalBigInt(qs.minSize, "minSize");
  const maxSize = parseOptionalBigInt(qs.maxSize, "maxSize");
  if (minSize !== undefined && maxSize !== undefined && minSize > maxSize) {
    throw new HttpError(400, "minSize must be less than or equal to maxSize");
  }

  let workspaceId: string | undefined;
  if (
    qs.workspaceId !== undefined &&
    qs.workspaceId !== null &&
    String(qs.workspaceId).trim() !== ""
  ) {
    const w = String(qs.workspaceId).trim();
    if (!isUuid(w)) throw new HttpError(400, "Invalid workspaceId");
    workspaceId = w;
  }

  const unassignedRaw = qs.unassigned;
  const unassignedOnly =
    unassignedRaw === true ||
    unassignedRaw === 1 ||
    String(unassignedRaw).toLowerCase() === "true" ||
    String(unassignedRaw) === "1";

  if (unassignedOnly && workspaceId) {
    throw new HttpError(400, "Use either workspaceId or unassigned, not both");
  }

  return {
    page,
    limit,
    sort: sort as FileListSort,
    q,
    type,
    from,
    to,
    minSize,
    maxSize,
    workspaceId,
    unassignedOnly: unassignedOnly || undefined,
  };
}

export function buildFileWhere(
  userId: string,
  parsed: ParsedFileListQuery
): Prisma.FileWhereInput {
  const and: Prisma.FileWhereInput[] = [{ userId }];

  if (parsed.q) {
    and.push({
      originalName: { contains: parsed.q, mode: "insensitive" },
    });
  }

  if (parsed.type) {
    and.push({ mimeType: FILE_SHORT_TYPE_TO_MIME[parsed.type] });
  }

  if (parsed.from || parsed.to) {
    const range: { gte?: Date; lte?: Date } = {};
    if (parsed.from) range.gte = parsed.from;
    if (parsed.to) range.lte = parsed.to;
    and.push({ createdAt: range });
  }

  if (parsed.minSize !== undefined || parsed.maxSize !== undefined) {
    const sr: { gte?: bigint; lte?: bigint } = {};
    if (parsed.minSize !== undefined) sr.gte = parsed.minSize;
    if (parsed.maxSize !== undefined) sr.lte = parsed.maxSize;
    and.push({ size: { gte: Number(sr.gte), lte: Number(sr.lte) } });
  }

  if (parsed.unassignedOnly) {
    and.push({ workspaceId: null });
  } else if (parsed.workspaceId) {
    and.push({ workspaceId: parsed.workspaceId });
  }

  return and.length === 1 ? and[0]! : { AND: and };
}

export function parseSearchQuery(qs: Record<string, unknown>): ParsedFileListQuery {
  const base = parseFileListQuery(qs);
  if (!base.q) throw new HttpError(400, "Missing q");
  return base;
}

export function publicFileTypeLabel(originalName: string, mimeType: string): string {
  const lower = originalName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  if (ext === "pdf" || ext === "docx") return ext;
  if (mimeType === FILE_SHORT_TYPE_TO_MIME.pdf) return "pdf";
  if (mimeType === FILE_SHORT_TYPE_TO_MIME.docx) return "docx";
  const slash = mimeType.indexOf("/");
  return slash === -1 ? "file" : mimeType.slice(slash + 1).slice(0, 32);
}

export function sizeToSafeNumber(size: bigint | number): number {
  if (typeof size === "number") {
    return Number.isSafeInteger(size) ? size : Number.MAX_SAFE_INTEGER;
  }
  const n = Number(size);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

export function buildFileOrderBy(
  sort: FileListSort
): Prisma.FileOrderByWithRelationInput {
  switch (sort) {
    case "createdAt_desc":
      return { createdAt: "desc" };
    case "createdAt_asc":
      return { createdAt: "asc" };
    case "name_asc":
      return { originalName: "asc" };
    case "name_desc":
      return { originalName: "desc" };
    case "size_desc":
      return { size: "desc" };
    case "size_asc":
      return { size: "asc" };
    default:
      return { createdAt: "desc" };
  }
}
