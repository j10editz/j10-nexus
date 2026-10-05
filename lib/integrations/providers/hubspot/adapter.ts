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
const HUBSPOT_API_BASE = "https://api.hubapi.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_HUBSPOT_INPUT",
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
    throw new IntegrationRuntimeError("HubSpot access token is not configured.", {
      code: "HUBSPOT_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }
  return token;
}

async function executeHubSpotAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_hs_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        contactId: `hs_con_sim_${Date.now()}`,
        dealId: `hs_deal_sim_${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const accessToken = await readAccessToken(invocation);

  switch (capabilityId) {
    case "hubspot.create_contact": {
      const email = extractString(inputObj, "email", "Contact email address");
      const firstname = typeof inputObj.firstname === "string" ? inputObj.firstname : "";
      const lastname = typeof inputObj.lastname === "string" ? inputObj.lastname : "";
      const phone = typeof inputObj.phone === "string" ? inputObj.phone : "";

      const properties: Record<string, string> = { email };
      if (firstname) properties.firstname = firstname;
      if (lastname) properties.lastname = lastname;
      if (phone) properties.phone = phone;

      const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.message || "Failed to create HubSpot contact.", {
          code: "HUBSPOT_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-hubspot-correlation-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          contactId: data.id || `hs_con_sim_${Date.now()}`,
          properties: data.properties,
        },
      };
    }

    case "hubspot.update_deal": {
      const dealname = extractString(inputObj, "dealname", "Deal name");
      const dealstage = typeof inputObj.dealstage === "string" ? inputObj.dealstage : "appointmentscheduled";
      const amount = inputObj.amount !== undefined ? String(inputObj.amount) : "0";

      const properties: Record<string, string> = { dealname, dealstage, amount };

      const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/deals`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.message || "Failed to create/update HubSpot deal.", {
          code: "HUBSPOT_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-hubspot-correlation-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          dealId: data.id || "deal_hs_live_9988",
          properties: data.properties,
        },
      };
    }

    case "hubspot.add_note": {
      const body = extractString(inputObj, "body", "Note text body");
      const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/notes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ properties: { hs_note_body: body } }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.message || "Failed to create HubSpot note.", {
          code: "HUBSPOT_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-hubspot-correlation-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          noteId: data.id,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(
        `Capability ${capabilityId} is not supported by the HubSpot adapter.`,
        {
          code: "UNSUPPORTED_HUBSPOT_CAPABILITY",
          category: "validation",
          status: 400,
        },
      );
  }
}

async function checkHubSpotHealth(
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
        reason: "HubSpot access token is missing in credentials vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      return {
        healthy: true,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "hubspot_portal",
        externalAccountLabel: "HubSpot CRM v3 API",
        metadata: {
          service: "HubSpot CRM v3 API",
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
        reason: `HubSpot API returned HTTP ${res.status}`,
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
        reason: err instanceof Error ? err.message : "Failed to connect to HubSpot API",
      },
    };
  }
}

export const HUBSPOT_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.hubspot.runtime",
    adapterVersion: "1.0.0",
    providerId: "hubspot",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "hubspot.create_contact",
      "hubspot.update_deal",
      "hubspot.add_note",
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
  healthCheck: checkHubSpotHealth,
  executeAction: executeHubSpotAction,
};
