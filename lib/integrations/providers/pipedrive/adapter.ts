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

const REQUEST_TIMEOUT_MS = 15_000;
const PIPEDRIVE_API_BASE = "https://api.pipedrive.com/v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_PIPEDRIVE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readPipedriveToken(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["api_token", "access_token"]);
  const token = creds.api_token || creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Pipedrive API Token or OAuth access token is missing.", {
      code: "PIPEDRIVE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return token;
}

async function executePipedriveAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_pipe_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: Math.floor(Math.random() * 100000),
        timestamp: new Date().toISOString(),
      },
    };
  }

  const token = await readPipedriveToken(invocation);

  switch (capabilityId) {
    case "pipedrive.create_person": {
      const name = extractString(inputObj, "name", "Person Name");

      const res = await fetch(`${PIPEDRIVE_API_BASE}/persons?api_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: inputObj.email,
          phone: inputObj.phone,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new IntegrationRuntimeError(data.error || "Failed to create Pipedrive Person.", {
          code: "PIPEDRIVE_PERSON_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(data.data?.id || `pipe_p_${Date.now()}`),
        rateLimit: null,
        metadata: { personId: data.data?.id },
      };
    }

    case "pipedrive.create_deal": {
      const title = extractString(inputObj, "title", "Deal Title");

      const res = await fetch(`${PIPEDRIVE_API_BASE}/deals?api_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          value: inputObj.value,
          currency: inputObj.currency || "USD",
          person_id: inputObj.person_id,
          stage_id: inputObj.stage_id,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new IntegrationRuntimeError(data.error || "Failed to create Pipedrive Deal.", {
          code: "PIPEDRIVE_DEAL_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(data.data?.id || `pipe_d_${Date.now()}`),
        rateLimit: null,
        metadata: { dealId: data.data?.id },
      };
    }

    case "pipedrive.update_deal": {
      const dealId = extractString(inputObj, "deal_id", "Deal ID");

      const res = await fetch(`${PIPEDRIVE_API_BASE}/deals/${dealId}?api_token=${encodeURIComponent(token)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: inputObj.stage_id,
          status: inputObj.status,
          value: inputObj.value,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new IntegrationRuntimeError(data.error || "Failed to update Pipedrive Deal.", {
          code: "PIPEDRIVE_UPDATE_DEAL_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: dealId,
        rateLimit: null,
        metadata: { dealId: data.data?.id },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported Pipedrive capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkPipedriveHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["api_token", "access_token"]);
    const token = creds.api_token || creds.access_token;

    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Pipedrive API token missing." },
      };
    }

    const res = await fetch(`${PIPEDRIVE_API_BASE}/users/me?api_token=${encodeURIComponent(token)}`, {
      signal: context.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    return {
      healthy: res.ok && data.success !== false,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: data.data?.id ? String(data.data.id) : null,
      externalAccountLabel: data.data?.name || "Pipedrive Pipeline",
      metadata: { companyName: data.data?.company_name },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Pipedrive health check failed." },
    };
  }
}

export const PIPEDRIVE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.pipedrive.runtime",
    adapterVersion: "1.0.0",
    providerId: "pipedrive",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "pipedrive.create_person",
      "pipedrive.create_deal",
      "pipedrive.update_deal",
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
  healthCheck: checkPipedriveHealth,
  executeAction: executePipedriveAction,
};
