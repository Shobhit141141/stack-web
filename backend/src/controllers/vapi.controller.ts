import type { NextFunction, Request, Response } from "express";
import * as askService from "../services/ask.service.js";
import { handleStackFileAction } from "../services/vapi-file-action.service.js";
import {
  hasEmbeddingApiKey,
  hasRagCompletionConfigured,
  ragCompletionModelForVoice,
} from "../config/env.js";
import { log } from "../utils/logger/index.js";
import { appendStackMetaIfNeeded } from "../utils/vapi-stack-meta.js";
import { logVapiDebug } from "../utils/debug-log.util.js";

/**
 * Vapi webhook — server URL for tools. RAG (askFiles / apiCalls), file actions (stackFileAction).
 *
 * Add a server tool in the Vapi assistant (same webhook URL): name `stackFileAction`, e.g.
 * parameters: { type: "object", properties: {
 *   action: { type: "string", enum: ["download","copy","delete","move","rename"] },
 *   fileId: { type: "string" }, fileName: { type: "string" },
 *   workspaceId: { type: "string" }, workspaceName: { type: "string" }
 * }, required: ["action"] }
 * Client must send `accessToken` (Supabase JWT) in call metadata for download/delete (storage).
 *
 * Payload shapes:
 * - message.type "tool-calls" (current): toolCalls[] or toolCallList[]
 * - message.type "function-call" (legacy): functionCall.name askFiles, parameters.query
 *
 * tool-calls response per Vapi docs:
 * { results: [{ name, toolCallId, result: "<string>" }] }
 */
const RAG_TOOL_NAMES = new Set(["askfiles", "apicalls"]);
const FILE_ACTION_TOOL_NAMES = new Set(["stackfileaction"]);

// serializes webhook body for logs with pretty formatting; caps length to keep output readable
function vapiWebhookBodySummary(body: unknown): string {
  try {
    const s = JSON.stringify(body, null, 2);
    const max = 12_000;
    return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
  } catch {
    return "[body not serializable]";
  }
}

function logVapiAnswer(toolName: string, answer: string): void {
  log.info(
    [
      `vapi webhook: answer (${toolName})`,
      "──────────────────────────────────────────────────────────────",
      answer || "(empty)",
      "──────────────────────────────────────────────────────────────",
    ].join("\n")
  );
}

function vapiPromptFromBody(
  body: Record<string, unknown> | undefined
): string | undefined {
  const artifact = body?.message && typeof body.message === "object"
    ? (body.message as Record<string, unknown>).artifact
    : undefined;
  if (!artifact || typeof artifact !== "object") return undefined;
  const openAiMessages = (artifact as Record<string, unknown>)
    .messagesOpenAIFormatted;
  if (!Array.isArray(openAiMessages)) return undefined;
  const sys = openAiMessages.find(
    (m) =>
      m &&
      typeof m === "object" &&
      (m as Record<string, unknown>).role === "system"
  ) as Record<string, unknown> | undefined;
  return typeof sys?.content === "string" ? sys.content : undefined;
}

function vapiQuestionFromBody(
  body: Record<string, unknown> | undefined
): string | undefined {
  const artifact = body?.message && typeof body.message === "object"
    ? (body.message as Record<string, unknown>).artifact
    : undefined;
  if (!artifact || typeof artifact !== "object") return undefined;
  const messages = (artifact as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    if (o.role !== "user") continue;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
  }
  return undefined;
}

// pulls query from OpenAI-style arguments (object or json string)
function parseQueryFromArguments(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    try {
      return parseQueryFromArguments(JSON.parse(raw) as unknown);
    } catch {
      return "";
    }
  }
  if (typeof raw === "object" && raw !== null && "query" in raw) {
    const q = (raw as Record<string, unknown>).query;
    return typeof q === "string" ? q.trim() : "";
  }
  return "";
}

function parseFunctionArguments(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return parseFunctionArguments(JSON.parse(raw) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

type NormalizedToolCall = {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
};

// prefers OpenAI-style toolCalls[], else flat toolCallList[]
function collectNormalizedToolCalls(
  msg: Record<string, unknown>
): NormalizedToolCall[] {
  const out: NormalizedToolCall[] = [];

  const toolCalls = msg.toolCalls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    for (const t of toolCalls) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      const toolCallId = typeof o.id === "string" ? o.id : "";
      const fn = o.function as Record<string, unknown> | undefined;
      const name = fn && typeof fn.name === "string" ? fn.name : "";
      const args = fn ? parseFunctionArguments(fn.arguments) : {};
      if (toolCallId && name) {
        out.push({ toolCallId, name, args });
      }
    }
    return out;
  }

  const toolCallList = msg.toolCallList;
  if (Array.isArray(toolCallList)) {
    for (const t of toolCallList) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      const toolCallId = typeof o.id === "string" ? o.id : "";
      const fn = o.function as Record<string, unknown> | undefined;
      if (fn && typeof fn.name === "string") {
        const args = parseFunctionArguments(fn.arguments);
        if (toolCallId && fn.name) {
          out.push({ toolCallId, name: fn.name, args });
        }
        continue;
      }
      const name = typeof o.name === "string" ? o.name : "";
      const args = parseFunctionArguments(o.parameters ?? o.arguments);
      if (toolCallId && name) {
        out.push({ toolCallId, name, args });
      }
    }
  }

  return out;
}

