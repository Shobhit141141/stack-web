import { SEARCH_LOG_RULE } from "./search-log.util.js";

export type AskApiLogFields = {
  userId: string;
  query: string;
  queryChars: number;
  scopedFileIds: number;
  embedMs: number;
  vectorMs: number;
  llmMs: number;
  totalMs: number;
  chunksFetched: number;
  chunksAfterScoreFilter: number;
  distinctContentsPacked: number;
  contentIdsBeforeDedup: string[];
  contentIdsAfterDedup: string[];
  scoresBeforeDedup: string;
  scoresAfterDedup: string;
  selectedChunksDetail: string;
  selectedChunkCount: number;
  contextChars: number;
  tokensPrompt?: number;
  tokensCandidates?: number;
  tokensTotal?: number;
  model: string;
  modelVersion?: string;
};

const QUERY_LOG_MAX = 4000;

export function truncateForLog(text: string, max = QUERY_LOG_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function joinIds(ids: string[]): string {
  if (ids.length === 0) return "(none)";
  return ids.join(", ");
}

export function askApiPanel(fields: AskApiLogFields): string {
  const tokPrompt =
    fields.tokensPrompt !== undefined ? String(fields.tokensPrompt) : "—";
  const tokCand =
    fields.tokensCandidates !== undefined ? String(fields.tokensCandidates) : "—";
  const tokTotal =
    fields.tokensTotal !== undefined ? String(fields.tokensTotal) : "—";
  const modelLine =
    fields.modelVersion && fields.modelVersion !== fields.model
      ? `${fields.model} (api: ${fields.modelVersion})`
      : fields.model;

  const lines: string[] = [
    SEARCH_LOG_RULE,
    "  ASK API · RAG",
    `  userId                 ${fields.userId}`,
    `  query                  ${truncateForLog(fields.query)}`,
    `  queryChars             ${fields.queryChars}`,
    `  scopedFileIds          ${fields.scopedFileIds}`,
    `  timingMs               embed=${fields.embedMs.toFixed(1)} vector=${fields.vectorMs.toFixed(1)} llm=${fields.llmMs.toFixed(1)} total=${fields.totalMs.toFixed(1)}`,
    `  llmLatencyMs           ${fields.llmMs.toFixed(1)}`,
    `  modelUsed              ${modelLine}`,
    `  tokensSent             prompt=${tokPrompt} candidates=${tokCand} total=${tokTotal}`,
    `  chunks                 fetched=${fields.chunksFetched} afterScore=${fields.chunksAfterScoreFilter} selected=${fields.selectedChunkCount}`,
    `  contentsDistinct       packed=${fields.distinctContentsPacked}`,
    `  contentIdsBeforeDedup  ${joinIds(fields.contentIdsBeforeDedup)}`,
    `  contentIdsAfterDedup   ${joinIds(fields.contentIdsAfterDedup)}`,
    `  scoresBeforeDedup      ${fields.scoresBeforeDedup || "(none)"}`,
    `  scoresAfterDedup       ${fields.scoresAfterDedup || "(none)"}`,
    `  selectedChunks         ${fields.selectedChunksDetail}`,
    `  contextChars           ${fields.contextChars}`,
    SEARCH_LOG_RULE,
  ];
  return lines.join("\n");
}
