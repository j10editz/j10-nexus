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
const SLACK_API_BASE = "https://slack.com/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_SLACK_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readSlackToken(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["bot_token", "access_token"]);
  const token = creds.bot_token || creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Slack Bot User OAuth Token is missing.", {
      code: "SLACK_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return token;
}

async function executeSlackAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_slack_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        channel: typeof inputObj.channel === "string" ? inputObj.channel : "C12345678",
        messageTs: `${Date.now() / 1000}.000100`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const token = await readSlackToken(invocation);

  switch (capabilityId) {
    case "slack.send_message": {
      const channel = extractString(inputObj, "channel", "Slack Channel ID");
      const text = extractString(inputObj, "text", "Message text");

      const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel,
          text,
          blocks: Array.isArray(inputObj.blocks) ? inputObj.blocks : undefined,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new IntegrationRuntimeError(data.error || "Failed to post message to Slack.", {
          code: "SLACK_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.ts || `slack_${Date.now()}`,
        rateLimit: null,
        metadata: {
          channel: data.channel,
          ts: data.ts,
          message: data.message,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported Slack capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkSlackHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["bot_token", "access_token"]);
    const token = creds.bot_token || creds.access_token;

    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Slack Bot User OAuth Token missing." },
      };
    }

    const res = await fetch(`${SLACK_API_BASE}/auth.test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: context.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    if (!res.ok || data.ok === false) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: latency,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: data.error || "Slack auth.test rejected credentials." },
      };
    }

    return {
      healthy: true,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: data.user_id || "slack_bot",
      externalAccountLabel: data.team || "Slack Workspace",
      metadata: { url: data.url },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Slack health check failed." },
    };
  }
}

export const SLACK_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.slack.runtime",
    adapterVersion: "1.0.0",
    providerId: "slack",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "slack.send_message",
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
  healthCheck: checkSlackHealth,
  executeAction: executeSlackAction,
};
