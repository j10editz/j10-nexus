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
const PIKA_API_BASE = "https://api.pika.art/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_PIKA_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readPikaApiKey(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.PIKA_API_KEY;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Pika API Key is not configured in credentials vault.", {
      code: "PIKA_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return apiKey;
}

async function executePikaAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_pika_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        generationId: `pika_gen_sim_${Date.now()}`,
        status: "submitted",
        videoUrl: "https://cdn.pika.art/simulated_pika_video.mp4",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const apiKey = await readPikaApiKey(invocation);

  switch (capabilityId) {
    case "pika.generate_video":
    case "pika.modify_video":
    case "pika.add_effects": {
      const prompt = extractString(inputObj, "prompt", "Prompt for Pika video generation");

      const body = {
        promptText: prompt,
        options: {
          aspectRatio: inputObj.aspect_ratio || "16:9",
          frameRate: inputObj.frame_rate || 24,
        },
      };

      const res = await fetch(`${PIKA_API_BASE}/generate`, {
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
        throw new IntegrationRuntimeError(data.error?.message || "Failed to generate video with Pika.", {
          code: "PIKA_API_ERROR",
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
          generationId: data.id || data.job_id,
          status: data.status || "processing",
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Pika adapter.`, {
        code: "UNSUPPORTED_PIKA_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkPikaHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.PIKA_API_KEY;

  if (!apiKey) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Pika API key missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${PIKA_API_BASE}/user`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok || res.status === 404) {
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "pika_labs",
        externalAccountLabel: "Pika AI Video Effects",
        metadata: {
          service: "Pika API v1",
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
        reason: `Pika API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to Pika API",
      },
    };
  }
}

export const PIKA_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.pika.runtime",
    adapterVersion: "1.0.0",
    providerId: "pika",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "pika.generate_video",
      "pika.modify_video",
      "pika.add_effects",
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
    maxConcurrency: 5,
  },
  healthCheck: checkPikaHealth,
  executeAction: executePikaAction,
};
