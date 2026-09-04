import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { RunJ10AIInput, RunJ10AIResult } from "./types";

let openAIClient: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
  if (!openAIClient) {
    openAIClient = new OpenAI({ apiKey });
  }
  return openAIClient;
}

export function getOpenAIApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export async function runOpenAIAI(input: RunJ10AIInput): Promise<RunJ10AIResult> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. OpenAI live mode cannot start.");
  }

  const client = getClient(apiKey);
  const isComplex =
    input.task === "sales_decision" ||
    input.task === "executive_strategy" ||
    input.task === "critical_decision" ||
    input.task === "business_intelligence";

  const model = isComplex ? "gpt-4o" : "gpt-4o-mini";
  const displayName = isComplex ? "OpenAI GPT-4o" : "OpenAI GPT-4o Mini";

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (input.instructions?.trim()) {
    messages.push({
      role: "system",
      content: input.instructions.trim(),
    });
  }

  messages.push({
    role: "user",
    content: input.input,
  });

  const completion = await client.chat.completions.create({
    model,
    messages,
    max_tokens: input.maxOutputTokens ?? 2048,
    temperature: input.temperature ?? 0.2,
  });

  const choice = completion.choices?.[0];
  const text = choice?.message?.content?.trim() ?? "";

  if (!text) {
    throw new Error("OpenAI completed the request but returned no text content.");
  }

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const totalTokens = completion.usage?.total_tokens ?? inputTokens + outputTokens;

  return {
    success: true,
    responseId: completion.id || `openai-${randomUUID()}`,
    text,
    provider: "openai",
    model,
    displayModel: displayName,
    task: input.task,
    workload: isComplex ? "complex" : "fast",
    reasoningEffort: isComplex ? "medium" : "none",
    reasoningMode: "standard",
    routingReason: `Routed to ${displayName} based on task complexity.`,
    executionMode: "live",
    simulated: false,
    apiCalled: true,
    status: choice?.finish_reason ?? "stop",
    estimatedCostUSD: isComplex
      ? (inputTokens * 0.000005) + (outputTokens * 0.000015)
      : (inputTokens * 0.00000015) + (outputTokens * 0.0000006),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      reasoningTokens: 0,
    },
  };
}
