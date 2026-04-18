import { performance } from "node:perf_hooks";
import { env, ragCompletionModelDefault } from "../config/env.js";
import {
  buildAskSystemInstruction,
  buildAskUserMessage,
  buildGeneralKnowledgeSystemInstruction,
  buildGeneralKnowledgeUserMessage,
} from "../rag/prompt.js";
import * as embeddingService from "./embedding.service.js";
import * as ragCompletionService from "./rag-completion.service.js";
import * as fileRepository from "../repositories/file.repository.js";
import * as searchRepository from "../repositories/search.repository.js";
import * as workspaceRepository from "../repositories/workspace.repository.js";
import * as conversationRepository from "../repositories/conversation.repository.js";
import { askApiPanel } from "../utils/ask-log.util.js";
import { log } from "../utils/logger/index.js";
import { logRagDebug } from "../utils/debug-log.util.js";

export type AskSource = {
  fileId: string;
  fileName: string;
  snippet: string;
};

export type AskResult = {
  answer: string;
  sources: AskSource[];
};

type ChunkHit = searchRepository.ChunkSearchRow & { score: number };

const SNIPPET_MAX_CHARS = 400;
const HISTORY_TURNS_MAX = 12;
const HISTORY_MESSAGE_MAX_CHARS = 400;

// cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite
// score = 1 - distance = cosine similarity (0-1)
function distanceToScore(distance: number): number {
  return Math.max(0, 1 - distance);
}

function truncateSnippet(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= SNIPPET_MAX_CHARS) return t;
  return `${t.slice(0, SNIPPET_MAX_CHARS)}…`;
}

function trimContextToMax(context: string, max: number): string {
  if (context.length <= max) return context;
  return `${context.slice(0, max)}…`;
}

function trimMessageForHistory(content: string): string {
  const v = content.replace(/\s+/g, " ").trim();
  if (v.length <= HISTORY_MESSAGE_MAX_CHARS) return v;
  return `${v.slice(0, HISTORY_MESSAGE_MAX_CHARS)}…`;
}

function normalizeFileBracketMentions(answer: string): string {
  // keep parser-friendly [File: name] tokens by removing markdown wrappers.
  return answer
    .replace(/\*\*(\[File:\s*[^\]]+\])\*\*/g, "$1")
    .replace(/\*(\[File:\s*[^\]]+\])\*/g, "$1")
    .replace(/`(\[File:\s*[^\]]+\])`/g, "$1");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enforceFileBracketMentionsForSourceNames(
  answer: string,
  sourceFileNames: string[]
): string {
  let out = answer;
  const protectedTags: string[] = [];
  out = out.replace(/\[File:\s*[^\]]+\]/g, (m) => {
    const token = `__FILE_TAG_${protectedTags.length}__`;
    protectedTags.push(m);
    return token;
  });

  const names = [...new Set(sourceFileNames.map((n) => n.trim()).filter(Boolean))];
  for (const name of names) {
    const escaped = escapeRegex(name);
    // first normalize @name -> [File: name]
    const atRe = new RegExp(`@${escaped}(?=$|[^\\w])`, "g");
    out = out.replace(atRe, `[File: ${name}]`);
    // then replace bare filename mentions while preserving boundaries.
    const re = new RegExp(`(^|[^\\w\\]])(${escaped})(?=$|[^\\w])`, "g");
    out = out.replace(re, (_m, p1: string, p2: string) => `${p1}[File: ${p2}]`);
  }

  out = out.replace(/__FILE_TAG_(\d+)__/g, (_m, idx: string) => {
    const i = Number(idx);
    return Number.isFinite(i) && protectedTags[i] ? protectedTags[i]! : _m;
  });

  return out;
}

function isNotFoundStyleAnswer(answer: string): boolean {
  const v = answer.trim().toLowerCase();
  if (!v) return true;
  return (
    v.includes("not found in files") ||
    v.includes("couldn't find that in your files") ||
    v.includes("could not find that in your files") ||
    v === "not found"
  );
}

function buildHistoryBlock(
  rows: Array<{ role: string; content: string }>
): string {
  return rows
    .map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      return `${role}: ${trimMessageForHistory(m.content)}`;
    })
    .join("\n");
}

