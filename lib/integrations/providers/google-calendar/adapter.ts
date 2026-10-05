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
import {
  refreshGoogleOAuthAuthorization,
  revokeGoogleOAuthAuthorization,
} from "../google/oauth-runtime";

const REQUEST_TIMEOUT_MS = 15_000;
const GCAL_API_BASE = "https://www.googleapis.com/calendar/v3";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_GCAL_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readAccessToken(context: IntegrationRuntimeInvocationContext): Promise<string> {
  const creds = await context.credentials.read(["access_token"]);
  const token = creds.access_token;
  if (!token) {
    throw new IntegrationRuntimeError("Google Calendar access token is not configured.", {
      code: "GCAL_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }
  return token;
}

async function executeGoogleCalendarAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_gcal_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        eventId: `gcal_evt_sim_${Date.now()}`,
        status: "confirmed",
        available: true,
        busySlots: [],
        timestamp: new Date().toISOString(),
      },
    };
  }

  const accessToken = await readAccessToken(invocation);

  const calendarId = typeof inputObj.calendarId === "string" && inputObj.calendarId.trim()
    ? inputObj.calendarId.trim()
    : "primary";

  switch (capabilityId) {
    case "google-calendar.availability.read": {
      const timeMin = extractString(inputObj, "timeMin", "Start time window (ISO string)");
      const timeMax = extractString(inputObj, "timeMax", "End time window (ISO string)");

      const res = await fetch(`https://www.googleapis.com/calendar/v3/freeBusy`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: calendarId }],
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to query Google Calendar freeBusy.", {
          code: "GCAL_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const busy = data.calendars?.[calendarId]?.busy || [];
      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: null,
        rateLimit: null,
        metadata: {
          mode: "live",
          available: busy.length === 0,
          busySlots: busy,
          calendarId,
        },
      };
    }

    case "google-calendar.event.create": {
      const summary = extractString(inputObj, "summary", "Event summary/title");
      const startTime = extractString(inputObj, "startTime", "Start time (ISO string)");
      const endTime = extractString(inputObj, "endTime", "End time (ISO string)");
      const description = typeof inputObj.description === "string" ? inputObj.description : "";
      const attendeeEmail = typeof inputObj.attendeeEmail === "string" ? inputObj.attendeeEmail : "";

      const body: Record<string, unknown> = {
        summary,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      };

      if (attendeeEmail) {
        body.attendees = [{ email: attendeeEmail }];
      }

      const res = await fetch(`${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to create Google Calendar event.", {
          code: "GCAL_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: null,
        rateLimit: null,
        metadata: {
          mode: "live",
          eventId: data.id,
          htmlLink: data.htmlLink,
          status: data.status,
          summary: data.summary,
        },
      };
    }

    case "google-calendar.event.update": {
      const eventId = extractString(inputObj, "eventId", "Google Calendar event ID");
      const summary = typeof inputObj.summary === "string" ? inputObj.summary : undefined;
      const startTime = typeof inputObj.startTime === "string" ? inputObj.startTime : undefined;
      const endTime = typeof inputObj.endTime === "string" ? inputObj.endTime : undefined;

      const patchBody: Record<string, unknown> = {};
      if (summary) patchBody.summary = summary;
      if (startTime) patchBody.start = { dateTime: startTime };
      if (endTime) patchBody.end = { dateTime: endTime };

      const res = await fetch(
        `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patchBody),
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to update Google Calendar event.", {
          code: "GCAL_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: null,
        rateLimit: null,
        metadata: {
          mode: "live",
          eventId: data.id,
          status: data.status,
          updated: data.updated,
        },
      };
    }

    case "google-calendar.event.cancel": {
      const eventId = extractString(inputObj, "eventId", "Google Calendar event ID");

      const res = await fetch(
        `${GCAL_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

      if (!res.ok && res.status !== 204 && res.status !== 410) {
        const data = await res.json().catch(() => ({}));
        throw new IntegrationRuntimeError(data.error?.message || "Failed to cancel Google Calendar event.", {
          code: "GCAL_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: null,
        rateLimit: null,
        metadata: {
          mode: "live",
          cancelled: true,
          eventId,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability '${capabilityId}' for Google Calendar adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkGoogleCalendarHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["access_token"]);
  const accessToken = creds.access_token;
  if (!accessToken) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Google Calendar access token is missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${GCAL_API_BASE}/users/me/calendarList?maxResults=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "google_calendar_primary",
        externalAccountLabel: "Google Calendar v3 API",
        metadata: {
          service: "Google Calendar v3 API",
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
        reason: `Google Calendar API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to Google Calendar API",
      },
    };
  }
}

export const GOOGLE_CALENDAR_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.google-calendar.runtime",
    adapterVersion: "1.0.0",
    providerId: "google-calendar",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "google-calendar.availability.read",
      "google-calendar.event.create",
      "google-calendar.event.update",
      "google-calendar.event.cancel",
    ].map((capabilityId) => ({
      capabilityId,
      kind: "action" as const,
      modes: ["simulate", "sandbox", "live"] as const,
      requiredScopes: [],
      supportsIdempotency: true,
    })),
    supportsHealthChecks: true,
    supportsTokenRefresh: true,
    supportsTokenRevocation: true,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxConcurrency: 10,
  },
  healthCheck: checkGoogleCalendarHealth,
  executeAction: executeGoogleCalendarAction,
  refreshAuthorization: (invocation) =>
    refreshGoogleOAuthAuthorization({
      providerId: "google-calendar",
      credentials: invocation.credentials,
      grantedScopes: invocation.grantedScopes,
      signal: invocation.signal,
    }),
  revokeAuthorization: (context) =>
    revokeGoogleOAuthAuthorization({
      credentials: context.credentials,
      signal: context.signal,
    }),
};
