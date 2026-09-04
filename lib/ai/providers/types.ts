import type {
  J10ModelPreference,
  J10TaskType,
  J10Workload,
  J10ReasoningEffort,
  J10ReasoningMode,
} from "@/lib/ai/model-router";

export type J10AIProviderName = "gemini" | "openai" | "development";

export type J10AIMode = "development" | "live";

export type RunJ10AIInput = {
  task: J10TaskType;
  input: string;
  instructions?: string;
  preference?: J10ModelPreference;
  maxOutputTokens?: number;
  temperature?: number;
};

export type RunJ10AIResult = {
  success: true;
  responseId: string;
  text: string;
  provider: J10AIProviderName;
  model: string;
  displayModel: string;
  task: J10TaskType;
  workload: string;
  reasoningEffort: string;
  reasoningMode: string;
  routingReason: string;
  executionMode: J10AIMode;
  simulated: boolean;
  apiCalled: boolean;
  status: string;
  estimatedCostUSD: number | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reasoningTokens: number;
  } | null;
};
