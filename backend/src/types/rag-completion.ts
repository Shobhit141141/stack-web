export type RagCompletionUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type RagCompletionResult = {
  text: string;
  model: string;
  modelVersion?: string;
  usage: RagCompletionUsage;
};
