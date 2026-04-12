import { type File as FileRow, Prisma } from "@prisma/client";
import { prisma } from "./db.js";

const listSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} as const;

export type FileListRow = Prisma.FileGetPayload<{ select: typeof listSelect }>;

export async function createFileRecord(data: {
  userId: string;
  contentId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  sourceType?: string;
  sourceUrl?: string | null;
}): Promise<FileRow> {
  return prisma.file.create({
    data: {
      userId: data.userId,
      contentId: data.contentId,
      originalName: data.originalName,
      mimeType: data.mimeType,
      size: data.size,
      storagePath: data.storagePath,
      sourceType: data.sourceType ?? "upload",
      sourceUrl: data.sourceUrl ?? null,
    },
  });
}

export async function findContentByHash(hash: string) {
  const rows = await prisma.$queryRaw<{ id: string; hash: string }[]>`
    SELECT id, hash FROM "contents" WHERE hash = ${hash}
  `;
  return rows[0] ?? null;
}

export async function createContent(hash: string) {
  const rows = await prisma.$queryRaw<{ id: string; hash: string }[]>`
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
      originalName: true,
      mimeType: true,
      size: true,
      storagePath: true,
      createdAt: true,
    },
  });
}

const searchMetaSelect = {
  id: true,
  contentId: true,
  originalName: true,
  mimeType: true,
  createdAt: true,
} as const;

export type FileSearchMetaRow = {
  id: string;
  contentId: string;
  originalName: string;
  mimeType: string;
  createdAt: Date;
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
           f.created_at AS "createdAt"
    FROM "files" f
    WHERE f.user_id = ${userId}::uuid
      AND f.content_id IN (${Prisma.join(
        contentIds.map((cid) => Prisma.sql`${cid}::uuid`)
      )})
  `;
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
