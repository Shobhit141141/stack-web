import { type File as FileRow, Prisma } from "@prisma/client";
import { prisma } from "./db.js";

// prisma root or transaction client for file + contents raw helpers
export type FileDbClient = typeof prisma;

const listSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  workspaceId: true,
  createdAt: true,
} as const;

export type FileListRow = Prisma.FileGetPayload<{ select: typeof listSelect }>;

export async function aggregateUserFilesForUser(userId: string): Promise<{
  count: number;
  totalSizeBytes: bigint;
}> {
  const r = await prisma.file.aggregate({
    where: { userId },
    _count: { _all: true },
    _sum: { size: true },
  });
  return {
    count: r._count._all,
    totalSizeBytes: r._sum.size ?? 0n,
  };
}

export async function createFileRecord(
  data: {
    userId: string;
    contentId: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
    sourceType?: string;
    sourceUrl?: string | null;
    workspaceId?: string | null;
  },
  db: FileDbClient = prisma
): Promise<FileRow> {
  return db.file.create({
    data: {
      userId: data.userId,
      contentId: data.contentId,
      originalName: data.originalName,
      mimeType: data.mimeType,
      size: data.size,
      storagePath: data.storagePath,
      sourceType: data.sourceType ?? "upload",
      sourceUrl: data.sourceUrl ?? null,
      ...(data.workspaceId !== undefined ? { workspaceId: data.workspaceId } : {}),
    },
  });
}

export async function findContentByHash(
  hash: string,
  db: FileDbClient = prisma
) {
  const rows = await db.$queryRaw<{ id: string; hash: string }[]>`
    SELECT id, hash FROM "contents" WHERE hash = ${hash}
  `;
  return rows[0] ?? null;
}

export async function createContent(hash: string, db: FileDbClient = prisma) {
  const rows = await db.$queryRaw<{ id: string; hash: string }[]>`
    INSERT INTO "contents" ("id", "hash")
    VALUES (gen_random_uuid(), ${hash})
    RETURNING id, hash
  `;
  return rows[0]!;
}

export async function countFiles(where: Prisma.FileWhereInput): Promise<number> {
  return prisma.file.count({ where });
}

export async function findFilesForList(params: {
  where: Prisma.FileWhereInput;
  orderBy: Prisma.FileOrderByWithRelationInput;
  skip: number;
  take: number;
}): Promise<FileListRow[]> {
  return prisma.file.findMany({
    where: params.where,
    orderBy: params.orderBy,
    skip: params.skip,
    take: params.take,
    select: listSelect,
  });
}

export async function findFileByIdForUser(id: string, userId: string) {
  return prisma.file.findFirst({
    where: { id, userId },
    select: {
      id: true,
      contentId: true,
      originalName: true,
      mimeType: true,
      size: true,
      storagePath: true,
      workspaceId: true,
      createdAt: true,
    },
  });
}

// resolves file by exact name, else case-insensitive contains (max 10) for voice/tool hints.
export async function findFilesByNameHintForUser(
  userId: string,
  hint: string
): Promise<FileListRow[]> {
  const trimmed = hint.trim();
  if (!trimmed) return [];
  const exact = await prisma.file.findFirst({
    where: { userId, originalName: trimmed },
    select: listSelect,
  });
  if (exact) return [exact];
  return prisma.file.findMany({
    where: {
      userId,
      originalName: { contains: trimmed, mode: "insensitive" },
    },
    take: 10,
    orderBy: { updatedAt: "desc" },
    select: listSelect,
  });
}

// sets last_opened_at for a file owned by user. no-op if id/user mismatch.
export async function touchFileLastOpened(fileId: string, userId: string) {
  await prisma.file.updateMany({
    where: { id: fileId, userId },
    data: { lastOpenedAt: new Date() },
  });
}

// recent files for sidebar etc.: opened at least once, newest first.
export async function findRecentFilesForUser(
  userId: string,
  take: number
): Promise<FileListRow[]> {
  return prisma.file.findMany({
    where: { userId, lastOpenedAt: { not: null } },
    orderBy: { lastOpenedAt: "desc" },
    take,
    select: listSelect,
  });
}

const searchMetaSelect = {
  id: true,
  contentId: true,
  originalName: true,
  mimeType: true,
  size: true,
  sourceType: true,
  sourceUrl: true,
  workspaceId: true,
  createdAt: true,
} as const;

export type FileSearchMetaRow = {
  id: string;
  contentId: string;
  originalName: string;
  mimeType: string;
  size: bigint;
  sourceType: string;
  sourceUrl: string | null;
  workspaceId: string | null;
  createdAt: Date;
};

