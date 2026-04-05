import type { File as FileRow } from "@prisma/client";
import { prisma } from "./db.js";

export async function createFileRecord(data: {
  userId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}): Promise<FileRow> {
  return prisma.file.create({ data });
}
