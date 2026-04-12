import type { Tiktoken } from "tiktoken";
import {
  decodeTokensToString,
  getChunkTokenizer,
  tailTokensAsText,
} from "../utils/tokenizer.util.js";
import { log } from "../utils/logger/index.js";

const TARGET_MIN = 300;
const TARGET_MAX = 500;
const OVERLAP_TARGET = 75;
const MAX_CHUNKS = 50;

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

export type TextChunk = {
  content: string;
  tokenCount: number;
};

function splitParagraphs(text: string): string[] {
  const parts = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [];
}

function splitSentences(paragraph: string): string[] {
  const s = paragraph
    .split(SENTENCE_SPLIT)
    .map((x) => x.trim())
    .filter(Boolean);
  if (s.length > 0) return s;
  return paragraph.trim() ? [paragraph.trim()] : [];
}

// input : "Hello, world!"
// output : [
//   {
//     content: "Hello, world!",
//     tokenCount: 2,
//   },
// ]

function splitLongSentence(sentence: string, enc: Tiktoken): string[] {
  const tokens = enc.encode_ordinary(sentence);
  if (tokens.length <= TARGET_MAX) return [sentence];

  const pieces: string[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(start + TARGET_MAX, tokens.length);
    const slice = tokens.slice(start, end);
    pieces.push(decodeTokensToString(enc, slice));
    if (end >= tokens.length) break;
    start = Math.max(0, end - OVERLAP_TARGET);
  }
  return pieces;
}

// input : "Hello, world!"
// output : [
//   {
//     content: "Hello, world!",
//     tokenCount: 2,
//   },
// ]

function flattenPieces(text: string, enc: Tiktoken): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paras = splitParagraphs(trimmed);
  const blocks = paras.length > 0 ? paras : [trimmed];
  const out: string[] = [];

  for (const p of blocks) {
    for (const s of splitSentences(p)) {
      out.push(...splitLongSentence(s, enc));
    }
  }

  return out.length > 0 ? out : splitLongSentence(trimmed, enc);
}

// input : "Hello, world!"
// output : [
//   {
//     content: "Hello, world!",
//     tokenCount: 2,
//   },
// ]

export function chunkExtractedText(text: string): TextChunk[] {
  const enc = getChunkTokenizer();
  const sentences = flattenPieces(text, enc);
  if (sentences.length === 0) return [];

  const chunks: TextChunk[] = [];
  let i = 0;
  let prefix = "";

  while (i < sentences.length && chunks.length < MAX_CHUNKS) {
    let body = prefix.trim();
    prefix = "";

    while (i < sentences.length) {
      const s = sentences[i]!;
      const candidate = body ? `${body} ${s}` : s;
      const candTok = enc.encode_ordinary(candidate).length;
      const bodyTok = body ? enc.encode_ordinary(body).length : 0;

      if (candTok <= TARGET_MAX) {
        body = candidate;
        i += 1;
        continue;
      }

      if (bodyTok >= TARGET_MIN) {
        break;
      }

      body = candidate;
      i += 1;
      break;
    }

    const trimmed = body.trim();
    if (!trimmed) break;

    chunks.push({
      content: trimmed,
      tokenCount: enc.encode_ordinary(trimmed).length,
    });
    prefix = tailTokensAsText(trimmed, OVERLAP_TARGET, enc);
  }

  if (chunks.length >= MAX_CHUNKS && i < sentences.length) {
    log.warn(
      `chunking truncated at MAX_CHUNKS=${MAX_CHUNKS} (${sentences.length - i} sentences not indexed)`
    );
  }

  return chunks.slice(0, MAX_CHUNKS);
}
