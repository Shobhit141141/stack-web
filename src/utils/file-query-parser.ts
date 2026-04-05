import type { Prisma } from "@prisma/client";
import { HttpError } from "./http-error.js";

export const FILE_LIST_SORT_VALUES = [
  "createdAt_desc",
  "createdAt_asc",
  "name_asc",
  "name_desc",
  "size_desc",
  "size_asc",
] as const;

export type FileListSort = (typeof FILE_LIST_SORT_VALUES)[number];

const TYPE_FILTER_VALUES = ["pdf", "docx"] as const;
export type FileTypeFilter = (typeof TYPE_FILTER_VALUES)[number];

const MIME_BY_SHORT_TYPE: Record<FileTypeFilter, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_Q_LENGTH = 200;

export type ParsedFileListQuery = {
  page: number;
  limit: number;
  sort: FileListSort;
  q?: string;
  type?: FileTypeFilter;
  from?: Date;
  to?: Date;
  minSize?: bigint;
  maxSize?: bigint;
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

  let type: FileTypeFilter | undefined;
  if (qs.type !== undefined && qs.type !== null && String(qs.type) !== "") {
    const t = String(qs.type).toLowerCase();
    if (!TYPE_FILTER_VALUES.includes(t as FileTypeFilter)) {
      throw new HttpError(400, "Invalid type filter (use pdf or docx)");
    }
    type = t as FileTypeFilter;
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
    and.push({ mimeType: MIME_BY_SHORT_TYPE[parsed.type] });
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
  if (mimeType === MIME_BY_SHORT_TYPE.pdf) return "pdf";
  if (mimeType === MIME_BY_SHORT_TYPE.docx) return "docx";
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
