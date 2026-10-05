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
const HOUSECALL_API_BASE = "https://api.housecallpro.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_HOUSECALL_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readHousecallCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string }> {
  const creds = await context.credentials.read(["access_token", "api_key"]);
  const token = creds.access_token || creds.api_key;

  if (!token) {
    throw new IntegrationRuntimeError("Housecall Pro API token is missing.", {
      code: "HOUSECALL_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token };
}

async function executeHousecallProAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_hcp_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `hcp_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readHousecallCredentials(invocation);

  switch (capabilityId) {
    case "housecall-pro.create_job": {
      const customerId = extractString(inputObj, "customer_id", "Customer ID");
      const description = typeof inputObj.description === "string" ? inputObj.description : "Standard Service Job";
      const scheduledStart = typeof inputObj.scheduled_start === "string" ? inputObj.scheduled_start : new Date().toISOString();

      const payload = {
        customer_id: customerId,
        description,
        schedule: {
          scheduled_start: scheduledStart,
        },
        line_items: Array.isArray(inputObj.line_items) ? inputObj.line_items : [],
      };

      const res = await fetch(`${HOUSECALL_API_BASE}/jobs`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Housecall Pro job creation failed: ${res.statusText}`, {
          code: "HOUSECALL_JOB_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const jobId = isRecord(data) && data.id ? String(data.id) : `hcp_job_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: jobId,
        rateLimit: null,
        metadata: {
          jobId,
          customerId,
        },
      };
    }

    case "housecall-pro.send_on_my_way_text": {
      const jobId = extractString(inputObj, "job_id", "Job ID");
      const etaMinutes = typeof inputObj.eta_minutes === "number" ? inputObj.eta_minutes : 30;

      const payload = {
        eta_minutes: etaMinutes,
      };

      const res = await fetch(`${HOUSECALL_API_BASE}/jobs/${encodeURIComponent(jobId)}/on_my_way`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Housecall Pro dispatch text failed: ${res.statusText}`, {
          code: "HOUSECALL_DISPATCH_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `disp_${Date.now()}`,
        rateLimit: null,
        metadata: {
          jobId,
          etaMinutes,
          dispatched: true,
        },
      };
    }

    case "housecall-pro.create_estimate": {
      const customerId = extractString(inputObj, "customer_id", "Customer ID");
      const title = extractString(inputObj, "title", "Estimate title");
      const totalAmount = typeof inputObj.total_amount === "number" ? inputObj.total_amount : 0;

      const payload = {
        customer_id: customerId,
        name: title,
        total_amount: totalAmount,
      };

      const res = await fetch(`${HOUSECALL_API_BASE}/estimates`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Housecall Pro estimate creation failed: ${res.statusText}`, {
          code: "HOUSECALL_ESTIMATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const estimateId = isRecord(data) && data.id ? String(data.id) : `est_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: estimateId,
        rateLimit: null,
        metadata: {
          estimateId,
          customerId,
          totalAmount,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Housecall Pro adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkHousecallProHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_key"]);
    const token = creds.access_token || creds.api_key;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing API token" },
      };
    }

    const res = await fetch(`${HOUSECALL_API_BASE}/company`, {
      method: "GET",
      headers: {
        Authorization: `Token ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: res.ok ? "housecall_company" : null,
      externalAccountLabel: res.ok ? "Housecall Pro" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Housecall Pro health check failed." },
    };
  }
}

export const HOUSECALL_PRO_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.housecall-pro.runtime",
    adapterVersion: "1.0.0",
    providerId: "housecall-pro",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "housecall-pro.create_job",
      "housecall-pro.send_on_my_way_text",
      "housecall-pro.create_estimate",
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
  healthCheck: checkHousecallProHealth,
  executeAction: executeHousecallProAction,
};
