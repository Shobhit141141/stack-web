export function buildAskSystemInstruction(): string {
  return [
    "You answer questions about the user's uploaded files.",
    "Use ONLY the information in the context below. Do not use outside knowledge.",
    'If the context does not answer the question, reply exactly: Not found in files',
    "Cite file names from the context when you state facts (use the names shown in [File: ...] lines).",
    "Do not invent files, quotes, or details that are not in the context.",
    "Keep the answer concise and direct.",
  ].join("\n");
}

export function buildAskUserMessage(params: {
  context: string;
  query: string;
}): string {
  return `Context from the user's files:\n\n${params.context}\n\nQuestion:\n${params.query}`;
}
