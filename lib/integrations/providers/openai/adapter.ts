import "server-only";

import type {
  IntegrationConnectorRuntimeAdapter,
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeHealthResult,
  IntegrationRuntimeInvocationContext,
  IntegrationRuntimeResult,
} from "@/types/integration-runtime";
import {
  INTEGRATION_RUNTIME_SCHEMA_VERSION,
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

const REQUEST_TIMEOUT_MS = 30_000;
const OPENAI_API_BASE = "https://api.openai.com/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_OPENAI_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readOpenAIApiKey(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new IntegrationRuntimeError("OpenAI API Key is not configured in credentials vault.", {
      code: "OPENAI_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return apiKey;
}

async function executeOpenAIAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_openai_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        completionId: `chatcmpl_sim_${Date.now()}`,
        message: {
          role: "assistant",
          content: "Hello from J10 NEXUS simulated OpenAI assistant. Ready to automate your customer workflows.",
          tool_calls: inputObj.tools ? [{ id: "call_sim_1", type: "function", function: { name: "bookAppointment", arguments: "{}" } }] : null,
        },
        model: inputObj.model || "gpt-4o",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const apiKey = await readOpenAIApiKey(invocation);

  switch (capabilityId) {
    case "openai.generate_response":
    case "openai.chat_completions": {
      const messages = Array.isArray(inputObj.messages)
        ? inputObj.messages
        : typeof inputObj.prompt === "string"
        ? [{ role: "user", content: inputObj.prompt }]
        : [{ role: "user", content: "Hello" }];

      const model = typeof inputObj.model === "string" ? inputObj.model : "gpt-4o";
      const temperature = typeof inputObj.temperature === "number" ? inputObj.temperature : 0.7;
      const tools = Array.isArray(inputObj.tools) ? inputObj.tools : undefined;

      const body: Record<string, unknown> = {
        model,
        messages,
        temperature,
      };

      if (tools) body.tools = tools;
      if (inputObj.response_format) body.response_format = inputObj.response_format;

      const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to execute OpenAI chat completion.", {
          code: "OPENAI_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const choice = data.choices?.[0];
      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          completionId: data.id,
          model: data.model,
          message: choice?.message,
          finishReason: choice?.finish_reason,
          usage: data.usage,
        },
      };
    }

    case "openai.run_assistant": {
      const assistantId = extractString(inputObj, "assistant_id", "OpenAI Assistant ID");
      const threadMessage = typeof inputObj.content === "string" ? inputObj.content : "Start workflow";

      const threadRes = await fetch(`${OPENAI_API_BASE}/threads/runs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistant_id: assistantId,
          thread: {
            messages: [{ role: "user", content: threadMessage }],
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const threadData = await threadRes.json().catch(() => ({}));
      if (!threadRes.ok) {
        throw new IntegrationRuntimeError(threadData.error?.message || "Failed to run OpenAI assistant.", {
          code: "OPENAI_API_ERROR",
          category: "provider",
          status: threadRes.status,
          details: threadData,
        });
      }

      return {
        success: true,
        responseStatus: threadRes.status,
        providerRequestId: threadRes.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          runId: threadData.id,
          threadId: threadData.thread_id,
          status: threadData.status,
        },
      };
    }

    case "openai.analyze_media": {
      const imageUrl = extractString(inputObj, "image_url", "Image URL for OpenAI Vision");
      const prompt = typeof inputObj.prompt === "string" ? inputObj.prompt : "Analyze this business document/image.";

      const body = {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      };

      const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to analyze media with OpenAI vision.", {
          code: "OPENAI_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          completionId: data.id,
          analysis: data.choices?.[0]?.message?.content,
        },
      };
    }

    case "openai.generate_image": {
      const prompt = extractString(inputObj, "prompt", "Image generation prompt");
      const size = typeof inputObj.size === "string" ? inputObj.size : "1024x1024";

      const res = await fetch(`${OPENAI_API_BASE}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "dall-e-3", prompt, size, n: 1 }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to generate image via DALL-E 3.", {
          code: "OPENAI_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          url: data.data?.[0]?.url,
          revisedPrompt: data.data?.[0]?.revised_prompt,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for OpenAI adapter.`, {
        code: "UNSUPPORTED_OPENAI_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkOpenAIHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "OpenAI API key missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${OPENAI_API_BASE}/models?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "openai_platform",
        externalAccountLabel: "OpenAI GPT-4o / Assistant API",
        metadata: {
          service: "OpenAI API v1",
        },
      };
    }

    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: `OpenAI Models API returned HTTP ${res.status}`,
      },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: err instanceof Error ? err.message : "Failed to connect to OpenAI API",
      },
    };
  }
}

export const OPENAI_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.openai.runtime",
    adapterVersion: "1.0.0",
    providerId: "openai",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "openai.generate_response",
      "openai.analyze_media",
      "openai.generate_image",
      "openai.chat_completions",
      "openai.run_assistant",
    ].map((capabilityId) => ({
      capabilityId,
      kind: "action" as const,
      modes: ["simulate", "sandbox", "live"] as const,
      requiredScopes: [],
      supportsIdempotency: true,
    })),
    supportsHealthChecks: true,
    supportsTokenRefresh: false,
    supportsTokenRevocation: false,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxConcurrency: 10,
  },
  healthCheck: checkOpenAIHealth,
  executeAction: executeOpenAIAction,
};
