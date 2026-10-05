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
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_OUTLOOK_CALENDAR_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readOutlookCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; userPrincipalName?: string }> {
  const creds = await context.credentials.read(["access_token", "user_principal_name"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Outlook Calendar access token is missing.", {
      code: "OUTLOOK_CALENDAR_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, userPrincipalName: creds.user_principal_name };
}

async function executeOutlookCalendarAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_msft_cal_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `msft_cal_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readOutlookCredentials(invocation);

  switch (capabilityId) {
    case "outlook-calendar.create_event": {
      const subject = extractString(inputObj, "subject", "Event Subject");
      const start = isRecord(inputObj.start) ? inputObj.start : { dateTime: typeof inputObj.start === "string" ? inputObj.start : new Date().toISOString(), timeZone: "UTC" };
      const end = isRecord(inputObj.end) ? inputObj.end : { dateTime: typeof inputObj.end === "string" ? inputObj.end : new Date(Date.now() + 3600000).toISOString(), timeZone: "UTC" };

      const res = await fetch(`${GRAPH_API_BASE}/me/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject,
          start,
          end,
          body: isRecord(inputObj.body) ? inputObj.body : { contentType: "text", content: typeof inputObj.content === "string" ? inputObj.content : "Scheduled by Nexus." },
          attendees: Array.isArray(inputObj.attendees) ? inputObj.attendees : undefined,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to create Outlook Calendar event.", {
          code: "OUTLOOK_CALENDAR_CREATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "outlook-calendar.update_event": {
      const eventId = inputObj.event_id ?? inputObj.id;
      if (!eventId) {
        throw new IntegrationRuntimeError("event_id or id is required.", {
          code: "INVALID_OUTLOOK_CALENDAR_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const bodyPayload: Record<string, unknown> = {};
      if (typeof inputObj.subject === "string") bodyPayload.subject = inputObj.subject.trim();
      if (inputObj.start) bodyPayload.start = isRecord(inputObj.start) ? inputObj.start : { dateTime: String(inputObj.start), timeZone: "UTC" };
      if (inputObj.end) bodyPayload.end = isRecord(inputObj.end) ? inputObj.end : { dateTime: String(inputObj.end), timeZone: "UTC" };

      const res = await fetch(`${GRAPH_API_BASE}/me/events/${encodeURIComponent(String(eventId))}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to update Outlook Calendar event.", {
          code: "OUTLOOK_CALENDAR_UPDATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "outlook-calendar.cancel_event": {
      const eventId = inputObj.event_id ?? inputObj.id;
      if (!eventId) {
        throw new IntegrationRuntimeError("event_id or id is required.", {
          code: "INVALID_OUTLOOK_CALENDAR_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const comment = typeof inputObj.comment === "string" ? inputObj.comment : "Cancelled via Nexus Scheduler.";

      const res = await fetch(`${GRAPH_API_BASE}/me/events/${encodeURIComponent(String(eventId))}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Comment: comment,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to cancel Outlook Calendar event.", {
          code: "OUTLOOK_CALENDAR_CANCEL_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("request-id") || null,
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

async function checkOutlookCalendarHealth(
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

    const res = await fetch(`${GRAPH_API_BASE}/me/calendar`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const calName = isRecord(data) && typeof data.name === "string" ? data.name : "Outlook Calendar";
    const calId = isRecord(data) && typeof data.id === "string" ? data.id : "outlook_calendar";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: calId,
      externalAccountLabel: calName,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Outlook Calendar health check failed." },
    };
  }
}

export const OUTLOOK_CALENDAR_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.outlook-calendar.runtime",
    adapterVersion: "1.0.0",
    providerId: "outlook-calendar",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "outlook-calendar.create_event",
      "outlook-calendar.update_event",
      "outlook-calendar.cancel_event",
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
  healthCheck: checkOutlookCalendarHealth,
  executeAction: executeOutlookCalendarAction,
};