function summarizeSelectedChunks(chunks: ChunkHit[]): string {
  if (chunks.length === 0) return "(none)";
  return chunks
    .map(
      (c) =>
        `${c.contentId}|idx${c.chunkIndex}|score${c.score.toFixed(4)}`
    )
    .join("; ");
}

function formatScoresFromPacks(
  packs: Array<{ contentId: string; bestScore: number }>
): string {
  if (packs.length === 0) return "(none)";
  return packs
    .map((p) => `${p.contentId}=${p.bestScore.toFixed(4)}`)
    .join("; ");
}

const FILES_META_BLOCK_MAX = 25;

// Shown when the RAG pipeline cannot answer from the user's files. The next
// user turn is checked against AFFIRMATIVE_RE / NEGATIVE_RE to honor consent.
// Keep this string stable — we detect it in chat history to gate the fallback.
export const GENERAL_KNOWLEDGE_CONSENT_PROMPT =
  "I couldn't find this in your files. Want me to answer from general knowledge instead? Reply \"yes\" to continue.";

const GENERAL_KNOWLEDGE_DECLINED_ANSWER =
  "Okay, I'll stay within your files.";

const GENERAL_KNOWLEDGE_EMPTY_ANSWER =
  "From general knowledge (not in your files):\nI don't have a reliable answer for that.";

const AFFIRMATIVE_RE =
  /^(y|yes|yeah|yep|yup|ya|sure|ok|okay|please|please do|go ahead|do it|continue|proceed|use general(?: knowledge)?|answer anyway|yes please)[.! ]*$/i;

const NEGATIVE_RE =
  /^(n|no|nope|nah|don't|do not|skip|stop|cancel|never mind|nvm)[.! ]*$/i;

function isConsentPromptMessage(content: string): boolean {
  return content.trim() === GENERAL_KNOWLEDGE_CONSENT_PROMPT;
}

function formatDateTimeShort(d: Date): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatSizeBytes(size: bigint): string {
  const n = Number(size);
  if (!Number.isFinite(n) || n < 0) return `${size.toString()} B`;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const dec = v >= 100 || i === 0 ? 0 : 1;
  return `${v.toFixed(dec)} ${units[i]}`;
}

function dedupeByFileId<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

async function saveConversationTurn(params: {
  conversationId: string;
  userContent: string;
  assistantContent: string;
  sources?: AskSource[];
}): Promise<void> {
  await conversationRepository.createMessage({
    conversationId: params.conversationId,
    role: "user",
    content: params.userContent,
  });
  await conversationRepository.createMessage({
    conversationId: params.conversationId,
    role: "assistant",
    content: params.assistantContent,
    ...(params.sources && params.sources.length > 0
      ? { sources: params.sources }
      : {}),
  });
  await conversationRepository.touchConversationUpdatedAt(
    params.conversationId
  );
}

// If the last assistant message was the "want general knowledge?" consent
// prompt, treat the current user message as a yes/no reply instead of a new
// retrieval query. Returns null when no consent context exists.
async function handleGeneralKnowledgeConsentFollowup(params: {
  conversationId: string;
  rawQuery: string;
  displayQuery: string | undefined;
  filesMetaBlock: string;
}): Promise<AskResult | null> {
  const q = params.rawQuery.trim();
  const affirmative = AFFIRMATIVE_RE.test(q);
  const negative = NEGATIVE_RE.test(q);
  if (!affirmative && !negative) return null;

  const recent = await conversationRepository.listRecentMessagesForConversation({
    conversationId: params.conversationId,
    limit: 6,
  });
  const last = recent[recent.length - 1];
  if (!last || last.role !== "assistant" || !isConsentPromptMessage(last.content)) {
    return null;
  }

  if (negative) {
    await saveConversationTurn({
      conversationId: params.conversationId,
      userContent: params.displayQuery || q,
      assistantContent: GENERAL_KNOWLEDGE_DECLINED_ANSWER,
    });
    return { answer: GENERAL_KNOWLEDGE_DECLINED_ANSWER, sources: [] };
  }

  let originalQuestion = "";
  for (let i = recent.length - 2; i >= 0; i -= 1) {
    const m = recent[i];
    if (m && m.role === "user") {
      originalQuestion = m.content.trim();
      break;
    }
  }
  if (!originalQuestion) return null;

  const systemInstruction = buildGeneralKnowledgeSystemInstruction();
  const userMessage = buildGeneralKnowledgeUserMessage({
    query: originalQuestion,
    ...(params.filesMetaBlock ? { filesMeta: params.filesMetaBlock } : {}),
  });

  let answer = GENERAL_KNOWLEDGE_EMPTY_ANSWER;
  try {
    const gen = await ragCompletionService.generateRagCompletion({
      systemInstruction,
      userMessage,
      temperature: env.RAG_TEMPERATURE,
    });
    const text = (gen.text || "").trim();
    if (text) answer = text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`general-knowledge followup failed: ${msg}`);
  }

  await saveConversationTurn({
    conversationId: params.conversationId,
    userContent: params.displayQuery || q,
    assistantContent: answer,
  });
  return { answer, sources: [] };
}

