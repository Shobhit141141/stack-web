import { performance } from "node:perf_hooks";
import { env, ragCompletionModelDefault } from "../config/env.js";
import { buildAskSystemInstruction, buildAskUserMessage } from "../rag/prompt.js";
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
  payload?: unknown;
};

type ChunkHit = searchRepository.ChunkSearchRow & { score: number };

const SNIPPET_MAX_CHARS = 400;
const HISTORY_TURNS_MAX = 12;
const HISTORY_MESSAGE_MAX_CHARS = 400;
const QUIZ_MAX_QUESTIONS = 5;
const QUIZ_OPTIONS_PER_QUESTION = 4;

type QuizQuestionOption = {
  optionId: string;
  text: string;
};

type QuizQuestionPublic = {
  questionId: string;
  prompt: string;
  options: QuizQuestionOption[];
};

type QuizAnswerKeyItem = {
  questionId: string;
  correctOptionId: string;
  explanation: string;
};

type QuizPayload = {
  kind: "quiz";
  quizId: string;
  title: string;
  prompt: string;
  questions: QuizQuestionPublic[];
  answerKey: QuizAnswerKeyItem[];
};

type QuizPayloadPublic = {
  kind: "quiz";
  quizId: string;
  title: string;
  prompt: string;
  questions: QuizQuestionPublic[];
};

type QuizSubmissionPayload = {
  kind: "quiz_submission";
  quizId: string;
  quizMessageId: string;
  answers: Array<{
    questionId: string;
    selectedOptionId: string;
  }>;
};

