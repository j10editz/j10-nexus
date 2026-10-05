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
const X_API_BASE = "https://api.twitter.com/2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_X_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readXCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; userId?: string }> {
  const creds = await context.credentials.read(["access_token", "user_id"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("X access token is missing.", {
      code: "X_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, userId: creds.user_id };
}

async function executeXAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_x_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `x_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readXCredentials(invocation);

  switch (capabilityId) {
    case "x.publish_post": {
      const text = extractString(inputObj, "text", "Post Text");

      const bodyPayload: Record<string, unknown> = {
        text,
      };

      if (Array.isArray(inputObj.media_ids) && inputObj.media_ids.length > 0) {
        bodyPayload.media = {
          media_ids: inputObj.media_ids,
        };
      }

      if (typeof inputObj.reply_settings === "string") {
        bodyPayload.reply_settings = inputObj.reply_settings;
      }

      const res = await fetch(`${X_API_BASE}/tweets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.detail || data?.title || "Failed to publish post to X.", {
          code: "X_POST_FAILED",
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

    case "x.reply_to_post": {
      const text = extractString(inputObj, "text", "Reply Text");
      const inReplyToTweetId = typeof inputObj.tweet_id === "string" && inputObj.tweet_id.trim()
        ? inputObj.tweet_id.trim()
        : typeof inputObj.post_id === "string" && inputObj.post_id.trim()
        ? inputObj.post_id.trim()
        : "";

      if (!inReplyToTweetId) {
        throw new IntegrationRuntimeError("tweet_id or post_id is required.", {
          code: "INVALID_X_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${X_API_BASE}/tweets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          reply: {
            in_reply_to_tweet_id: inReplyToTweetId,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.detail || data?.title || "Failed to reply to post on X.", {
          code: "X_REPLY_FAILED",
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

    case "x.send_direct_message": {
      const text = extractString(inputObj, "text", "Direct Message Text");
      const participantId = typeof inputObj.recipient_id === "string" && inputObj.recipient_id.trim()
        ? inputObj.recipient_id.trim()
        : typeof inputObj.participant_id === "string" && inputObj.participant_id.trim()
        ? inputObj.participant_id.trim()
        : "";

      if (!participantId) {
        throw new IntegrationRuntimeError("recipient_id or participant_id is required.", {
          code: "INVALID_X_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${X_API_BASE}/dm_conversations/with_participant/${encodeURIComponent(participantId)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            text,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.detail || data?.title || "Failed to send Direct Message on X.", {
          code: "X_DM_FAILED",
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

async function checkXHealth(
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

    const res = await fetch(`${X_API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const user = isRecord(data) && isRecord(data.data) ? data.data : null;
    const username = user && typeof user.username === "string" ? `@${user.username}` : "X Account";
    const userId = user && typeof user.id === "string" ? user.id : "x_user";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: userId,
      externalAccountLabel: username,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "X health check failed." },
    };
  }
}

export const X_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.x.runtime",
    adapterVersion: "1.0.0",
    providerId: "x",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "x.publish_post",
      "x.reply_to_post",
      "x.send_direct_message",
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
  healthCheck: checkXHealth,
  executeAction: executeXAction,
};
