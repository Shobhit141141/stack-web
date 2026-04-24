export type StackMetaPayload = {
  sources?: Array<{ fileId: string; fileName: string }>;
  clientAction?: {
    type:
      | "openUrl"
      | "copyText"
      | "downloadFile"
      | "fileWorkspaceChanged"
      | "fileRenamed";
    url?: string;
    text?: string;
    fileId?: string;
    fileName?: string;
    /** workspace before move (null = unassigned) */
    previousWorkspaceId?: string | null;
    /** workspace after move (null = unassigned) */
    workspaceId?: string | null;
    /** new display name after rename */
    name?: string;
    previousName?: string;
  };
};

// appends a machine-readable block the voice UI strips before display; model should not read it aloud (see vapi session hint).
export function appendStackMeta(plain: string, payload: StackMetaPayload): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${plain}\n\n<<<STACK_META>>>\n${b64}\n<<<END_STACK_META>>>`;
}

export function appendStackMetaIfNeeded(
  plain: string,
  payload: StackMetaPayload
): string {
  if (
    (!payload.sources || payload.sources.length === 0) &&
    !payload.clientAction
  ) {
    return plain;
  }
  return appendStackMeta(plain, payload);
}