// Renders a bullet list the model can read: filename, upload date, mime, size, source.
function buildFilesMetaBlock(
  files: fileRepository.FileSearchMetaRow[]
): string {
  const rows = dedupeByFileId(files).slice(0, FILES_META_BLOCK_MAX);
  if (rows.length === 0) return "";
  return rows
    .map((f) => {
      const uploaded = formatDateTimeShort(f.createdAt);
      const size = formatSizeBytes(f.size);
      const source =
        f.sourceType === "url" && f.sourceUrl
          ? `imported from ${f.sourceUrl}`
          : "uploaded";
      return `- [File: ${f.originalName}] uploaded ${uploaded}, type ${f.mimeType}, size ${size}, source ${source}`;
    })
    .join("\n");
}

export async function askUserFiles(params: {
  userId: string;
  query: string;
  displayQuery?: string;
  fileIds?: string[];
  workspaceId?: string;
  conversationId?: string;
}): Promise<AskResult> {
  const t0 = performance.now();
  const rawQuery = params.query.trim();

  let scopedFileIds = 0;
  let restrictContentIds: string[] | undefined;

  let effectiveFileIds: string[] | undefined;
  let workspaceScopedFileIds: string[] | undefined;

  let conversationId: string | undefined;
  if (params.conversationId) {
    const c = await conversationRepository.findConversationByIdForUser(
      params.conversationId,
      params.userId
    );
    if (!c) {
      throw new InvalidConversationError();
    }
    if (params.workspaceId && c.workspaceId !== params.workspaceId) {
      throw new InvalidConversationError();
    }
    conversationId = c.id;
  }

  if (params.workspaceId) {
    const ws = await workspaceRepository.findWorkspaceByIdForUser(
      params.workspaceId,
      params.userId
    );
    if (!ws) {
      throw new InvalidWorkspaceError();
    }
    const wsFileIds = await fileRepository.findFileIdsByWorkspaceForUser(
      params.userId,
      params.workspaceId
    );
    workspaceScopedFileIds = wsFileIds;
    const wsSet = new Set(wsFileIds);
    if (params.fileIds && params.fileIds.length > 0) {
      const unique = [...new Set(params.fileIds)];
      for (const id of unique) {
        if (!wsSet.has(id)) {
          throw new InvalidFileIdsError();
        }
      }
      effectiveFileIds = unique;
    } else {
      effectiveFileIds = wsFileIds;
    }
  } else if (params.fileIds && params.fileIds.length > 0) {
    effectiveFileIds = params.fileIds;
  }

  if (effectiveFileIds !== undefined) {
    const uniqueFileIds = [...new Set(effectiveFileIds)];
    scopedFileIds = uniqueFileIds.length;
    if (uniqueFileIds.length === 0) {
      restrictContentIds = [];
    } else {
      const map = await fileRepository.findContentIdsByFileIdsForUser(
        params.userId,
        uniqueFileIds
      );
      if (map.size !== uniqueFileIds.length) {
        throw new InvalidFileIdsError();
      }
      restrictContentIds = [...new Set([...map.values()])];
    }
  }

  // Resolve metadata for files in scope so the prompt can answer questions
  // like upload date, size, type, source, count, list directly from facts.
  let scopedFilesMeta: fileRepository.FileSearchMetaRow[] = [];
  if (effectiveFileIds && effectiveFileIds.length > 0) {
    scopedFilesMeta = await fileRepository.findFilesByIdsForUser(
      params.userId,
      effectiveFileIds.slice(0, FILES_META_BLOCK_MAX)
    );
  } else if (workspaceScopedFileIds && workspaceScopedFileIds.length > 0) {
    scopedFilesMeta = await fileRepository.findFilesByIdsForUser(
      params.userId,
      workspaceScopedFileIds.slice(0, FILES_META_BLOCK_MAX)
    );
  }
  const filesMetaBlock = buildFilesMetaBlock(scopedFilesMeta);

  // If the user is replying yes/no to a prior "answer from general knowledge?"
  // consent prompt, handle that here before spending an embedding + vector search.
  if (conversationId) {
    const followup = await handleGeneralKnowledgeConsentFollowup({
      conversationId,
      rawQuery,
      displayQuery: params.displayQuery,
      filesMetaBlock,
    });
    if (followup) return followup;
  }

  const tEmbed = performance.now();
  const embedding = await embeddingService.embedQuery(rawQuery);
  const embedMs = performance.now() - tEmbed;

  const tVec = performance.now();
  const rows = await searchRepository.findNearestChunksForUser({
    userId: params.userId,
    embedding,
    limit: env.RAG_VECTOR_CHUNK_LIMIT,
    restrictContentIds,
  });
  const vectorMs = performance.now() - tVec;

  // min chunk score means : how close the chunk is to the query
  const minScore = env.RAG_MIN_CHUNK_SCORE;
  const hits: ChunkHit[] = rows
    .map((r) => ({
      ...r,
      score: distanceToScore(r.distance),
    }))
    .filter((h) => h.score >= minScore);

  const byContent = new Map<string, ChunkHit[]>();
  for (const h of hits) {
    const arr = byContent.get(h.contentId) ?? [];
    arr.push(h);

    // contentId is the id of the content that the chunk belongs to
    // arr is an array of chunks that belong to the same content
    byContent.set(h.contentId, arr);
  }

  const maxCp = env.RAG_MAX_CHUNKS_PER_CONTENT;
  type ContentPack = {
    contentId: string;
    bestScore: number;
    chunks: ChunkHit[];
  };
  const packs: ContentPack[] = [];

  // input : a map of contentId to an array of chunks that belong to the same content
  // output : an array of content packs
  // a content pack is an object with the following properties:
  // - contentId: the id of the content that the pack belongs to
  // - bestScore: the score of the best chunk in the pack
  // - chunks: an array of chunks that belong to the pack, sorted by score in descending order, sliced to maxCp
  for (const [contentId, arr] of byContent) {
    arr.sort((a, b) => b.score - a.score);
    const chunks = arr.slice(0, maxCp);
    const bestScore = chunks[0]?.score ?? 0;
    packs.push({ contentId, bestScore, chunks });
  }

  packs.sort((a, b) => b.bestScore - a.bestScore);
  const topPacks = packs.slice(0, env.RAG_TOP_CONTENT_COUNT);

  const topContentIds = topPacks.map((p) => p.contentId);

  let selectedChunks: ChunkHit[] = [];
  for (const p of topPacks) {
    selectedChunks = selectedChunks.concat(p.chunks);
  }

  const chunksAfterScoreFilter = hits.length;

  const contentIdsBeforeDedup = [...new Set(packs.map((p) => p.contentId))].sort();
  const contentIdsAfterDedup = topPacks.map((p) => p.contentId);
  const scoresBeforeDedup = formatScoresFromPacks(packs);
  const scoresAfterDedup = formatScoresFromPacks(topPacks);

  // When there are no retrieval hits AND no scoped metadata, there is
  // nothing the LLM can possibly answer from — short-circuit cleanly.
  // When scoped metadata exists, keep going so questions like "upload date"
  // / "file size" / "how many files" can be answered from metadata alone.
  if (topPacks.length === 0 && !filesMetaBlock.trim()) {
    const totalMs = performance.now() - t0;
    log.info(
      askApiPanel({
        userId: params.userId,
        query: rawQuery,
        queryChars: rawQuery.length,
        scopedFileIds,
        embedMs,
        vectorMs,
        llmMs: 0,
        totalMs,
        chunksFetched: rows.length,
        chunksAfterScoreFilter,
        distinctContentsPacked: packs.length,
        contentIdsBeforeDedup,
        contentIdsAfterDedup,
        scoresBeforeDedup,
        scoresAfterDedup,
        selectedChunksDetail: "(none)",
        selectedChunkCount: 0,
        contextChars: 0,
        model: ragCompletionModelDefault(),
        modelVersion: undefined,
      })
    );
    const notFoundAnswer = conversationId
      ? GENERAL_KNOWLEDGE_CONSENT_PROMPT
      : "Not found in files";
    if (conversationId) {
      await saveConversationTurn({
        conversationId,
        userContent: params.displayQuery || rawQuery,
        assistantContent: notFoundAnswer,
      });
    }
    return { answer: notFoundAnswer, sources: [] };
  }

  const files = await fileRepository.findFilesByContentIdsForUser(
    params.userId,
    topContentIds
  );
  const byContentFiles = new Map<string, typeof files>();
  for (const f of files) {
    const arr = byContentFiles.get(f.contentId) ?? [];
    arr.push(f);
    byContentFiles.set(f.contentId, arr);
  }
  for (const [, arr] of byContentFiles) {
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  const contextParts: string[] = [];
  for (const p of topPacks) {
    const group = byContentFiles.get(p.contentId) ?? [];
    const file = group[0];
    if (!file) continue;
    const chunkTexts = p.chunks.map((c) => c.content.trim()).filter(Boolean);
    if (chunkTexts.length === 0) continue;
    const body = chunkTexts.join("\n\n");
    contextParts.push(`[File: ${file.originalName}]\n${body}`);
  }

  let context = contextParts.join("\n\n");
  if (!context.trim()) {
    const totalMs = performance.now() - t0;
    log.info(
      // askApiPanel is a function that logs the ask API call to the console
      askApiPanel({
        userId: params.userId,
        query: rawQuery,
        queryChars: rawQuery.length,
        scopedFileIds,
        embedMs,
        vectorMs,
        llmMs: 0,
        totalMs,
        chunksFetched: rows.length,
        chunksAfterScoreFilter,
        distinctContentsPacked: packs.length,
        contentIdsBeforeDedup,
        contentIdsAfterDedup,
        scoresBeforeDedup,
        scoresAfterDedup,
        selectedChunksDetail: summarizeSelectedChunks(selectedChunks),
        selectedChunkCount: selectedChunks.length,
        contextChars: 0,
        model: ragCompletionModelDefault(),
        modelVersion: undefined,
      })
    );
    const notFoundAnswer = conversationId
      ? GENERAL_KNOWLEDGE_CONSENT_PROMPT
      : "Not found in files";
    if (conversationId) {
      await saveConversationTurn({
        conversationId,
        userContent: params.displayQuery || rawQuery,
        assistantContent: notFoundAnswer,
      });
    }
    return { answer: notFoundAnswer, sources: [] };
  }

  context = trimContextToMax(context, env.RAG_MAX_CONTEXT_CHARS);

  let historyBlock = "";
  if (conversationId) {
    const historyRows =
      await conversationRepository.listRecentMessagesForConversation({
        conversationId,
        limit: HISTORY_TURNS_MAX,
      });
    historyBlock = buildHistoryBlock(historyRows);
  }

  const systemInstruction = buildAskSystemInstruction();
  const userMessage = buildAskUserMessage({
    context,
    query: rawQuery,
    ...(historyBlock ? { history: historyBlock } : {}),
    ...(filesMetaBlock ? { filesMeta: filesMetaBlock } : {}),
  });

  const tLlm = performance.now();
  let answer: string;
  let genModel = ragCompletionModelDefault();
  let genModelVersion: string | undefined;
  let tokensPrompt: number | undefined;
  let tokensCandidates: number | undefined;
  let tokensTotal: number | undefined;
  try {
    const gen = await ragCompletionService.generateRagCompletion({
      systemInstruction,
      userMessage,
      temperature: env.RAG_TEMPERATURE,
    });
    answer = gen.text;
    genModel = gen.model;
    genModelVersion = gen.modelVersion;
    tokensPrompt = gen.usage.promptTokens;
    tokensCandidates = gen.usage.completionTokens;
    tokensTotal = gen.usage.totalTokens;
  } catch (e) {
    const totalMs = performance.now() - t0;
    const llmErrMs = performance.now() - tLlm;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`askUserFiles: RAG completion failed: ${msg}`);
    log.info(
      askApiPanel({
        userId: params.userId,
        query: rawQuery,
        queryChars: rawQuery.length,
        scopedFileIds,
        embedMs,
        vectorMs,
        llmMs: llmErrMs,
        totalMs,
        chunksFetched: rows.length,
        chunksAfterScoreFilter,
        distinctContentsPacked: packs.length,
        contentIdsBeforeDedup,
        contentIdsAfterDedup,
        scoresBeforeDedup,
        scoresAfterDedup,
        selectedChunksDetail: summarizeSelectedChunks(selectedChunks),
        selectedChunkCount: selectedChunks.length,
        contextChars: context.length,
        model: genModel,
        modelVersion: genModelVersion,
      })
    );
    throw e;
  }
  const llmMs = performance.now() - tLlm;

  const trimmed = answer.trim();
  if (!trimmed) {
    answer = "Not found in files";
  } else {
    answer = normalizeFileBracketMentions(trimmed);
  }

  let sources: AskSource[] = [];
  for (const p of topPacks) {
    const group = byContentFiles.get(p.contentId) ?? [];
    const file = group[0];
    if (!file) continue;
    for (const ch of p.chunks) {
      sources.push({
        fileId: file.id,
        fileName: file.originalName,
        snippet: truncateSnippet(ch.content),
      });
    }
  }

  // If the model correctly admitted the fact isn't present, don't attach
  // chunk sources — that would misleadingly suggest a partial answer and
  // previously triggered a "I found relevant content in …" fluff rewrite.
  // When we're in a persisted conversation, offer the general-knowledge
  // fallback so the user can opt in on the next turn.
  if (isNotFoundStyleAnswer(answer)) {
    answer = conversationId
      ? GENERAL_KNOWLEDGE_CONSENT_PROMPT
      : "Not found in files";
    sources = [];
  } else if (sources.length > 0) {
    answer = enforceFileBracketMentionsForSourceNames(
      answer,
      sources.map((s) => s.fileName)
    );
  }

  logRagDebug({
    route: "ask",
    userId: params.userId,
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    query: rawQuery,
    prompt: `${systemInstruction}\n\n---\n\n${userMessage}`,
    response: answer,
    sources: sources.map((s) => ({ fileId: s.fileId, fileName: s.fileName })),
  });

  const totalMs = performance.now() - t0;
  log.info(
    askApiPanel({
      userId: params.userId,
      query: rawQuery,
      queryChars: rawQuery.length,
      scopedFileIds,
      embedMs,
      vectorMs,
      llmMs,
      totalMs,
      chunksFetched: rows.length,
      chunksAfterScoreFilter,
      distinctContentsPacked: packs.length,
      contentIdsBeforeDedup,
      contentIdsAfterDedup,
      scoresBeforeDedup,
      scoresAfterDedup,
      selectedChunksDetail: summarizeSelectedChunks(selectedChunks),
      selectedChunkCount: selectedChunks.length,
      contextChars: context.length,
      tokensPrompt,
      tokensCandidates,
      tokensTotal,
      model: genModel,
      modelVersion: genModelVersion,
    })
  );

  if (conversationId) {
    await conversationRepository.createMessage({
      conversationId,
      role: "user",
      content: params.displayQuery || rawQuery,
    });
    await conversationRepository.createMessage({
      conversationId,
      role: "assistant",
      content: answer,
      ...(sources.length > 0 ? { sources } : {}),
    });
    await conversationRepository.touchConversationUpdatedAt(conversationId);
  }

  return { answer, sources };
}

export class InvalidFileIdsError extends Error {
  constructor() {
    super("INVALID_FILE_IDS");
    this.name = "InvalidFileIdsError";
  }
}

export class InvalidWorkspaceError extends Error {
  constructor() {
    super("INVALID_WORKSPACE");
    this.name = "InvalidWorkspaceError";
  }
}

export class InvalidConversationError extends Error {
  constructor() {
    super("INVALID_CONVERSATION");
    this.name = "InvalidConversationError";
  }
}
