import { prisma } from "./db.js";

const listSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type WorkspaceListRow = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function createWorkspace(data: {
  userId: string;
  name: string;
}): Promise<WorkspaceListRow> {
  return prisma.workspace.create({
    data: { userId: data.userId, name: data.name },
    select: listSelect,
  });
}

export async function findWorkspaceByIdForUser(
  id: string,
  userId: string
): Promise<WorkspaceListRow | null> {
  return prisma.workspace.findFirst({
    where: { id, userId },
    select: listSelect,
  });
}

export async function listWorkspacesForUser(
  userId: string
): Promise<WorkspaceListRow[]> {
  return prisma.workspace.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: listSelect,
  });
}

export async function renameWorkspace(
  id: string,
  userId: string,
  name: string
): Promise<WorkspaceListRow | null> {
  const row = await prisma.workspace.updateMany({
    where: { id, userId },
    data: { name },
  });
  if (row.count === 0) return null;
  return prisma.workspace.findFirst({
    where: { id, userId },
    select: listSelect,
  });
}

export async function deleteWorkspace(
  id: string,
  userId: string
): Promise<boolean> {
  const r = await prisma.workspace.deleteMany({ where: { id, userId } });
  return r.count > 0;
}
