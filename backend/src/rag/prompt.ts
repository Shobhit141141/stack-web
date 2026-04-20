export function buildAskSystemInstruction(): string {
  return [
    "You answer questions about the user's uploaded files.",
    "Use ONLY the information in the context below. Do not use outside knowledge.",
    'If the context does not answer the question, reply exactly: Not found in files',
    "When you mention any file name in the answer, use this exact format: [File: filename.ext].",
    "Apply [File: ...] formatting to every file-name mention, including lists, examples, and citations.",
    "Cite file names from the context when you state facts (use the names shown in [File: ...] lines).",
    "Do not invent files, quotes, or details that are not in the context.",
    "Keep the answer concise and direct.",
  ].join("\n");
}

export function buildAskUserMessage(params: {
  context: string;
  query: string;
  history?: string;
}): string {
  const historyPart = params.history?.trim()
    ? `Recent conversation:\n${params.history}\n\n`
    : "";
  return `${historyPart}Context from the user's files:\n\n${params.context}\n\nQuestion:\n${params.query}`;
}
