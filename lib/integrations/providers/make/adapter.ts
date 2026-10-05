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

async function executeMakeAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_make_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        scenarioTriggered: true,
        executionId: `make_exec_sim_${Date.now()}`,
        status: "accepted",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const creds = await invocation.credentials.read(["webhook_url", "api_key"]);
  const targetWebhook = (inputObj.webhook_url as string | undefined) || creds.webhook_url;

  if (!targetWebhook) {
    throw new IntegrationRuntimeError("Make webhook URL is required to trigger scenario.", {
      code: "MAKE_WEBHOOK_MISSING",
      category: "configuration",
      status: 400,
    });
  }

  switch (capabilityId) {
    case "make.trigger_scenario": {
      const payload = inputObj.payload && isRecord(inputObj.payload) ? inputObj.payload : inputObj;

      const res = await fetch(targetWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const text = await res.text().catch(() => "Accepted");

      return {
        success: res.ok,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          mode: "live",
          response: text,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Make adapter.`, {
        code: "UNSUPPORTED_MAKE_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkMakeHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["webhook_url", "api_key"]);
  const hasWebhook = Boolean(creds.webhook_url || context.connection.publicConfiguration.webhook_url);

  return {
    healthy: hasWebhook,
    checkedAt: new Date().toISOString(),
    latencyMs: 1,
    externalAccountId: "make_hook",
    externalAccountLabel: "Make Scenario Automation",
    metadata: {
      configured: hasWebhook,
      reason: hasWebhook ? "Make webhook URL configured" : "Make webhook URL missing",
    },
  };
}

export const MAKE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.make.runtime",
    adapterVersion: "1.0.0",
    providerId: "make",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "make.trigger_scenario",
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
  healthCheck: checkMakeHealth,
  executeAction: executeMakeAction,
};
