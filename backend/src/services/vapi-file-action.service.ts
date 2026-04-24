import * as fileRepository from "../repositories/file.repository.js";
import * as workspaceRepository from "../repositories/workspace.repository.js";
import * as fileService from "./file.service.js";
import type { StackMetaPayload } from "../utils/vapi-stack-meta.js";
import { isUuid } from "../utils/uuid.js";

// resolves file by uuid or name hint for vapi stackFileAction tool.
export async function handleStackFileAction(params: {
  userId: string;
  accessToken: string | null;
  args: Record<string, unknown>;
}): Promise<{ result: string; meta: StackMetaPayload }> {
  const action = String(params.args.action ?? "").toLowerCase().trim();
  if (!["download", "copy", "delete", "move", "rename"].includes(action)) {
    return {
      result:
        "Unknown action. Use download, copy, delete, move, or rename.",
      meta: {},
    };
  }

  const rawId = params.args.fileId;
  const fileId =
    typeof rawId === "string" && isUuid(rawId) ? rawId : undefined;
  const fileName =
    typeof params.args.fileName === "string"
      ? params.args.fileName.trim()
      : "";

  let resolved: {
    id: string;
    originalName: string;
    workspaceId: string | null;
  } | null = null;

  if (fileId) {
    const row = await fileRepository.findFileByIdForUser(
      fileId,
      params.userId
    );
    if (row)
      resolved = {
        id: row.id,
        originalName: row.originalName,
        workspaceId: row.workspaceId ?? null,
      };
  }

  if (!resolved && fileName) {
    const rows = await fileRepository.findFilesByNameHintForUser(
      params.userId,
      fileName
    );
    if (rows.length === 0) {
      return {
        result: `No file matched "${fileName}".`,
        meta: {},
      };
    }
    if (rows.length > 1) {
      const names = rows.map((r) => r.originalName).join(", ");
      return {
        result: `Multiple files match. Be specific: ${names}`,
        meta: {},
      };
    }
    resolved = {
      id: rows[0]!.id,
      originalName: rows[0]!.originalName,
      workspaceId: rows[0]!.workspaceId ?? null,
    };
  }

  if (!resolved) {
    return {
      result:
        "Say which file using its name, or pick from the files shown on screen.",
      meta: {},
    };
  }

  if (action === "download") {
    if (!params.accessToken) {
      return {
        result:
          "Sign in and start voice from the app so downloads can be authorized.",
        meta: {},
      };
    }
    return {
      result: `Downloading ${resolved.originalName}.`,
      meta: {
        clientAction: {
          type: "downloadFile",
          fileId: resolved.id,
          fileName: resolved.originalName,
        },
      },
    };
  }

  if (action === "copy") {
    if (!params.accessToken) {
      return {
        result:
          "Sign in and start voice from the app so link copy can be authorized.",
        meta: {},
      };
    }
    const out = await fileService.getUserFileWithSignedUrl({
      accessToken: params.accessToken,
      userId: params.userId,
      fileId: resolved.id,
    });
    return {
      result: `Copied link for ${resolved.originalName}.`,
      meta: {
        clientAction: {
          type: "copyText",
          text: out.signedUrl,
          fileName: resolved.originalName,
        },
      },
    };
  }

  if (action === "delete") {
    if (!params.accessToken) {
      return {
        result:
          "Sign in and start voice from the app so deletion can be authorized.",
        meta: {},
      };
    }
    await fileService.deleteUserFile({
      accessToken: params.accessToken,
      userId: params.userId,
      fileId: resolved.id,
    });
    return {
      result: `Deleted ${resolved.originalName}.`,
      meta: {},
    };
  }

  if (action === "rename") {
    const rawNew =
      params.args.newName ?? params.args.name ?? params.args.newFileName;
    const newName =
      typeof rawNew === "string" ? rawNew.trim() : "";
    if (!newName) {
      return {
        result: "Say the new file name, or pass newName in the tool arguments.",
        meta: {},
      };
    }
    try {
      const updated = await fileService.renameUserFile({
        userId: params.userId,
        fileId: resolved.id,
        name: newName,
      });
      return {
        result: `Renamed to ${updated.name}.`,
        meta: {
          clientAction: {
            type: "fileRenamed",
            fileId: resolved.id,
            name: updated.name,
            previousName: resolved.originalName,
          },
        },
      };
    } catch {
      return {
        result: "Could not rename that file.",
        meta: {},
      };
    }
  }

  // move
  const wsRaw = params.args.workspaceId;
  const wsNameRaw = params.args.workspaceName;
  let targetWid: string | null | undefined;

  if (wsRaw === null) {
    targetWid = null;
  } else if (typeof wsRaw === "string" && isUuid(wsRaw)) {
    targetWid = wsRaw;
  } else if (typeof wsNameRaw === "string" && wsNameRaw.trim()) {
    const wname = wsNameRaw.trim();
    const list = await workspaceRepository.listWorkspacesForUser(
      params.userId
    );
    const exact = list.find(
      (w) => w.name.toLowerCase() === wname.toLowerCase()
    );
    const partial = list.filter((w) =>
      w.name.toLowerCase().includes(wname.toLowerCase())
    );
    if (exact) targetWid = exact.id;
    else if (partial.length === 1) targetWid = partial[0]!.id;
    else if (partial.length > 1) {
      return {
        result: `Several workspaces match "${wname}". Say the full workspace name.`,
        meta: {},
      };
    } else {
      return {
        result: `No workspace named "${wname}".`,
        meta: {},
      };
    }
  }

  if (targetWid === undefined) {
    return {
      result:
        "Say which workspace to move to (workspace name), or say unassigned with workspaceId null in tool args.",
      meta: {},
    };
  }

  if (targetWid !== null) {
    const ws = await workspaceRepository.findWorkspaceByIdForUser(
      targetWid,
      params.userId
    );
    if (!ws) {
      return { result: "That workspace was not found.", meta: {} };
    }
  }

  const previousWorkspaceId = resolved.workspaceId;

  await fileService.assignUserFileWorkspace({
    userId: params.userId,
    fileId: resolved.id,
    workspaceId: targetWid,
  });

  const moveMeta = {
    clientAction: {
      type: "fileWorkspaceChanged" as const,
      fileId: resolved.id,
      fileName: resolved.originalName,
      previousWorkspaceId,
      workspaceId: targetWid,
    },
  };

  if (targetWid === null) {
    return {
      result: `Moved ${resolved.originalName} out of any workspace (unassigned).`,
      meta: moveMeta,
    };
  }
  const ws = await workspaceRepository.findWorkspaceByIdForUser(
    targetWid,
    params.userId
  );
  const label = ws?.name ?? "workspace";
  return {
    result: `Moved ${resolved.originalName} to ${label}.`,
    meta: moveMeta,
  };
}
