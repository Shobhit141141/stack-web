import { encoding_for_model, type Tiktoken } from "tiktoken";

let encoder: Tiktoken | null = null;

export function getChunkTokenizer(): Tiktoken {
  encoder ??= encoding_for_model("text-embedding-3-small");
  return encoder;
}

export function countTokens(text: string): number {
  return getChunkTokenizer().encode_ordinary(text).length;
}

export function decodeTokensToString(enc: Tiktoken, tokens: Uint32Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(enc.decode(tokens));
}

export function tailTokensAsText(source: string, maxTokens: number, enc: Tiktoken): string {
  const t = enc.encode_ordinary(source);
  if (t.length <= maxTokens) return source;
  const tail = t.slice(t.length - maxTokens);
  return decodeTokensToString(enc, tail);
}