type QuizResultPayload = {
  kind: "quiz_result";
  quizId: string;
  score: number;
  total: number;
  perQuestion: Array<{
    questionId: string;
    selectedOptionId: string | null;
    correctOptionId: string;
    isCorrect: boolean;
    explanation: string;
  }>;
  insights: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function safeUuidLikeFromNow(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseQuizPrompt(rawQuery: string): string | null {
  const q = rawQuery.trim();
  if (!q.toLowerCase().startsWith("/quiz")) return null;
  const rest = q.slice(5).trim();
  return rest || "Create a general quiz from the provided context.";
}

async function generateQuizFromContext(params: {
  context: string;
  prompt: string;
}): Promise<QuizPayload> {
  const schemaInstruction =
    'Return only valid JSON with this shape: {"title":string,"questions":[{"questionId":string,"prompt":string,"options":[{"optionId":string,"text":string}],"correctOptionId":string,"explanation":string}]}';
  const userMessage = [
    "Create a multiple-choice quiz from the context.",
    "Rules:",
    `- max ${QUIZ_MAX_QUESTIONS} questions`,
    `- exactly ${QUIZ_OPTIONS_PER_QUESTION} options per question`,
    "- question and options should be concise",
    "- include correctOptionId and short explanation for grading/feedback",
    "",
    `User focus: ${params.prompt}`,
    "",
    "Context:",
    params.context,
    "",
    schemaInstruction,
  ].join("\n");
  const gen = await ragCompletionService.generateRagCompletion({
    systemInstruction:
      "You are an assessment generator. Output strict JSON only with no markdown.",
    userMessage,
    temperature: 0.2,
  });
  const parsed = JSON.parse(extractJsonObject(gen.text)) as unknown;
  if (!isRecord(parsed) || typeof parsed.title !== "string" || !Array.isArray(parsed.questions)) {
    throw new Error("Invalid quiz JSON shape");
  }
  const questions = parsed.questions.slice(0, QUIZ_MAX_QUESTIONS).map((q, i) => {
    if (!isRecord(q)) throw new Error("Invalid quiz question");
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    const questionId =
      typeof q.questionId === "string" && q.questionId.trim()
        ? q.questionId.trim()
        : `q${i + 1}`;
    const optionsRaw = Array.isArray(q.options) ? q.options : [];
    const options = optionsRaw.slice(0, QUIZ_OPTIONS_PER_QUESTION).map((o, j) => {
      if (!isRecord(o) || typeof o.text !== "string") {
        throw new Error("Invalid quiz option");
      }
      const optionId =
        typeof o.optionId === "string" && o.optionId.trim()
          ? o.optionId.trim()
          : `o${j + 1}`;
      return {
        optionId,
        text: o.text.trim(),
      };
    });
    if (!prompt || options.length !== QUIZ_OPTIONS_PER_QUESTION) {
      throw new Error("Invalid quiz question fields");
    }
    const correctOptionId =
      typeof q.correctOptionId === "string" && q.correctOptionId.trim()
        ? q.correctOptionId.trim()
        : options[0]!.optionId;
    if (!options.some((o) => o.optionId === correctOptionId)) {
      throw new Error("correctOptionId not found in options");
    }
    const explanation =
      typeof q.explanation === "string" && q.explanation.trim()
        ? q.explanation.trim()
        : "Review the related section in the source material.";
    return {
      questionId,
      prompt,
      options,
      correctOptionId,
      explanation,
    };
  });
  if (questions.length === 0) {
    throw new Error("No quiz questions generated");
  }
  return {
    kind: "quiz",
    quizId: safeUuidLikeFromNow(),
    title: parsed.title.trim() || "Knowledge Check",
    prompt: params.prompt,
    questions: questions.map((q) => ({
      questionId: q.questionId,
      prompt: q.prompt,
      options: q.options,
    })),
    answerKey: questions.map((q) => ({
      questionId: q.questionId,
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
    })),
  };
}

function toPublicQuizPayload(payload: QuizPayload): QuizPayloadPublic {
  return {
    kind: "quiz",
    quizId: payload.quizId,
    title: payload.title,
    prompt: payload.prompt,
    questions: payload.questions,
  };
}

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

type MetadataIntent =
  | "uploadedAt"
  | "fileType"
  | "fileSize"
  | "fileName"
  | "source"
  | "count"
  | "list";

function detectMetadataIntent(query: string): MetadataIntent | null {
  const q = query.toLowerCase();
  if (/\b(how many|count|number of files)\b/.test(q)) return "count";
  if (/\b(list|show|what files do i have|which files)\b/.test(q)) return "list";
  if (/\b(uploaded|when.*(uploaded|added|created)|created at|upload time)\b/.test(q))
    return "uploadedAt";
  if (/\b(type|format|mime)\b/.test(q)) return "fileType";
  if (/\b(size|how big|file size|kb|mb|gb)\b/.test(q)) return "fileSize";
  if (/\b(name|filename|file name)\b/.test(q)) return "fileName";
  if (/\b(source|url|uploaded or link|link)\b/.test(q)) return "source";
  return null;
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

function buildMetadataSources(
  files: fileRepository.FileSearchMetaRow[]
): AskSource[] {
  return dedupeByFileId(files).slice(0, 5).map((f) => ({
    fileId: f.id,
    fileName: f.originalName,
    snippet: "metadata",
  }));
}

function answerMetadataIntent(params: {
  intent: MetadataIntent;
  files: fileRepository.FileSearchMetaRow[];
  workspaceScopedCount?: number;
}): AskResult | null {
  const files = dedupeByFileId(params.files);
  if (params.intent === "count" && params.workspaceScopedCount !== undefined) {
    const n = params.workspaceScopedCount;
    return {
      answer: n === 1 ? "You have 1 file in this workspace." : `You have ${n} files in this workspace.`,
      sources: buildMetadataSources(files),
    };
  }
  if (params.intent === "count" && files.length > 0) {
    const n = files.length;
    return {
      answer: n === 1 ? "I found 1 file." : `I found ${n} files.`,
      sources: buildMetadataSources(files),
    };
  }
  if (files.length === 0) return null;

  if (params.intent === "list") {
    const names = files.slice(0, 10).map((f) => `• ${f.originalName}`);
    return {
      answer: `Here are files I found:\n${names.join("\n")}`,
      sources: buildMetadataSources(files),
    };
  }
  if (params.intent === "uploadedAt") {
    const lines = files
      .slice(0, 8)
      .map((f) => `• ${f.originalName} — uploaded ${formatDateTimeShort(f.createdAt)}`);
    return { answer: lines.join("\n"), sources: buildMetadataSources(files) };
  }
  if (params.intent === "fileType") {
    const lines = files
      .slice(0, 8)
      .map((f) => `• ${f.originalName} — ${f.mimeType}`);
    return { answer: lines.join("\n"), sources: buildMetadataSources(files) };
  }
  if (params.intent === "fileSize") {
    const lines = files
      .slice(0, 8)
      .map((f) => `• ${f.originalName} — ${formatSizeBytes(f.size)}`);
    return { answer: lines.join("\n"), sources: buildMetadataSources(files) };
  }
  if (params.intent === "fileName") {
    const lines = files.slice(0, 12).map((f) => `• ${f.originalName}`);
    return { answer: lines.join("\n"), sources: buildMetadataSources(files) };
  }
  if (params.intent === "source") {
    const lines = files.slice(0, 8).map((f) => {
      if (f.sourceType === "url" && f.sourceUrl) {
        return `• ${f.originalName} — imported from ${f.sourceUrl}`;
      }
      return `• ${f.originalName} — uploaded manually`;
    });
    return { answer: lines.join("\n"), sources: buildMetadataSources(files) };
  }
  return null;
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
  const quizPrompt = parseQuizPrompt(rawQuery);

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

  const metadataIntent = quizPrompt ? null : detectMetadataIntent(rawQuery);
  if (metadataIntent) {
    let metadataFiles: fileRepository.FileSearchMetaRow[] = [];
    if (effectiveFileIds && effectiveFileIds.length > 0) {
      metadataFiles = await fileRepository.findFilesByIdsForUser(
        params.userId,
        effectiveFileIds
      );
    } else if (
      metadataIntent !== "count" &&
      workspaceScopedFileIds &&
      workspaceScopedFileIds.length > 0
    ) {
      metadataFiles = await fileRepository.findFilesByIdsForUser(
        params.userId,
        workspaceScopedFileIds.slice(0, 25)
      );
    }
    const metadataResult = answerMetadataIntent({
      intent: metadataIntent,
      files: metadataFiles,
      ...(workspaceScopedFileIds !== undefined
        ? { workspaceScopedCount: workspaceScopedFileIds.length }
        : {}),
    });
    if (metadataResult) {
      if (conversationId) {
        await conversationRepository.createMessage({
          conversationId,
          role: "user",
          content: params.displayQuery || rawQuery,
        });
        await conversationRepository.createMessage({
          conversationId,
          role: "assistant",
          content: metadataResult.answer,
          ...(metadataResult.sources.length > 0
            ? { sources: metadataResult.sources }
            : {}),
        });
        await conversationRepository.touchConversationUpdatedAt(conversationId);
      }
      const totalMs = performance.now() - t0;
      log.info(
        askApiPanel({
          userId: params.userId,
          query: rawQuery,
          queryChars: rawQuery.length,
          scopedFileIds,
          embedMs: 0,
          vectorMs: 0,
          llmMs: 0,
          totalMs,
          chunksFetched: 0,
          chunksAfterScoreFilter: 0,
          distinctContentsPacked: 0,
          contentIdsBeforeDedup: [],
          contentIdsAfterDedup: [],
          scoresBeforeDedup: "(none)",
          scoresAfterDedup: "(none)",
          selectedChunksDetail: "(metadata-only)",
          selectedChunkCount: 0,
          contextChars: 0,
          model: "metadata",
          modelVersion: undefined,
        })
      );
      return metadataResult;
    }
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

  // fallback for explicit file scoping: if strict threshold removes all neighbors,
  // still use nearest chunks so tagged/specified files can be answered.
  const effectiveHits: ChunkHit[] =
    hits.length > 0
      ? hits
      : effectiveFileIds && effectiveFileIds.length > 0 && rows.length > 0
      ? rows.map((r) => ({
          ...r,
          score: distanceToScore(r.distance),
        }))
      : [];

  const byContent = new Map<string, ChunkHit[]>();
  for (const h of effectiveHits) {
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

  const chunksAfterScoreFilter = effectiveHits.length;

  const contentIdsBeforeDedup = [...new Set(packs.map((p) => p.contentId))].sort();
  const contentIdsAfterDedup = topPacks.map((p) => p.contentId);
  const scoresBeforeDedup = formatScoresFromPacks(packs);
  const scoresAfterDedup = formatScoresFromPacks(topPacks);

  if (topPacks.length === 0) {
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
    return { answer: "Not found in files", sources: [] };
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
    return { answer: "Not found in files", sources: [] };
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

  if (quizPrompt) {
    const quizPayload = await generateQuizFromContext({
      context,
      prompt: quizPrompt,
    });
    const quizPayloadPublic = toPublicQuizPayload(quizPayload);
    const answer = `Quiz ready: ${quizPayload.title} (${quizPayload.questions.length} questions). Select options and submit when ready.`;
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
        payload: quizPayload,
      });
      await conversationRepository.touchConversationUpdatedAt(conversationId);
    }
    return { answer, sources: [], payload: quizPayloadPublic };
  }

  const systemInstruction = buildAskSystemInstruction();
  const userMessage = buildAskUserMessage({
    context,
    query: rawQuery,
    ...(historyBlock ? { history: historyBlock } : {}),
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

  const sources: AskSource[] = [];
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

  if (sources.length > 0 && isNotFoundStyleAnswer(answer)) {
    const fileNames = [...new Set(sources.map((s) => s.fileName))].slice(0, 3);
    answer =
      fileNames.length === 1
        ? `I found relevant content in ${fileNames[0]}.`
        : `I found relevant content in ${fileNames.join(", ")}.`;
  }

  if (sources.length > 0) {
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

export async function submitQuizAnswers(params: {
  userId: string;
  conversationId: string;
  quizMessageId: string;
  answers: Array<{
    questionId: string;
    selectedOptionId: string;
  }>;
}): Promise<{
  userMessage: {
    content: string;
    payload: QuizSubmissionPayload;
  };
  assistantMessage: {
    answer: string;
    payload: QuizResultPayload;
  };
}> {
  const convo = await conversationRepository.findConversationByIdForUser(
    params.conversationId,
    params.userId
  );
  if (!convo) throw new InvalidConversationError();

  const quizMsg = await conversationRepository.findMessageByIdForUser({
    messageId: params.quizMessageId,
    userId: params.userId,
  });
  if (!quizMsg || quizMsg.conversationId !== params.conversationId) {
    throw new InvalidQuizMessageError();
  }
  if (!isRecord(quizMsg.payload) || quizMsg.payload.kind !== "quiz") {
    throw new InvalidQuizMessageError();
  }
  const payload = quizMsg.payload as unknown as QuizPayload;
  if (!Array.isArray(payload.questions) || !Array.isArray(payload.answerKey)) {
    throw new InvalidQuizMessageError();
  }

  const answersByQuestion = new Map(
    params.answers.map((a) => [a.questionId, a.selectedOptionId])
  );
  const perQuestion = payload.answerKey.map((k) => {
    const selectedOptionId = answersByQuestion.get(k.questionId) ?? null;
    const isCorrect = selectedOptionId === k.correctOptionId;
    return {
      questionId: k.questionId,
      selectedOptionId,
      correctOptionId: k.correctOptionId,
      isCorrect,
      explanation: k.explanation,
    };
  });
  const score = perQuestion.filter((q) => q.isCorrect).length;
  const total = perQuestion.length;

  const insightsPrompt = [
    "A user completed a quiz. Provide concise learning insights in plain text.",
    "Include strengths, weak areas, and 2-3 next study tips.",
    `Score: ${score}/${total}`,
    `Question outcomes: ${JSON.stringify(perQuestion)}`,
  ].join("\n");
  let insights =
    "Good attempt. Review incorrect questions and revisit related file sections before retrying.";
  try {
    const gen = await ragCompletionService.generateRagCompletion({
      systemInstruction:
        "You are a helpful tutor giving concise actionable feedback.",
      userMessage: insightsPrompt,
      temperature: 0.3,
    });
    const txt = gen.text.trim();
    if (txt) insights = txt;
  } catch {
    // keep default insights
  }

  const submissionPayload: QuizSubmissionPayload = {
    kind: "quiz_submission",
    quizId: payload.quizId,
    quizMessageId: params.quizMessageId,
    answers: perQuestion.map((q) => ({
      questionId: q.questionId,
      selectedOptionId: q.selectedOptionId ?? "",
    })),
  };
  const resultPayload: QuizResultPayload = {
    kind: "quiz_result",
    quizId: payload.quizId,
    score,
    total,
    perQuestion,
    insights,
  };
  const userContent = `Quiz submission: ${score}/${total}`;
  const assistantContent = `You scored ${score}/${total}.\n\n${insights}`;

  await conversationRepository.createMessage({
    conversationId: params.conversationId,
    role: "user",
    content: userContent,
    payload: submissionPayload,
  });
  await conversationRepository.createMessage({
    conversationId: params.conversationId,
    role: "assistant",
    content: assistantContent,
    payload: resultPayload,
  });
  await conversationRepository.touchConversationUpdatedAt(params.conversationId);

  return {
    userMessage: {
      content: userContent,
      payload: submissionPayload,
    },
    assistantMessage: {
      answer: assistantContent,
      payload: resultPayload,
    },
  };
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

export class InvalidQuizMessageError extends Error {
  constructor() {
    super("INVALID_QUIZ_MESSAGE");
    this.name = "InvalidQuizMessageError";
  }
}
