import type { File as FileRow, Prisma } from "@prisma/client";
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
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}): Promise<FileRow> {
  return prisma.file.create({ data });
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
  originalName: true,
  mimeType: true,
  createdAt: true,
} as const;

export type FileSearchMetaRow = Prisma.FileGetPayload<{ select: typeof searchMetaSelect }>;

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
