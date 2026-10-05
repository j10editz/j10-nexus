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
const CALENDLY_API_BASE = "https://api.calendly.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_CALENDLY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readCalendlyCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; userUri?: string }> {
  const creds = await context.credentials.read(["access_token", "user_uri"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Calendly access token is missing.", {
      code: "CALENDLY_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, userUri: creds.user_uri };
}

async function executeCalendlyAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_calendly_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `cal_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, userUri } = await readCalendlyCredentials(invocation);

  switch (capabilityId) {
    case "calendly.create_scheduling_link": {
      const owner = typeof inputObj.owner === "string" && inputObj.owner.trim()
        ? inputObj.owner.trim()
        : typeof inputObj.event_type_uri === "string" && inputObj.event_type_uri.trim()
        ? inputObj.event_type_uri.trim()
        : userUri;

      if (!owner) {
        throw new IntegrationRuntimeError("owner or event_type_uri is required to generate a scheduling link.", {
          code: "INVALID_CALENDLY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${CALENDLY_API_BASE}/scheduling_links`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_event_count: typeof inputObj.max_event_count === "number" ? inputObj.max_event_count : 1,
          owner,
          owner_type: typeof inputObj.owner_type === "string" ? inputObj.owner_type : "EventType",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to create Calendly scheduling link.", {
          code: "CALENDLY_LINK_FAILED",
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
        metadata: data,
      };
    }

    case "calendly.cancel_event": {
      const eventUuid = typeof inputObj.uuid === "string" && inputObj.uuid.trim()
        ? inputObj.uuid.trim()
        : typeof inputObj.event_uuid === "string" && inputObj.event_uuid.trim()
        ? inputObj.event_uuid.trim()
        : typeof inputObj.id === "string" && inputObj.id.trim()
        ? inputObj.id.trim()
        : "";

      if (!eventUuid) {
        throw new IntegrationRuntimeError("uuid or event_uuid is required.", {
          code: "INVALID_CALENDLY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const reason = typeof inputObj.reason === "string" ? inputObj.reason.trim() : "Cancelled by Nexus automated scheduler.";

      const res = await fetch(`${CALENDLY_API_BASE}/scheduled_events/${encodeURIComponent(eventUuid)}/cancellation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to cancel Calendly event.", {
          code: "CALENDLY_CANCEL_FAILED",
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
        metadata: data,
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkCalendlyHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token"]);
    const token = creds.access_token;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing access token" },
      };
    }

    const res = await fetch(`${CALENDLY_API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const resource = isRecord(data) && isRecord(data.resource) ? data.resource : null;
    const name = resource && typeof resource.name === "string" ? resource.name : "Calendly User";
    const uri = resource && typeof resource.uri === "string" ? resource.uri : "calendly_user";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: uri,
      externalAccountLabel: name,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Calendly health check failed." },
    };
  }
}

export const CALENDLY_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.calendly.runtime",
    adapterVersion: "1.0.0",
    providerId: "calendly",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "calendly.create_scheduling_link",
      "calendly.cancel_event",
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
  healthCheck: checkCalendlyHealth,
  executeAction: executeCalendlyAction,
};