type VapiRagContext = {
  userId: string | null;
  workspaceId?: string;
  accessToken: string | null;
};

// reads userId, optional workspaceId, optional accessToken (for storage-backed file actions) from call metadata
function extractVapiRagContext(
  body: Record<string, unknown>,
  msg: Record<string, unknown> | undefined
): VapiRagContext {
  const readMeta = (
    meta: unknown
  ): {
    userId: string | null;
    workspaceId?: string;
    accessToken: string | null;
  } => {
    if (!meta || typeof meta !== "object") {
      return { userId: null, accessToken: null };
    }
    const o = meta as Record<string, unknown>;
    const userId =
      typeof o.userId === "string" && o.userId.length > 0 ? o.userId : null;
    const workspaceId =
      typeof o.workspaceId === "string" && o.workspaceId.length > 0
        ? o.workspaceId
        : undefined;
    const accessToken =
      typeof o.accessToken === "string" && o.accessToken.length > 0
        ? o.accessToken
        : null;
    return { userId, workspaceId, accessToken };
  };

  const sources: unknown[] = [];
  if (msg) {
    sources.push(
      (msg.call as Record<string, unknown> | undefined)?.metadata,
      (msg.chat as Record<string, unknown> | undefined)?.metadata,
      (msg.assistant as Record<string, unknown> | undefined)?.metadata,
      (msg.customer as Record<string, unknown> | undefined)?.metadata
    );
  }
  sources.push(
    (body.call as Record<string, unknown> | undefined)?.metadata,
    body.metadata
  );

  let userId: string | null = null;
  let workspaceId: string | undefined;
  let accessToken: string | null = null;
  for (const s of sources) {
    const r = readMeta(s);
    if (!userId && r.userId) userId = r.userId;
    if (!workspaceId && r.workspaceId) workspaceId = r.workspaceId;
    if (!accessToken && r.accessToken) accessToken = r.accessToken;
  }
  return { userId, workspaceId, accessToken };
}

