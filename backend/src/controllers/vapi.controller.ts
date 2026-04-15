import type { NextFunction, Request, Response } from "express";
import * as askService from "../services/ask.service.js";
import {
  hasEmbeddingApiKey,
  hasRagCompletionConfigured,
} from "../config/env.js";
import { log } from "../utils/logger/index.js";

/**
 * Vapi webhook — receives function-call requests from Vapi assistants,
 * forwards the user query to the existing RAG `/ask` pipeline,
 * and returns the answer in Vapi's expected format.
 *
 * Vapi sends:
 * {
 *   message: {
 *     type: "function-call",
 *     functionCall: { name: "askFiles", parameters: { query: "..." } }
 *   }
 * }
 *
 * We respond:
 * { results: [{ result: "answer text" }] }
 */
export async function vapiWebhook(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const msg = req.body?.message;

    // Vapi sends different message types; we only handle function-call
    if (!msg || msg.type !== "function-call") {
      res.json({});
      return;
    }

    const fnCall = msg.functionCall;
    if (!fnCall || fnCall.name !== "askFiles") {
      res.json({ results: [{ result: "Unknown function" }] });
      return;
    }

    const query =
      typeof fnCall.parameters?.query === "string"
        ? fnCall.parameters.query.trim()
        : "";
    if (!query) {
      res.json({ results: [{ result: "Please ask a question." }] });
      return;
    }

    // userId comes from the call metadata (set when starting the call)
    const userId =
      typeof msg.call?.metadata?.userId === "string"
        ? msg.call.metadata.userId
        : null;

    if (!userId) {
      res.json({
        results: [
          { result: "Authentication required. Please sign in first." },
        ],
      });
      return;
    }

    if (!hasEmbeddingApiKey() || !hasRagCompletionConfigured()) {
      res.json({
        results: [{ result: "Search is not configured on this server." }],
      });
      return;
    }

    log.info(`Vapi askFiles — userId=${userId} query="${query.slice(0, 80)}"`);

    const result = await askService.askUserFiles({ userId, query });

    const answer = result.answer || "I couldn't find an answer in your files.";
    const sources = result.sources
      .map((s) => s.fileName)
      .filter(Boolean)
      .slice(0, 3);

    const response = sources.length
      ? `${answer}\n\nSources: ${sources.join(", ")}`
      : answer;

    res.json({ results: [{ result: response }] });
  } catch (e) {
    log.error(`Vapi webhook error: ${e instanceof Error ? e.message : e}`);
    res.json({
      results: [
        { result: "Sorry, something went wrong while searching your files." },
      ],
    });
  }
}
