import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

const conversationSelect = {
  id: true,
  userId: true,
  workspaceId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

const messageSelect = {
  id: true,
  conversationId: true,
  role: true,
  content: true,
  sources: true,
  createdAt: true,
} as const;

export type ConversationRow = {
  id: string;
  userId: string;
  workspaceId: string | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessageRow = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  sources: unknown;
  createdAt: Date;
};

export async function findLatestConversationForWorkspace(params: {
  userId: string;
  workspaceId: string | null;
}): Promise<ConversationRow | null> {
  return prisma.conversation.findFirst({
    where: { userId: params.userId, workspaceId: params.workspaceId },
    orderBy: { updatedAt: "desc" },
    select: conversationSelect,
  });
}

export async function createConversation(params: {
  userId: string;
  workspaceId: string | null;
  title?: string;
}): Promise<ConversationRow> {
  return prisma.conversation.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      title: params.title ?? "",
    },
    select: conversationSelect,
  });
}

export async function findConversationByIdForUser(
  id: string,
  userId: string
): Promise<ConversationRow | null> {
  return prisma.conversation.findFirst({
    where: { id, userId },
    select: conversationSelect,
  });
}

export async function touchConversationUpdatedAt(id: string): Promise<void> {
  await prisma.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
    select: { id: true },
  });
}

export async function listMessagesForConversation(params: {
  conversationId: string;
  limit: number;
}): Promise<ChatMessageRow[]> {
  return prisma.chatMessage.findMany({
    where: { conversationId: params.conversationId },
    orderBy: { createdAt: "asc" },
    take: params.limit,
    select: messageSelect,
  });
}

export async function listRecentMessagesForConversation(params: {
  conversationId: string;
  limit: number;
}): Promise<ChatMessageRow[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId: params.conversationId },
    orderBy: { createdAt: "desc" },
    take: params.limit,
    select: messageSelect,
  });
  return rows.slice().reverse();
}

export async function createMessage(params: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sources?: Prisma.InputJsonValue;
}): Promise<ChatMessageRow> {
  return prisma.chatMessage.create({
    data: {
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      ...(params.sources !== undefined ? { sources: params.sources } : {}),
    },
    select: messageSelect,
  });
}
