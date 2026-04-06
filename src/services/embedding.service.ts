import { createTextEmbeddings } from "./ai.service.js";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return createTextEmbeddings(texts);
}
