export const SEARCH_LOG_RULE = "─".repeat(62);

type SearchApiObservabilityFields = {
  userId: string;
  queryChars: number;
  embedMs: number;
  vectorMs: number;
  assembleMs: number;
  totalMs: number;
  chunksFetched: number;
  distinctContents: number;
  resultsReturned: number;
  duplicateFilesListed: number;
};

export function searchApiPanel(fields: SearchApiObservabilityFields): string {
  const lines: string[] = [
    SEARCH_LOG_RULE,
    "  SEARCH API · semantic",
    `  userId     ${fields.userId}`,
    `  queryChars ${fields.queryChars}`,
    `  timingMs   embed=${fields.embedMs.toFixed(1)} vector=${fields.vectorMs.toFixed(1)} assemble=${fields.assembleMs.toFixed(1)} total=${fields.totalMs.toFixed(1)}`,
    `  counts     chunks=${fields.chunksFetched} distinctContent=${fields.distinctContents} results=${fields.resultsReturned} duplicateRows=${fields.duplicateFilesListed}`,
    SEARCH_LOG_RULE,
  ];
  return lines.join("\n");
}
