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
const TYPEFORM_API_BASE = "https://api.typeform.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_TYPEFORM_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readTypeformCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; accountId?: string }> {
  const creds = await context.credentials.read(["access_token", "account_id"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Typeform access token is missing.", {
      code: "TYPEFORM_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, accountId: creds.account_id };
}

async function executeTypeformAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_tf_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `tf_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readTypeformCredentials(invocation);

  switch (capabilityId) {
    case "typeform.fetch_submission_data": {
      const formId = extractString(inputObj, "form_id", "form_id");
      const pageSize = typeof inputObj.page_size === "number" ? inputObj.page_size : 25;

      const res = await fetch(`${TYPEFORM_API_BASE}/forms/${encodeURIComponent(formId)}/responses?page_size=${pageSize}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.description || "Failed to fetch Typeform submission data.", {
          code: "TYPEFORM_FETCH_FAILED",
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

    case "typeform.generate_form_link": {
      const formId = extractString(inputObj, "form_id", "form_id");
      const hiddenFields = isRecord(inputObj.hidden_fields) ? inputObj.hidden_fields : {};

      const queryParams = new URLSearchParams();
      for (const [k, v] of Object.entries(hiddenFields)) {
        if (v !== undefined && v !== null) {
          queryParams.set(k, String(v));
        }
      }

      const queryString = queryParams.toString();
      const formUrl = `https://form.typeform.com/to/${encodeURIComponent(formId)}${queryString ? `?${queryString}` : ""}`;

      return {
        success: true,
        responseStatus: 200,
        providerRequestId: `gen_tf_${Date.now()}`,
        rateLimit: null,
        metadata: {
          formId,
          formUrl,
          hiddenFields,
        },
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

async function checkTypeformHealth(
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

    const res = await fetch(`${TYPEFORM_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const alias = isRecord(data) && typeof data.alias === "string" ? data.alias : "Typeform User";
    const email = isRecord(data) && typeof data.email === "string" ? data.email : alias;
    const accountId = isRecord(data) && typeof data.user_id === "string" ? data.user_id : "typeform_account";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: accountId,
      externalAccountLabel: email,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Typeform health check failed." },
    };
  }
}

export const TYPEFORM_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.typeform.runtime",
    adapterVersion: "1.0.0",
    providerId: "typeform",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "typeform.fetch_submission_data",
      "typeform.generate_form_link",
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
  healthCheck: checkTypeformHealth,
  executeAction: executeTypeformAction,
};
