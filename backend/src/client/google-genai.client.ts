import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_DIM } from "../constants/embeddings.js";
import { env } from "../config/env.js";
import type { RagCompletionResult } from "../types/rag-completion.js";

let client: GoogleGenAI | null = null;

export function getGoogleGenAIClient(): GoogleGenAI {
  if (client) return client;
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client = new GoogleGenAI({ apiKey: key });
  return client;
}

// input : [0.1, 0.2, 0.3]
// output : [0.1, 0.2, 0.3]
function normalizeToStorageDim(values: number[]): number[] {
  const v = values.map(Number);
  if (v.length === EMBEDDING_DIM) return v;
  if (v.length > EMBEDDING_DIM) return v.slice(0, EMBEDDING_DIM);
  return [...v, ...Array(EMBEDDING_DIM - v.length).fill(0)];
}

// input : ["Hello, world!", "Hello, universe!"]
// output : [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
export async function googleCreateEmbeddings(params: {
  model: string;
  texts: string[];
}): Promise<number[][]> {
  const ai = getGoogleGenAIClient();
  const result = await ai.models.embedContent({
    model: params.model,
    contents: params.texts,
    config: {
      taskType: "RETRIEVAL_DOCUMENT",
    },
  });
  const embeddings = result.embeddings;
  if (!embeddings || embeddings.length !== params.texts.length) {
    throw new Error("Google embedding batch size mismatch");
  }
  return embeddings.map((e, i) => {
    const values = e.values;
    if (!values?.length) {
      throw new Error(`Google embedding missing values at index ${i}`);
    }
    return normalizeToStorageDim(values);
  });
}

// single query embedding (RETRIEVAL_QUERY) for vector search
export async function googleEmbedQueryText(params: {
  model: string;
  text: string;
}): Promise<number[]> {
  const ai = getGoogleGenAIClient();
  const result = await ai.models.embedContent({
    model: params.model,
    contents: params.text,
    config: {
      taskType: "RETRIEVAL_QUERY",
    },
  });
  const embeddings = result.embeddings;
  const first = embeddings?.[0];
  const values = first?.values;
  if (!values?.length) {
    throw new Error("Google query embedding missing values");
  }
  return normalizeToStorageDim(values);
}

export async function googleGenerateRagCompletion(params: {
  model: string;
  systemInstruction: string;
  userMessage: string;
  temperature: number;
}): Promise<RagCompletionResult> {
  const ai = getGoogleGenAIClient();
  const response = await ai.models.generateContent({
    model: params.model,
    contents: params.userMessage,
    config: {
      systemInstruction: params.systemInstruction,
      temperature: params.temperature,
    },
  });
  const text = response.text?.trim();
  if (!text) {
    throw new Error("Gemini returned empty text");
  }
  const u = response.usageMetadata;
  return {
    text,
    model: params.model,
    modelVersion: response.modelVersion,
    usage: {
      promptTokens: u?.promptTokenCount,
      completionTokens: u?.candidatesTokenCount,
      totalTokens: u?.totalTokenCount,
    },
  };
}

export async function googleDescribeImage(params: {
  model: string;
  systemInstruction: string;
  userMessage: string;
  temperature: number;
  imageMimeType: string;
  imageBytes: Buffer;
}): Promise<RagCompletionResult> {
  const ai = getGoogleGenAIClient();
  const response = await ai.models.generateContent({
    model: params.model,
    contents: [
      {
        role: "user",
        parts: [
          { text: params.userMessage },
          {
            inlineData: {
              mimeType: params.imageMimeType,
              data: params.imageBytes.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction: params.systemInstruction,
      temperature: params.temperature,
    },
  });
  const text = response.text?.trim();
  if (!text) {
    throw new Error("Gemini returned empty image description");
  }
  const u = response.usageMetadata;
  return {
    text,
    model: params.model,
    modelVersion: response.modelVersion,
    usage: {
      promptTokens: u?.promptTokenCount,
      completionTokens: u?.candidatesTokenCount,
      totalTokens: u?.totalTokenCount,
    },
  };
}
