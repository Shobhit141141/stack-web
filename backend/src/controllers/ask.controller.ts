import type { NextFunction, Request, Response } from "express";
import {
  hasEmbeddingApiKey,
  hasRagCompletionConfigured,
} from "../config/env.js";
import * as activityService from "../services/activity.service.js";
import * as askService from "../services/ask.service.js";
import { isUuid } from "../utils/uuid.js";

// strips server-side ask preamble so activity timeline shows the user question
function chatQueryForActivityLog(bodyQuery: string): string {
  const marker = "\n\nQuestion:\n";
  const i = bodyQuery.lastIndexOf(marker);
  if (i >= 0) {
    const tail = bodyQuery.slice(i + marker.length).trim();
    if (tail) return tail;
  }
  return bodyQuery;
}

export async function postAsk(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const body = req.body as {
      query?: unknown;
      displayQuery?: unknown;
      fileIds?: unknown;
      workspaceId?: unknown;
      conversationId?: unknown;
    };
    if (typeof body.query !== "string") {
      res.status(400).json({ error: "query must be a string" });
      return;
    }
    const query = body.query.trim();
    if (!query) {
      res.status(400).json({ error: "query must not be empty" });
      return;
    }

    let fileIds: string[] | undefined;
    if (body.fileIds !== undefined) {
      if (!Array.isArray(body.fileIds)) {
        res.status(400).json({ error: "fileIds must be an array of strings when provided" });
        return;
      }
      const ids = body.fileIds.filter((x): x is string => typeof x === "string");
      if (ids.length !== body.fileIds.length) {
        res.status(400).json({ error: "fileIds must contain only strings" });
        return;
      }
      fileIds = ids;
    }

    let workspaceId: string | undefined;
    if (body.workspaceId !== undefined) {
      if (typeof body.workspaceId !== "string" || !isUuid(body.workspaceId)) {
        res
          .status(400)
          .json({ error: "workspaceId must be a uuid string when provided" });
        return;
      }
      workspaceId = body.workspaceId;
    }

    let conversationId: string | undefined;
    if (body.conversationId !== undefined) {
      if (typeof body.conversationId !== "string" || !isUuid(body.conversationId)) {
        res
          .status(400)
          .json({ error: "conversationId must be a uuid string when provided" });
        return;
      }
      conversationId = body.conversationId;
    }

    if (!hasEmbeddingApiKey()) {
      res.status(503).json({ error: "Search embeddings are not configured" });
      return;
    }
    if (!hasRagCompletionConfigured()) {
      res.status(503).json({
        error:
          "RAG answer model is not configured. Set OPENAI_API_KEY for OpenAI (default), or RAG_COMPLETION_PROVIDER=google and GEMINI_API_KEY.",
      });
      return;
    }

    activityService.logActivity({
      userId,
      type: "chat",
      metadata: {
        query: chatQueryForActivityLog(query),
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    const displayQuery =
      typeof body.displayQuery === "string" ? body.displayQuery.trim() : undefined;

    const result = await askService.askUserFiles({
      userId,
      query,
      displayQuery,
      fileIds,
      workspaceId,
      conversationId,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof askService.InvalidFileIdsError) {
      res.status(400).json({
        error: "One or more file IDs are invalid or not owned by you",
      });
      return;
    }
    if (e instanceof askService.InvalidWorkspaceError) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    if (e instanceof askService.InvalidConversationError) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    next(e);
  }
}

export async function postQuizSubmit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const body = req.body as {
      conversationId?: unknown;
      quizMessageId?: unknown;
      answers?: unknown;
    };
    if (
      typeof body.conversationId !== "string" ||
      !isUuid(body.conversationId)
    ) {
      res
        .status(400)
        .json({ error: "conversationId must be a uuid string" });
      return;
    }
    if (typeof body.quizMessageId !== "string" || !isUuid(body.quizMessageId)) {
      res.status(400).json({ error: "quizMessageId must be a uuid string" });
      return;
    }
    if (!Array.isArray(body.answers)) {
      res.status(400).json({ error: "answers must be an array" });
      return;
    }
    const answers = body.answers
      .filter(
        (
          item
        ): item is { questionId: string; selectedOptionId: string } =>
          !!item &&
          typeof item === "object" &&
          typeof (item as { questionId?: unknown }).questionId === "string" &&
          typeof (item as { selectedOptionId?: unknown }).selectedOptionId ===
            "string"
      )
      .map((a) => ({
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId,
      }));
    if (answers.length === 0) {
      res
        .status(400)
        .json({ error: "answers must include at least one selection" });
      return;
    }

    const result = await askService.submitQuizAnswers({
      userId,
      conversationId: body.conversationId,
      quizMessageId: body.quizMessageId,
      answers,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof askService.InvalidConversationError) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    if (e instanceof askService.InvalidQuizMessageError) {
      res.status(404).json({ error: "Quiz message not found" });
      return;
    }
    next(e);
  }
}
