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
const JOTFORM_API_BASE = "https://api.jotform.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_JOTFORM_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readJotformCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ apiKey: string }> {
  const creds = await context.credentials.read(["access_token", "api_key"]);
  const apiKey = creds.api_key || creds.access_token;

  if (!apiKey) {
    throw new IntegrationRuntimeError("Jotform API key is missing.", {
      code: "JOTFORM_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { apiKey };
}

async function executeJotformAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_jf_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `jf_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { apiKey } = await readJotformCredentials(invocation);

  switch (capabilityId) {
    case "jotform.retrieve_submission": {
      const submissionId = inputObj.submission_id ?? inputObj.id;
      if (!submissionId) {
        throw new IntegrationRuntimeError("submission_id is required.", {
          code: "INVALID_JOTFORM_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${JOTFORM_API_BASE}/submission/${encodeURIComponent(String(submissionId))}?apiKey=${encodeURIComponent(apiKey)}`, {
        method: "GET",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data?.responseCode && data.responseCode !== 200)) {
        throw new IntegrationRuntimeError(data?.message || "Failed to retrieve Jotform submission.", {
          code: "JOTFORM_SUBMISSION_FAILED",
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
        metadata: data?.content || data,
      };
    }

    case "jotform.send_pre_filled_form": {
      const formId = extractString(inputObj, "form_id", "form_id");
      const prefills = isRecord(inputObj.prefills) ? inputObj.prefills : {};

      const queryParams = new URLSearchParams();
      for (const [k, v] of Object.entries(prefills)) {
        if (v !== undefined && v !== null) {
          queryParams.set(k, String(v));
        }
      }

      const queryString = queryParams.toString();
      const formUrl = `https://form.jotform.com/${encodeURIComponent(formId)}${queryString ? `?${queryString}` : ""}`;

      return {
        success: true,
        responseStatus: 200,
        providerRequestId: `gen_jf_${Date.now()}`,
        rateLimit: null,
        metadata: {
          formId,
          formUrl,
          prefills,
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

async function checkJotformHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const { apiKey } = await readJotformCredentials(context);

    const res = await fetch(`${JOTFORM_API_BASE}/user?apiKey=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const content = isRecord(data) && isRecord(data.content) ? data.content : null;
    const username = content && typeof content.username === "string" ? content.username : "Jotform User";
    const email = content && typeof content.email === "string" ? content.email : username;

    return {
      healthy: res.ok && (!data?.responseCode || data.responseCode === 200),
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: username,
      externalAccountLabel: email,
      metadata: { responseCode: data?.responseCode },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Jotform health check failed." },
    };
  }
}

export const JOTFORM_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.jotform.runtime",
    adapterVersion: "1.0.0",
    providerId: "jotform",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "jotform.retrieve_submission",
      "jotform.send_pre_filled_form",
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
  healthCheck: checkJotformHealth,
  executeAction: executeJotformAction,
};
