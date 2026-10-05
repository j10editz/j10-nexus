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

async function executeN8nAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_n8n_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        workflowTriggered: true,
        executionId: `n8n_exec_sim_${Date.now()}`,
        status: "success",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const creds = await invocation.credentials.read(["webhook_url", "api_key", "base_url"]);
  const targetWebhook = (inputObj.webhook_url as string | undefined) || creds.webhook_url;

  switch (capabilityId) {
    case "n8n.execute_workflow":
    case "n8n.send_webhook_payload": {
      if (!targetWebhook) {
        throw new IntegrationRuntimeError("n8n webhook URL is required to trigger workflow.", {
          code: "N8N_WEBHOOK_MISSING",
          category: "configuration",
          status: 400,
        });
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (creds.api_key) {
        headers["X-N8N-API-KEY"] = creds.api_key;
      }

      const payload = inputObj.payload && isRecord(inputObj.payload) ? inputObj.payload : inputObj;

      const res = await fetch(targetWebhook, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({ status: "accepted" }));

      return {
        success: res.ok,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          status: res.ok ? "success" : "failed",
          data,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for n8n adapter.`, {
        code: "UNSUPPORTED_N8N_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkN8nHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["webhook_url", "api_key", "base_url"]);
  const hasConfig = Boolean(creds.webhook_url || creds.api_key || context.connection.publicConfiguration.webhook_url);

  return {
    healthy: hasConfig,
    checkedAt: new Date().toISOString(),
    latencyMs: 1,
    externalAccountId: "n8n_self_hosted",
    externalAccountLabel: "n8n Fair-Code Automation",
    metadata: {
      configured: hasConfig,
      reason: hasConfig ? "n8n connection configured" : "n8n webhook or API credentials missing",
    },
  };
}

export const N8N_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.n8n.runtime",
    adapterVersion: "1.0.0",
    providerId: "n8n",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "n8n.execute_workflow",
      "n8n.send_webhook_payload",
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
  healthCheck: checkN8nHealth,
  executeAction: executeN8nAction,
};
