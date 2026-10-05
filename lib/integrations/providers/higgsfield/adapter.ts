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
const HIGGSFIELD_API_BASE = "https://api.higgsfield.ai/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_HIGGSFIELD_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readHiggsfieldApiKey(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.HIGGSFIELD_API_KEY;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Higgsfield API Key is not configured in credentials vault.", {
      code: "HIGGSFIELD_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return apiKey;
}

async function executeHiggsfieldAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_higgs_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        jobId: `job_sim_higgs_${Date.now()}`,
        status: "processing",
        previewUrl: "https://assets.higgsfield.ai/simulated_motion_ad.mp4",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const apiKey = await readHiggsfieldApiKey(invocation);

  switch (capabilityId) {
    case "higgsfield.generate_video":
    case "higgsfield.apply_motion":
    case "higgsfield.create_ad_creative": {
      const prompt = extractString(inputObj, "prompt", "Prompt for Higgsfield generation");
      const motionType = typeof inputObj.motion_type === "string" ? inputObj.motion_type : "cinematic_pan";

      const body = {
        prompt,
        motionType,
        sourceImageUrl: inputObj.source_image_url || null,
        duration: typeof inputObj.duration === "number" ? inputObj.duration : 4,
      };

      const res = await fetch(`${HIGGSFIELD_API_BASE}/generate`, {
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
        throw new IntegrationRuntimeError(data.error?.message || "Failed to dispatch Higgsfield creative task.", {
          code: "HIGGSFIELD_API_ERROR",
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
          jobId: data.id || data.job_id,
          status: data.status || "queued",
          output: data.output || null,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Higgsfield adapter.`, {
        code: "UNSUPPORTED_HIGGSFIELD_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkHiggsfieldHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["api_key", "secret_key"]);
  const apiKey = creds.api_key || creds.secret_key || process.env.HIGGSFIELD_API_KEY;

  if (!apiKey) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Higgsfield API key missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${HIGGSFIELD_API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok || res.status === 404) {
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "higgsfield_studio",
        externalAccountLabel: "Higgsfield Cinematic Motion AI",
        metadata: {
          service: "Higgsfield API v1",
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
        reason: `Higgsfield API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to Higgsfield API",
      },
    };
  }
}

export const HIGGSFIELD_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.higgsfield.runtime",
    adapterVersion: "1.0.0",
    providerId: "higgsfield",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "higgsfield.generate_video",
      "higgsfield.apply_motion",
      "higgsfield.create_ad_creative",
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
  healthCheck: checkHiggsfieldHealth,
  executeAction: executeHiggsfieldAction,
};
