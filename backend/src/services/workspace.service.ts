import { HttpError } from "../utils/http-error.js";
import * as workspaceRepository from "../repositories/workspace.repository.js";

const NAME_MAX = 200;

function normalizeName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new HttpError(400, "name must not be empty");
  if (name.length > NAME_MAX) {
    throw new HttpError(400, `name must be at most ${NAME_MAX} characters`);
  }
  return name;
}

export async function listWorkspaces(userId: string) {
  const rows = await workspaceRepository.listWorkspacesForUser(userId);
  return {
    workspaces: rows.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
  };
}

export async function createWorkspace(userId: string, rawName: string) {
  const name = normalizeName(rawName);
  const row = await workspaceRepository.createWorkspace({ userId, name });
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function renameWorkspace(
  userId: string,
  workspaceId: string,
  rawName: string
) {
  const name = normalizeName(rawName);
  const row = await workspaceRepository.renameWorkspace(
    workspaceId,
    userId,
    name
  );
  if (!row) throw new HttpError(404, "Workspace not found");
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteWorkspace(userId: string, workspaceId: string) {
  const ok = await workspaceRepository.deleteWorkspace(workspaceId, userId);
  if (!ok) throw new HttpError(404, "Workspace not found");
}

// throws 404 if workspace is missing or not owned by user
export async function assertWorkspaceOwned(
  userId: string,
  workspaceId: string
): Promise<void> {
  const w = await workspaceRepository.findWorkspaceByIdForUser(
    workspaceId,
    userId
  );
  if (!w) throw new HttpError(404, "Workspace not found");
}
