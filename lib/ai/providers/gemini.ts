import { randomUUID } from "node:crypto";
import type { RunJ10AIInput, RunJ10AIResult } from "./types";

const GEMINI_API_HOST = "https://generativelanguage.googleapis.com";
const GEMINI_API_VERSION = "v1beta";

export type GeminiModelId =
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro";

export function getGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_AI_STUDIO_API_KEY ??
    process.env.GOOGLE_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export function selectGeminiModel(input: RunJ10AIInput): {
  model: GeminiModelId;
  displayName: string;
  reason: string;
  workload: "fast" | "standard" | "complex" | "critical";
} {
  const override = process.env.GEMINI_MODEL?.trim() as GeminiModelId | undefined;
  if (override) {
    return {
      model: override,
      displayName: `Gemini (${override})`,
      reason: "Configured via GEMINI_MODEL environment variable.",
      workload: "standard",
    };
  }

  // Workload routing based on task complexity
  switch (input.task) {
    case "sales_decision":
    case "executive_strategy":
    case "critical_decision":
    case "business_intelligence":
      return {
        model: "gemini-2.5-pro",
        displayName: "Gemini 2.5 Pro",
        reason: "Complex business reasoning and multi-step evaluation.",
        workload: "complex",
      };

    case "crm_analysis":
    case "customer_support":
    case "automation_planning":
    case "summarization":
    case "content_generation":
    case "research":
    case "status_update":
    case "classification":
    case "data_extraction":
    case "simple_message":
    default:
      return {
        model: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        reason: "Sub-second low-latency conversational response with verified business knowledge grounding.",
        workload: "fast",
      };
  }
}

export async function runGeminiAI(input: RunJ10AIInput): Promise<RunJ10AIResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY or GOOGLE_AI_STUDIO_API_KEY is not configured. Google AI Studio live mode cannot start."
    );
  }

  const { model, displayName, reason, workload } = selectGeminiModel(input);

  const endpoint = new URL(
    `${GEMINI_API_HOST}/${GEMINI_API_VERSION}/models/${model}:generateContent`
  );

  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.input }],
      },
    ],
    generationConfig: {
      temperature: input.temperature ?? 0.2,
      maxOutputTokens: input.maxOutputTokens ?? 2048,
    },
  };

  if (input.instructions?.trim()) {
    payload.system_instruction = {
      parts: [{ text: input.instructions.trim() }],
    };
  }

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Google Gemini API error (status ${response.status}).`;
    try {
      const parsed = JSON.parse(errorText) as { error?: { message?: string } };
      if (parsed.error?.message) {
        errorMessage = `Gemini API: ${parsed.error.message}`;
      }
    } catch {}
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  const candidate = data.candidates?.[0];
  const text =
    candidate?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Google Gemini completed the request but returned no text content.");
  }

  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
  const totalTokens = data.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;

  return {
    success: true,
    responseId: `gemini-${randomUUID()}`,
    text,
    provider: "gemini",
    model,
    displayModel: displayName,
    task: input.task,
    workload,
    reasoningEffort: workload === "complex" ? "high" : "none",
    reasoningMode: "standard",
    routingReason: reason,
    executionMode: "live",
    simulated: false,
    apiCalled: true,
    status: candidate?.finishReason ?? "STOP",
    estimatedCostUSD: 0.0, // Google AI Studio free tier
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      reasoningTokens: 0,
    },
  };
}
