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
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_GEMINI_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readGeminiApiKey(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Google Gemini API Key is not configured in credentials vault.", {
      code: "GEMINI_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return apiKey;
}

async function executeGeminiAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_gemini_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Hello from J10 NEXUS simulated Google Gemini Multimodal operator.",
                },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        model: inputObj.model || "gemini-2.5-flash",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const apiKey = await readGeminiApiKey(invocation);
  const model = typeof inputObj.model === "string" ? inputObj.model : "gemini-2.5-flash";

  switch (capabilityId) {
    case "gemini.generate_content": {
      const prompt =
        typeof inputObj.prompt === "string"
          ? inputObj.prompt
          : Array.isArray(inputObj.contents)
          ? "Process multimodal request"
          : "Hello";

      const contents = Array.isArray(inputObj.contents)
        ? inputObj.contents
        : [{ parts: [{ text: prompt }] }];

      const body: Record<string, unknown> = { contents };
      if (inputObj.systemInstruction) {
        body.systemInstruction = inputObj.systemInstruction;
      }
      if (inputObj.generationConfig) {
        body.generationConfig = inputObj.generationConfig;
      }

      const res = await fetch(
        `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to generate content with Gemini.", {
          code: "GEMINI_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-goog-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          model,
          text,
          candidates: data.candidates,
          usageMetadata: data.usageMetadata,
        },
      };
    }

    case "gemini.analyze_media": {
      const mediaUri = extractString(inputObj, "media_uri", "Media URI for Gemini analysis");
      const prompt = typeof inputObj.prompt === "string" ? inputObj.prompt : "Analyze this media asset.";

      const body = {
        contents: [
          {
            parts: [
              { text: prompt },
              { fileData: { fileUri: mediaUri, mimeType: inputObj.mime_type || "image/jpeg" } },
            ],
          },
        ],
      };

      const res = await fetch(
        `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to analyze media with Gemini.", {
          code: "GEMINI_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-goog-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          analysis: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
          rawResponse: data,
        },
      };
    }

    case "gemini.create_embedding": {
      const text = extractString(inputObj, "text", "Text for Gemini embedding");
      const embeddingModel = typeof inputObj.model === "string" ? inputObj.model : "text-embedding-004";

      const res = await fetch(
        `${GEMINI_API_BASE}/models/${embeddingModel}:embedContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text }] },
          }),
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to create embedding with Gemini.", {
          code: "GEMINI_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-goog-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          valuesCount: data.embedding?.values?.length || 0,
          embedding: data.embedding,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Gemini adapter.`, {
        code: "UNSUPPORTED_GEMINI_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkGeminiHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Google Gemini API key missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(
      `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
      {
        signal: context.signal || AbortSignal.timeout(10_000),
      }
    );

    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "google_ai_studio",
        externalAccountLabel: "Google Gemini Multimodal AI",
        metadata: {
          service: "Google Generative AI v1beta",
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
        reason: `Gemini API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to Google Gemini API",
      },
    };
  }
}

export const GEMINI_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.gemini.runtime",
    adapterVersion: "1.0.0",
    providerId: "gemini",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "gemini.generate_content",
      "gemini.analyze_media",
      "gemini.create_embedding",
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
  healthCheck: checkGeminiHealth,
  executeAction: executeGeminiAction,
};