export type WorkspaceFileDeleteRow = {
  id: string;
  contentId: string;
  storagePath: string;
};

export async function findFilesByIdsForUser(
  userId: string,
  ids: string[]
): Promise<FileSearchMetaRow[]> {
  if (ids.length === 0) return [];
  return prisma.file.findMany({
    where: { userId, id: { in: ids } },
    select: searchMetaSelect,
  });
}

export async function findFilesByContentIdsForUser(
  userId: string,
  contentIds: string[]
): Promise<FileSearchMetaRow[]> {
  if (contentIds.length === 0) return [];
  return prisma.$queryRaw<FileSearchMetaRow[]>`
    SELECT f.id,
           f.content_id AS "contentId",
           f.name AS "originalName",
           f.type AS "mimeType",
           f.size,
           f.source_type AS "sourceType",
           f.source_url AS "sourceUrl",
           f.workspace_id AS "workspaceId",
           f.created_at AS "createdAt"
    FROM "files" f
    WHERE f.user_id = ${userId}::uuid
      AND f.content_id IN (${Prisma.join(
        contentIds.map((cid) => Prisma.sql`${cid}::uuid`)
      )})
  `;
}

// distinct contents the user has at least one file for (vector search filter scope)
export async function findDistinctContentIdsForUser(
  userId: string
): Promise<string[]> {
  const rows = await prisma.file.findMany({
    where: { userId },
    select: { contentId: true },
    distinct: ["contentId"],
  });
  return rows.map((r) => r.contentId);
}

// resolves file IDs to content IDs for that user. Omits missing IDs.
export async function findContentIdsByFileIdsForUser(
  userId: string,
  fileIds: string[]
): Promise<Map<string, string>> {
  if (fileIds.length === 0) return new Map();
  const rows = await prisma.file.findMany({
    where: { userId, id: { in: fileIds } },
    select: { id: true, contentId: true },
  });
  return new Map(rows.map((r) => [r.id, r.contentId]));
}

// lists file ids assigned to a workspace (caller must ensure workspace belongs to user).
export async function findFileIdsByWorkspaceForUser(
  userId: string,
  workspaceId: string
): Promise<string[]> {
  const rows = await prisma.file.findMany({
    where: { userId, workspaceId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// rows needed for fast workspace delete pipeline.
export async function findFilesForWorkspaceDeleteForUser(
  userId: string,
  workspaceId: string
): Promise<WorkspaceFileDeleteRow[]> {
  return prisma.file.findMany({
    where: { userId, workspaceId },
    select: { id: true, contentId: true, storagePath: true },
  });
}

// moves file into a workspace or clears workspace when workspaceId is null.
export async function updateFileWorkspaceForUser(
  fileId: string,
  userId: string,
  workspaceId: string | null
): Promise<boolean> {
  const r = await prisma.file.updateMany({
    where: { id: fileId, userId },
    data: { workspaceId },
  });
  return r.count > 0;
}

export async function updateFileNameForUser(
  fileId: string,
  userId: string,
  originalName: string
): Promise<boolean> {
  const r = await prisma.file.updateMany({
    where: { id: fileId, userId },
    data: { originalName },
  });
  return r.count > 0;
}

export async function deleteFileByIdForUser(
  fileId: string,
  userId: string
): Promise<boolean> {
  const r = await prisma.file.deleteMany({
    where: { id: fileId, userId },
  });
  return r.count > 0;
}

export async function deleteFilesByIdsForUser(
  userId: string,
  fileIds: string[]
): Promise<number> {
  if (fileIds.length === 0) return 0;
  const r = await prisma.file.deleteMany({
    where: { userId, id: { in: fileIds } },
  });
  return r.count;
}

export async function countFilesByContentId(
  contentId: string
): Promise<number> {
  return prisma.file.count({
    where: { contentId },
  });
}

export async function countFilesForContentIds(
  contentIds: string[]
): Promise<Map<string, number>> {
  if (contentIds.length === 0) return new Map();
  const rows = await prisma.file.groupBy({
    by: ["contentId"],
    where: { contentId: { in: contentIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.contentId, r._count._all]));
}

export async function deleteContentById(contentId: string): Promise<void> {
  await prisma.content.delete({
    where: { id: contentId },
    select: { id: true },
  });
}

export async function deleteContentsByIds(contentIds: string[]): Promise<number> {
  if (contentIds.length === 0) return 0;
  const r = await prisma.content.deleteMany({
    where: { id: { in: contentIds } },
  });
  return r.count;
}