export async function vapiWebhook(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    log.info(`vapi webhook: request body ${vapiWebhookBodySummary(req.body)}`);

    const body = req.body as Record<string, unknown> | undefined;
    const msg = body?.message as Record<string, unknown> | undefined;

    if (!msg || typeof msg.type !== "string") {
      log.info(
        `vapi webhook: ignored — missing message or message.type (${msg?.type ?? "none"})`
      );
      res.json({});
      return;
    }

    const { userId, workspaceId, accessToken } = extractVapiRagContext(
      body ?? {},
      msg
    );
    log.info(
      `vapi webhook: metadata resolved userId=${userId ?? "(none)"} workspaceId=${workspaceId ?? "(none)"} accessToken=${accessToken ? "present" : "missing"}`
    );

    // --- tool-calls (OpenAI-style tools / server URL) ---
    if (msg.type === "tool-calls") {
      const tools = collectNormalizedToolCalls(msg);
      if (tools.length === 0) {
        log.info("vapi webhook: tool-calls — empty tool list");
        res.json({});
        return;
      }

      const results: { name: string; toolCallId: string; result: string }[] =
        [];

      for (const t of tools) {
        const ln = t.name.toLowerCase();

        if (FILE_ACTION_TOOL_NAMES.has(ln)) {
          if (!userId) {
            results.push({
              name: t.name,
              toolCallId: t.toolCallId,
              result:
                "Authentication required. Please sign in and start voice from the app.",
            });
            continue;
          }
          try {
            const out = await handleStackFileAction({
              userId,
              accessToken,
              args: t.args,
            });
            results.push({
              name: t.name,
              toolCallId: t.toolCallId,
              result: appendStackMetaIfNeeded(out.result, out.meta),
            });
          } catch (err) {
            log.error(
              `vapi stackFileAction: ${err instanceof Error ? err.message : err}`
            );
            results.push({
              name: t.name,
              toolCallId: t.toolCallId,
              result: "That file action could not be completed.",
            });
          }
          continue;
        }

        if (RAG_TOOL_NAMES.has(ln)) {
          const query =
            String(t.args.query ?? "").trim() ||
            parseQueryFromArguments(t.args as unknown);

          if (!query) {
            results.push({
              name: t.name,
              toolCallId: t.toolCallId,
              result: "Please ask a question.",
            });
            continue;
          }

          if (!userId) {
            results.push({
              name: t.name,
              toolCallId: t.toolCallId,
              result:
                "Authentication required. Please sign in first.",
            });
            continue;
          }

          if (!hasEmbeddingApiKey() || !hasRagCompletionConfigured()) {
            results.push({
              name: t.name,
              toolCallId: t.toolCallId,
              result: "Search is not configured on this server.",
            });
            continue;
          }

          log.info(
            `Vapi tool-calls — userId=${userId}${workspaceId ? ` workspaceId=${workspaceId}` : ""} tool=${t.name} query="${query.slice(0, 80)}"`
          );

          const ragResult = await askService.askUserFiles({
            userId,
            query,
            ragCompletionModel: ragCompletionModelForVoice(),
            ...(workspaceId ? { workspaceId } : {}),
          });

          const answer =
            ragResult.answer || "I couldn't find an answer in your files.";
          const sourceNames = ragResult.sources
            .map((s) => s.fileName)
            .filter(Boolean)
            .slice(0, 3);

          let text = sourceNames.length
            ? `${answer}\n\nSources: ${sourceNames.join(", ")}`
            : answer;

          // dedupe by fileId — rag returns one source per chunk, UI wants one per file
          const seenSourceIds = new Set<string>();
          const dedupedSources: Array<{
            fileId: string;
            fileName: string;
            workspaceId: string | null;
          }> = [];
          for (const s of ragResult.sources) {
            if (seenSourceIds.has(s.fileId)) continue;
            seenSourceIds.add(s.fileId);
            dedupedSources.push({
              fileId: s.fileId,
              fileName: s.fileName,
              workspaceId: s.workspaceId ?? null,
            });
          }
          text = appendStackMetaIfNeeded(text, { sources: dedupedSources });

          log.info(
            `vapi webhook: askUserFiles ok — answerLen=${text.length} sourceFiles=${ragResult.sources.length}`
          );
          logVapiAnswer(t.name, text);
          logVapiDebug({
            userId,
            workspaceId,
            tool: t.name,
            question: vapiQuestionFromBody(body),
            prompt: vapiPromptFromBody(body),
            response: text,
          });

          results.push({
            name: t.name,
            toolCallId: t.toolCallId,
            result: text,
          });
          continue;
        }
      }

      if (results.length === 0) {
        const names = tools.map((x) => x.name).join(", ") || "none";
        log.info(
          `vapi webhook: tool-calls — no handled tools (got: ${names})`
        );
        res.json({});
        return;
      }

      res.json({ results });
      return;
    }

    // --- legacy function-call ---
    if (msg.type === "function-call") {
      const fnCall = msg.functionCall as
        | Record<string, unknown>
        | undefined;
      if (!fnCall || fnCall.name !== "askFiles") {
        log.info(
          `vapi webhook: unknown function — name=${fnCall && typeof fnCall.name === "string" ? fnCall.name : "missing"}`
        );
        res.json({ results: [{ result: "Unknown function" }] });
        return;
      }

      const query = parseQueryFromArguments(fnCall.parameters);

      if (!query) {
        log.info("vapi webhook: rejected — empty query");
        res.json({ results: [{ result: "Please ask a question." }] });
        return;
      }

      if (!userId) {
        log.info("vapi webhook: rejected — no userId in call metadata");
        res.json({
          results: [
            { result: "Authentication required. Please sign in first." },
          ],
        });
        return;
      }

      if (!hasEmbeddingApiKey() || !hasRagCompletionConfigured()) {
        log.info(
          "vapi webhook: rejected — embedding or RAG completion not configured"
        );
        res.json({
          results: [{ result: "Search is not configured on this server." }],
        });
        return;
      }

      log.info(
        `Vapi askFiles — userId=${userId}${workspaceId ? ` workspaceId=${workspaceId}` : ""} query="${query.slice(0, 80)}"`
      );

      const result = await askService.askUserFiles({
        userId,
        query,
        ragCompletionModel: ragCompletionModelForVoice(),
        ...(workspaceId ? { workspaceId } : {}),
      });

      const answer =
        result.answer || "I couldn't find an answer in your files.";
      const sources = result.sources
        .map((s) => s.fileName)
        .filter(Boolean)
        .slice(0, 3);

      const response = sources.length
        ? `${answer}\n\nSources: ${sources.join(", ")}`
        : answer;

      log.info(
        `vapi webhook: askUserFiles ok — answerLen=${response.length} sourceFiles=${sources.length} preview="${response.slice(0, 120).replace(/\n/g, " ")}"`
      );
      logVapiAnswer("askFiles", response);
      logVapiDebug({
        userId,
        workspaceId,
        tool: "askFiles",
        question: vapiQuestionFromBody(body),
        prompt: vapiPromptFromBody(body),
        response,
      });

      res.json({ results: [{ result: response }] });
      return;
    }

    log.info(
      `vapi webhook: ignored — message.type=${msg.type} (not tool-calls or function-call)`
    );
    res.json({});
  } catch (e) {
    log.error(`Vapi webhook error: ${e instanceof Error ? e.message : e}`);
    log.info(
      `vapi webhook: exception — returning generic error response to client`
    );
    res.json({
      results: [
        { result: "Sorry, something went wrong while searching your files." },
      ],
    });
  }
}
