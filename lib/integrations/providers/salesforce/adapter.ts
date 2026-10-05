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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_SALESFORCE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readSalesforceCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; instanceUrl: string }> {
  const creds = await context.credentials.read(["access_token", "instance_url"]);
  const token = creds.access_token;
  const instanceUrl = creds.instance_url || "https://login.salesforce.com";

  if (!token) {
    throw new IntegrationRuntimeError("Salesforce OAuth access token is missing.", {
      code: "SALESFORCE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, instanceUrl };
}

async function executeSalesforceAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_sf_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `00Q${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const { token, instanceUrl } = await readSalesforceCredentials(invocation);

  switch (capabilityId) {
    case "salesforce.create_lead": {
      const lastName = extractString(inputObj, "last_name", "Lead Last Name");
      const company = typeof inputObj.company === "string" ? inputObj.company : "Self-Employed";

      const res = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Lead`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          LastName: lastName,
          Company: company,
          Email: inputObj.email,
          Phone: inputObj.phone,
          Description: inputObj.description,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data[0]?.message || "Failed to create Salesforce Lead.", {
          code: "SALESFORCE_LEAD_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.id || `sf_lead_${Date.now()}`,
        rateLimit: null,
        metadata: { leadId: data.id },
      };
    }

    case "salesforce.update_opportunity": {
      const opportunityId = extractString(inputObj, "opportunity_id", "Opportunity ID");

      const res = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Opportunity/${opportunityId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          StageName: inputObj.stage_name,
          Amount: inputObj.amount,
          CloseDate: inputObj.close_date,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new IntegrationRuntimeError(data[0]?.message || "Failed to update Salesforce Opportunity.", {
          code: "SALESFORCE_OPP_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: opportunityId,
        rateLimit: null,
        metadata: { opportunityId },
      };
    }

    case "salesforce.create_case": {
      const subject = extractString(inputObj, "subject", "Case Subject");

      const res = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Case`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Subject: subject,
          Description: inputObj.description,
          Priority: inputObj.priority || "Medium",
          Status: "New",
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data[0]?.message || "Failed to create Salesforce Case.", {
          code: "SALESFORCE_CASE_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.id || `sf_case_${Date.now()}`,
        rateLimit: null,
        metadata: { caseId: data.id },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported Salesforce capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkSalesforceHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "instance_url"]);
    const token = creds.access_token;
    const instanceUrl = creds.instance_url || "https://login.salesforce.com";

    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Salesforce access token missing." },
      };
    }

    const res = await fetch(`${instanceUrl}/services/data/v59.0/limits`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: context.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: res.ok ? "salesforce_org" : null,
      externalAccountLabel: res.ok ? "Salesforce Enterprise" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Salesforce health check failed." },
    };
  }
}

export const SALESFORCE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.salesforce.runtime",
    adapterVersion: "1.0.0",
    providerId: "salesforce",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "salesforce.create_lead",
      "salesforce.update_opportunity",
      "salesforce.create_case",
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
  healthCheck: checkSalesforceHealth,
  executeAction: executeSalesforceAction,
};
