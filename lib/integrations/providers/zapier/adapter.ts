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
      code: "INVALID_ZAPIER_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function executeZapierAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_zap_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        zapTriggered: true,
        executionId: `zap_exec_sim_${Date.now()}`,
        status: "success",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const creds = await invocation.credentials.read(["webhook_url", "api_key"]);
  const targetWebhook = (inputObj.webhook_url as string | undefined) || creds.webhook_url;

  if (!targetWebhook) {
    throw new IntegrationRuntimeError("Zapier webhook URL is required to trigger Zap.", {
      code: "ZAPIER_WEBHOOK_MISSING",
      category: "configuration",
      status: 400,
    });
  }

  switch (capabilityId) {
    case "zapier.trigger_zap": {
      const payload = inputObj.payload && isRecord(inputObj.payload) ? inputObj.payload : inputObj;

      const res = await fetch(targetWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError("Failed to trigger Zapier webhook.", {
          code: "ZAPIER_TRIGGER_FAILED",
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
        metadata: {
          mode: "live",
          status: data.status || "success",
          attempt: data.attempt || 1,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Zapier adapter.`, {
        code: "UNSUPPORTED_ZAPIER_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkZapierHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["webhook_url", "api_key"]);
  const hasWebhook = Boolean(creds.webhook_url || context.connection.publicConfiguration.webhook_url);

  return {
    healthy: hasWebhook,
    checkedAt: new Date().toISOString(),
    latencyMs: 1,
    externalAccountId: "zapier_hook",
    externalAccountLabel: "Zapier Automation Bridge",
    metadata: {
      configured: hasWebhook,
      reason: hasWebhook ? "Zapier webhook URL configured" : "Zapier webhook URL missing",
    },
  };
}

export const ZAPIER_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.zapier.runtime",
    adapterVersion: "1.0.0",
    providerId: "zapier",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "zapier.trigger_zap",
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
  healthCheck: checkZapierHealth,
  executeAction: executeZapierAction,
};
