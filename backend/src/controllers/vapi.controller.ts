import type { NextFunction, Request, Response } from "express";
import * as askService from "../services/ask.service.js";
import {
  hasEmbeddingApiKey,
  hasRagCompletionConfigured,
} from "../config/env.js";
import { log } from "../utils/logger/index.js";

/**
 * Vapi webhook — server URL for tools. Forwards the user query to the RAG pipeline.
 *
 * Payload shapes:
 * - message.type "tool-calls" (current): toolCalls[] or toolCallList[], names askFiles | apiCalls
 * - message.type "function-call" (legacy): functionCall.name askFiles, parameters.query
 *
 * tool-calls response per Vapi docs:
 * { results: [{ name, toolCallId, result: "<string>" }] }
 */
const RAG_TOOL_NAMES = new Set(["askfiles", "apicalls"]);

// serializes webhook body for logs; caps length to keep output readable
function vapiWebhookBodySummary(body: unknown): string {
  try {
    const s = JSON.stringify(body);
    const max = 4000;
    return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
  } catch {
    return "[body not serializable]";
  }
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

type NormalizedToolCall = { toolCallId: string; name: string; query: string };

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
      const name =
        fn && typeof fn.name === "string" ? fn.name : "";
      const query = fn ? parseQueryFromArguments(fn.arguments) : "";
      if (toolCallId && name && query) {
        out.push({ toolCallId, name, query });
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
        const query = parseQueryFromArguments(fn.arguments);
        if (toolCallId && fn.name && query) {
          out.push({ toolCallId, name: fn.name, query });
        }
        continue;
      }
      const name = typeof o.name === "string" ? o.name : "";
      const query = parseQueryFromArguments(
        o.parameters ?? o.arguments
      );
      if (toolCallId && name && query) {
        out.push({ toolCallId, name, query });
      }
    }
  }

  return out;
}

type VapiRagContext = { userId: string | null; workspaceId?: string };

// reads userId + optional workspaceId from vapi.start assistantOverrides.metadata (and call/chat if present)
function extractVapiRagContext(
  body: Record<string, unknown>,
  msg: Record<string, unknown> | undefined
): VapiRagContext {
  const readMeta = (
    meta: unknown
  ): { userId: string | null; workspaceId?: string } => {
    if (!meta || typeof meta !== "object") {
      return { userId: null };
    }
    const o = meta as Record<string, unknown>;
    const userId =
      typeof o.userId === "string" && o.userId.length > 0 ? o.userId : null;
    const workspaceId =
      typeof o.workspaceId === "string" && o.workspaceId.length > 0
        ? o.workspaceId
        : undefined;
    return { userId, workspaceId };
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
  for (const s of sources) {
    const r = readMeta(s);
    if (!userId && r.userId) userId = r.userId;
    if (!workspaceId && r.workspaceId) workspaceId = r.workspaceId;
    if (userId && workspaceId) break;
  }
  return { userId, workspaceId };
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

    const { userId, workspaceId } = extractVapiRagContext(body ?? {}, msg);

    // --- tool-calls (OpenAI-style tools / server URL) ---
    if (msg.type === "tool-calls") {
      const tools = collectNormalizedToolCalls(msg);
      const match = tools.find((t) =>
        RAG_TOOL_NAMES.has(t.name.toLowerCase())
      );

      if (!match) {
        const names = tools.map((t) => t.name).join(", ") || "none";
        log.info(
          `vapi webhook: tool-calls — no askFiles/apiCalls tool (got: ${names})`
        );
        res.json({});
        return;
      }

      if (!match.query) {
        log.info("vapi webhook: tool-calls — empty query");
        res.json({
          results: [
            {
              name: match.name,
              toolCallId: match.toolCallId,
              result: "Please ask a question.",
            },
          ],
        });
        return;
      }

      if (!userId) {
        log.info(
          "vapi webhook: tool-calls — no userId (expected assistant/call metadata from client)"
        );
        res.json({
          results: [
            {
              name: match.name,
              toolCallId: match.toolCallId,
              result:
                "Authentication required. Please sign in first.",
            },
          ],
        });
        return;
      }

      if (!hasEmbeddingApiKey() || !hasRagCompletionConfigured()) {
        log.info(
          "vapi webhook: tool-calls — embedding or RAG completion not configured"
        );
        res.json({
          results: [
            {
              name: match.name,
              toolCallId: match.toolCallId,
              result: "Search is not configured on this server.",
            },
          ],
        });
        return;
      }

      log.info(
        `Vapi tool-calls — userId=${userId}${workspaceId ? ` workspaceId=${workspaceId}` : ""} tool=${match.name} query="${match.query.slice(0, 80)}"`
      );

      const result = await askService.askUserFiles({
        userId,
        query: match.query,
        ...(workspaceId ? { workspaceId } : {}),
      });

      const answer =
        result.answer || "I couldn't find an answer in your files.";
      const sources = result.sources
        .map((s) => s.fileName)
        .filter(Boolean)
        .slice(0, 3);

      const text = sources.length
        ? `${answer}\n\nSources: ${sources.join(", ")}`
        : answer;

      log.info(
        `vapi webhook: askUserFiles ok — answerLen=${text.length} sourceFiles=${sources.length} preview="${text.slice(0, 120).replace(/\n/g, " ")}"`
      );

      res.json({
        results: [
          {
            name: match.name,
            toolCallId: match.toolCallId,
            result: text,
          },
        ],
      });
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
