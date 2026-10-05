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
const MINDBODY_API_BASE = "https://api.mindbodyonline.com/public/v6";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_MINDBODY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readMindbodyCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ apiKey: string; siteId: string; userToken?: string }> {
  const creds = await context.credentials.read(["api_key", "site_id", "access_token"]);
  const apiKey = creds.api_key;
  const siteId = creds.site_id || "-99";
  const userToken = creds.access_token;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Mindbody API key is missing.", {
      code: "MINDBODY_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { apiKey, siteId, userToken };
}

async function executeMindbodyAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_mindbody_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `mindbody_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { apiKey, siteId, userToken } = await readMindbodyCredentials(invocation);

  const baseHeaders: Record<string, string> = {
    "Api-Key": apiKey,
    SiteId: siteId,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (userToken) {
    baseHeaders.Authorization = `Bearer ${userToken}`;
  }

  switch (capabilityId) {
    case "mindbody.book_class": {
      const clientId = extractString(inputObj, "client_id", "Client ID");
      const classId = typeof inputObj.class_id === "number" ? inputObj.class_id : parseInt(String(inputObj.class_id || "0"), 10);

      if (!classId) {
        throw new IntegrationRuntimeError("Valid Class ID is required.", {
          code: "INVALID_MINDBODY_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const payload = {
        ClientId: clientId,
        ClassId: classId,
        SendEmail: inputObj.send_email !== false,
      };

      const res = await fetch(`${MINDBODY_API_BASE}/class/addclienttoclass`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Mindbody class booking failed: ${res.statusText}`, {
          code: "MINDBODY_BOOKING_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const visitId = isRecord(data) && data.Visit ? (data.Visit as Record<string, unknown>).Id : `visit_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(visitId),
        rateLimit: null,
        metadata: {
          visitId,
          clientId,
          classId,
        },
      };
    }

    case "mindbody.check_in_client": {
      const clientId = extractString(inputObj, "client_id", "Client ID");
      const classId = typeof inputObj.class_id === "number" ? inputObj.class_id : parseInt(String(inputObj.class_id || "0"), 10);

      const payload = {
        ClientId: clientId,
        ClassId: classId,
        SignedIn: true,
      };

      const res = await fetch(`${MINDBODY_API_BASE}/class/updateclientvisit`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Mindbody check-in failed: ${res.statusText}`, {
          code: "MINDBODY_CHECKIN_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `checkin_${Date.now()}`,
        rateLimit: null,
        metadata: {
          clientId,
          classId,
          checkedIn: true,
        },
      };
    }

    case "mindbody.sync_schedule": {
      const startDate = typeof inputObj.start_date === "string" ? inputObj.start_date : new Date().toISOString().split("T")[0];
      const endDate = typeof inputObj.end_date === "string" ? inputObj.end_date : startDate;

      const url = new URL(`${MINDBODY_API_BASE}/class/classes`);
      url.searchParams.set("StartDateTime", startDate);
      url.searchParams.set("EndDateTime", endDate);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: baseHeaders,
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Mindbody schedule sync failed: ${res.statusText}`, {
          code: "MINDBODY_SCHEDULE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const classes = isRecord(data) && Array.isArray(data.Classes) ? data.Classes : [];

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `sync_${Date.now()}`,
        rateLimit: null,
        metadata: {
          classesCount: classes.length,
          startDate,
          endDate,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Mindbody adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkMindbodyHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["api_key", "site_id"]);
    if (!creds.api_key) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing API key" },
      };
    }

    const res = await fetch(`${MINDBODY_API_BASE}/site/sites`, {
      method: "GET",
      headers: {
        "Api-Key": creds.api_key,
        SiteId: creds.site_id || "-99",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: creds.site_id || "mindbody_site",
      externalAccountLabel: res.ok ? "Mindbody Wellness" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Mindbody health check failed." },
    };
  }
}

export const MINDBODY_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.mindbody.runtime",
    adapterVersion: "1.0.0",
    providerId: "mindbody",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "mindbody.book_class",
      "mindbody.check_in_client",
      "mindbody.sync_schedule",
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
  healthCheck: checkMindbodyHealth,
  executeAction: executeMindbodyAction,
};
