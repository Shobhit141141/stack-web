import { HttpError } from "../utils/http-error.js";
import * as conversationRepository from "../repositories/conversation.repository.js";
import * as workspaceService from "./workspace.service.js";

const MESSAGE_LIST_LIMIT_MAX = 200;
const MESSAGE_LIST_LIMIT_DEFAULT = 100;

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: unknown;
  payload?: unknown;
  createdAt: string;
};

export type ConversationSnapshot = {
  conversationId: string;
  workspaceId: string | null;
  messages: ConversationMessage[];
};

function toMessage(
  row: conversationRepository.ChatMessageRow
): ConversationMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    ...(row.sources !== null ? { sources: row.sources } : {}),
    ...(row.payload !== null ? { payload: row.payload } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getOrCreateConversationForWorkspace(params: {
  userId: string;
  workspaceId: string;
  messageLimit?: number;
}): Promise<ConversationSnapshot> {
  await workspaceService.assertWorkspaceOwned(params.userId, params.workspaceId);
  const existing = await conversationRepository.findLatestConversationForWorkspace({
    userId: params.userId,
    workspaceId: params.workspaceId,
  });
  const row =
    existing ??
    (await conversationRepository.createConversation({
      userId: params.userId,
      workspaceId: params.workspaceId,
      title: "",
    }));

  const limit = Math.min(
    MESSAGE_LIST_LIMIT_MAX,
    Math.max(1, params.messageLimit ?? MESSAGE_LIST_LIMIT_DEFAULT)
  );
  const messages = await conversationRepository.listMessagesForConversation({
    conversationId: row.id,
    limit,
  });
  return {
    conversationId: row.id,
    workspaceId: row.workspaceId,
    messages: messages.map(toMessage),
  };
}

export async function getConversationMessages(params: {
  userId: string;
  conversationId: string;
  limit?: number;
}): Promise<ConversationSnapshot> {
  const c = await conversationRepository.findConversationByIdForUser(
    params.conversationId,
    params.userId
  );
  if (!c) throw new HttpError(404, "Conversation not found");
  const limit = Math.min(
    MESSAGE_LIST_LIMIT_MAX,
    Math.max(1, params.limit ?? MESSAGE_LIST_LIMIT_DEFAULT)
  );
  const messages = await conversationRepository.listMessagesForConversation({
    conversationId: c.id,
    limit,
  });
  return {
    conversationId: c.id,
    workspaceId: c.workspaceId,
    messages: messages.map(toMessage),
  };
}
