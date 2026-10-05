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
const GRAPH_API_BASE = "https://graph.facebook.com/v19.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_MESSENGER_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readMessengerCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ pageToken: string; pageId?: string }> {
  const creds = await context.credentials.read(["access_token", "page_access_token", "page_id"]);
  const pageToken = creds.page_access_token || creds.access_token;

  if (!pageToken) {
    throw new IntegrationRuntimeError("Messenger page access token is missing.", {
      code: "MESSENGER_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { pageToken, pageId: creds.page_id };
}

async function executeMessengerAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_msg_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `msg_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { pageToken } = await readMessengerCredentials(invocation);

  switch (capabilityId) {
    case "messenger.send_message": {
      const recipientId = extractString(inputObj, "recipient_id", "recipient_id");
      const text = extractString(inputObj, "text", "Message Text");

      const res = await fetch(`${GRAPH_API_BASE}/me/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pageToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to send Messenger message.", {
          code: "MESSENGER_SEND_FAILED",
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

    case "messenger.send_quick_reply": {
      const recipientId = extractString(inputObj, "recipient_id", "recipient_id");
      const text = extractString(inputObj, "text", "Message Text");
      const quickReplies = Array.isArray(inputObj.quick_replies) ? inputObj.quick_replies : [
        { content_type: "text", title: "Yes", payload: "YES" },
        { content_type: "text", title: "No", payload: "NO" },
      ];

      const res = await fetch(`${GRAPH_API_BASE}/me/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pageToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: {
            text,
            quick_replies: quickReplies,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to send Messenger quick reply.", {
          code: "MESSENGER_QUICK_REPLY_FAILED",
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

    default:
      throw new IntegrationRuntimeError(`Unsupported capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkMessengerHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const { pageToken } = await readMessengerCredentials(context);

    const res = await fetch(`${GRAPH_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${pageToken}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const name = isRecord(data) && typeof data.name === "string" ? data.name : "Facebook Page";
    const id = isRecord(data) && typeof data.id === "string" ? data.id : "messenger_page";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: id,
      externalAccountLabel: name,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Messenger health check failed." },
    };
  }
}

export const MESSENGER_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.messenger.runtime",
    adapterVersion: "1.0.0",
    providerId: "messenger",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "messenger.send_message",
      "messenger.send_quick_reply",
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
  healthCheck: checkMessengerHealth,
  executeAction: executeMessengerAction,
};
