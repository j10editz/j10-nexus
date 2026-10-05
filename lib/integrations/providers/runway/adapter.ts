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
const RUNWAY_API_BASE = "https://api.dev.runwayml.com/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_RUNWAY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readRunwayApiKey(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.RUNWAY_API_KEY;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Runway API Key is not configured in credentials vault.", {
      code: "RUNWAY_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return apiKey;
}

async function executeRunwayAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_runway_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        taskId: `task_sim_runway_${Date.now()}`,
        status: "PENDING",
        outputUrl: "https://assets.runwayml.com/simulated_gen3_output.mp4",
        model: inputObj.model || "gen3a_turbo",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const apiKey = await readRunwayApiKey(invocation);

  switch (capabilityId) {
    case "runway.generate_video": {
      const promptText = typeof inputObj.prompt_text === "string" ? inputObj.prompt_text : typeof inputObj.prompt === "string" ? inputObj.prompt : "Cinematic commercial transition";
      const model = typeof inputObj.model === "string" ? inputObj.model : "gen3a_turbo";

      const body: Record<string, unknown> = {
        model,
        promptText,
        duration: typeof inputObj.duration === "number" ? inputObj.duration : 5,
        ratio: typeof inputObj.ratio === "string" ? inputObj.ratio : "16:9",
      };

      if (typeof inputObj.prompt_image === "string") {
        body.promptImage = inputObj.prompt_image;
      }

      const res = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to start Runway video generation task.", {
          code: "RUNWAY_API_ERROR",
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
          taskId: data.id,
          status: data.status || "PENDING",
          createdAt: data.createdAt,
        },
      };
    }

    case "runway.generate_image":
    case "runway.transform_media": {
      const prompt = extractString(inputObj, "prompt", "Prompt for Runway media generation");

      const body = {
        promptText: prompt,
        model: inputObj.model || "gen3a_turbo",
      };

      const res = await fetch(`${RUNWAY_API_BASE}/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to dispatch Runway task.", {
          code: "RUNWAY_API_ERROR",
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
          taskId: data.id,
          status: data.status || "PENDING",
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Runway adapter.`, {
        code: "UNSUPPORTED_RUNWAY_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkRunwayHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.RUNWAY_API_KEY;

  if (!apiKey) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Runway API key missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${RUNWAY_API_BASE}/tasks?limit=1`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok || res.status === 404) {
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "runway_enterprise",
        externalAccountLabel: "Runway Gen-3 Alpha Video",
        metadata: {
          service: "RunwayML API v1",
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
        reason: `Runway API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to Runway API",
      },
    };
  }
}

export const RUNWAY_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.runway.runtime",
    adapterVersion: "1.0.0",
    providerId: "runway",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "runway.generate_video",
      "runway.generate_image",
      "runway.transform_media",
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
  healthCheck: checkRunwayHealth,
  executeAction: executeRunwayAction,
};
