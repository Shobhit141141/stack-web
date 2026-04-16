import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEBUG_LOG_MAX = 24_000;

function truncate(value: string): string {
  if (value.length <= DEBUG_LOG_MAX) return value;
  return `${value.slice(0, DEBUG_LOG_MAX)}\n… [truncated ${value.length - DEBUG_LOG_MAX} chars]`;
}

function serialize(value: unknown): string {
  if (value == null) return "(none)";
  if (typeof value === "string") return value.trim() || "(empty)";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function appendDebugLogFile(
  fileName: string,
  title: string,
  fields: Record<string, unknown>
): Promise<void> {
  const filePath = resolve(process.cwd(), "logs", fileName);
  await mkdir(dirname(filePath), { recursive: true });

  const stamp = new Date().toISOString();
  const lines: string[] = [
    "============================================================",
    `${title} @ ${stamp}`,
  ];
  for (const [key, value] of Object.entries(fields)) {
    const body = truncate(serialize(value));
    lines.push(`[${key}]`);
    lines.push(body);
  }
  lines.push("");
  await appendFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

export function logVapiDebug(fields: {
  userId?: string | null;
  workspaceId?: string;
  question?: string;
  prompt?: string;
  response?: string;
  tool?: string;
}): void {
  void appendDebugLogFile("vapi-debug.log", "VAPI TRACE", fields).catch(() => {});
}

export function logRagDebug(fields: {
  userId: string;
  workspaceId?: string;
  query: string;
  prompt?: string;
  response?: string;
  sources?: unknown;
  route: "ask" | "search";
}): void {
  void appendDebugLogFile("rag-debug.log", "RAG TRACE", fields).catch(() => {});
}

export function logSemanticSearchDebug(fields: {
  userId: string;
  workspaceId?: string;
  question: string;
  prompt?: string;
  response: string;
  sources?: unknown;
}): void {
  void appendDebugLogFile("semantic-search-debug.log", "SEMANTIC SEARCH TRACE", fields).catch(
    () => {}
  );
}
