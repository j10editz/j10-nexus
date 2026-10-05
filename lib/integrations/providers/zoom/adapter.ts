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
const ZOOM_API_BASE = "https://api.zoom.us/v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_ZOOM_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readZoomCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string }> {
  const creds = await context.credentials.read(["access_token"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Zoom OAuth access token is missing.", {
      code: "ZOOM_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token };
}

async function executeZoomAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_zoom_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `zoom_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readZoomCredentials(invocation);

  switch (capabilityId) {
    case "zoom.create_meeting": {
      const topic = extractString(inputObj, "topic", "Meeting topic");
      const startTime = typeof inputObj.start_time === "string" ? inputObj.start_time : new Date(Date.now() + 3600000).toISOString();
      const duration = typeof inputObj.duration === "number" ? inputObj.duration : 30;
      const agenda = typeof inputObj.agenda === "string" ? inputObj.agenda : "Scheduled via J10 Nexus";

      const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic,
          type: 2, // Scheduled meeting
          start_time: startTime,
          duration,
          agenda,
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            mute_upon_entry: true,
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Zoom meeting creation failed: ${res.statusText}`, {
          code: "ZOOM_MEETING_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const meetingId = isRecord(data) && data.id ? String(data.id) : `zoom_${Date.now()}`;
      const joinUrl = isRecord(data) && typeof data.join_url === "string" ? data.join_url : null;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: meetingId,
        rateLimit: null,
        metadata: {
          meetingId,
          topic,
          joinUrl,
          startTime,
        },
      };
    }

    case "zoom.update_meeting": {
      const meetingId = extractString(inputObj, "meeting_id", "Meeting ID");
      const topic = typeof inputObj.topic === "string" ? inputObj.topic : undefined;
      const startTime = typeof inputObj.start_time === "string" ? inputObj.start_time : undefined;
      const duration = typeof inputObj.duration === "number" ? inputObj.duration : undefined;

      const payload: Record<string, unknown> = {};
      if (topic) payload.topic = topic;
      if (startTime) payload.start_time = startTime;
      if (duration) payload.duration = duration;

      const res = await fetch(`${ZOOM_API_BASE}/meetings/${encodeURIComponent(meetingId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new IntegrationRuntimeError(`Zoom meeting update failed: ${res.statusText}`, {
          code: "ZOOM_UPDATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: 204,
        providerRequestId: meetingId,
        rateLimit: null,
        metadata: {
          meetingId,
          updated: true,
        },
      };
    }

    case "zoom.cancel_meeting": {
      const meetingId = extractString(inputObj, "meeting_id", "Meeting ID");

      const res = await fetch(`${ZOOM_API_BASE}/meetings/${encodeURIComponent(meetingId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new IntegrationRuntimeError(`Zoom meeting cancellation failed: ${res.statusText}`, {
          code: "ZOOM_CANCEL_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: 204,
        providerRequestId: meetingId,
        rateLimit: null,
        metadata: {
          meetingId,
          cancelled: true,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Zoom adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkZoomHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token"]);
    if (!creds.access_token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing access token" },
      };
    }

    const res = await fetch(`${ZOOM_API_BASE}/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const email = isRecord(data) && typeof data.email === "string" ? data.email : "Zoom Account";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && data.id ? String(data.id) : "zoom_user",
      externalAccountLabel: email,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Zoom health check failed." },
    };
  }
}

export const ZOOM_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.zoom.runtime",
    adapterVersion: "1.0.0",
    providerId: "zoom",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "zoom.create_meeting",
      "zoom.update_meeting",
      "zoom.cancel_meeting",
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
  healthCheck: checkZoomHealth,
  executeAction: executeZoomAction,
};
