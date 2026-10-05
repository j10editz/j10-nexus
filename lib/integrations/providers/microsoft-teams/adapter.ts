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
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_TEAMS_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readTeamsCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token?: string; webhookUrl?: string }> {
  const creds = await context.credentials.read(["access_token", "webhook_url"]);
  return {
    token: creds.access_token,
    webhookUrl: creds.webhook_url,
  };
}

async function executeTeamsAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_teams_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        content: typeof inputObj.content === "string" ? inputObj.content : "Simulated Teams dispatch.",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const { token, webhookUrl } = await readTeamsCredentials(invocation);

  switch (capabilityId) {
    case "microsoft-teams.send_channel_message": {
      const content = extractString(inputObj, "content", "Message content");

      if (webhookUrl) {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "@type": "MessageCard",
            summary: content,
            sections: [{ text: content }],
          }),
          signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!res.ok) {
          throw new IntegrationRuntimeError("Failed to post message to Teams Webhook.", {
            code: "TEAMS_WEBHOOK_ERROR",
            category: "provider",
            status: res.status,
          });
        }

        return {
          success: true,
          responseStatus: res.status,
          providerRequestId: `teams_hook_${Date.now()}`,
          rateLimit: null,
          metadata: { deliveredVia: "webhook" },
        };
      }

      if (!token) {
        throw new IntegrationRuntimeError("Microsoft Teams access token or webhook_url is required.", {
          code: "TEAMS_AUTH_MISSING",
          category: "authentication",
          status: 401,
        });
      }

      const teamId = extractString(inputObj, "team_id", "Team ID");
      const channelId = extractString(inputObj, "channel_id", "Channel ID");

      const res = await fetch(`${GRAPH_API_BASE}/teams/${teamId}/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: { content, contentType: "html" },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to post message to Microsoft Teams.", {
          code: "TEAMS_API_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.id || `teams_${Date.now()}`,
        rateLimit: null,
        metadata: { messageId: data.id },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported Microsoft Teams capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkTeamsHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const { token, webhookUrl } = await readTeamsCredentials(context);
    if (!token && !webhookUrl) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "No access token or incoming webhook configured." },
      };
    }

    if (token) {
      const res = await fetch(`${GRAPH_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: context.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const latency = Date.now() - started;
      return {
        healthy: res.ok,
        checkedAt: new Date().toISOString(),
        latencyMs: latency,
        externalAccountId: res.ok ? "teams_user" : null,
        externalAccountLabel: res.ok ? "Microsoft Graph" : null,
        metadata: { status: res.status },
      };
    }

    return {
      healthy: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: "teams_webhook",
      externalAccountLabel: "Incoming Webhook",
      metadata: { webhook: true },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Teams health check failed." },
    };
  }
}

export const MICROSOFT_TEAMS_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.microsoft-teams.runtime",
    adapterVersion: "1.0.0",
    providerId: "microsoft-teams",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "microsoft-teams.send_channel_message",
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
  healthCheck: checkTeamsHealth,
  executeAction: executeTeamsAction,
};
