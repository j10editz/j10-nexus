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
const TRELLO_API_BASE = "https://api.trello.com/1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_TRELLO_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readTrelloCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; apiKey?: string }> {
  const creds = await context.credentials.read(["access_token", "api_key", "token"]);
  const token = creds.access_token || creds.token;
  const apiKey = creds.api_key;

  if (!token) {
    throw new IntegrationRuntimeError("Trello API token is missing.", {
      code: "TRELLO_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, apiKey };
}

async function executeTrelloAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_trello_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `trello_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, apiKey } = await readTrelloCredentials(invocation);
  const authParams = apiKey ? `key=${encodeURIComponent(apiKey)}&token=${encodeURIComponent(token)}` : `token=${encodeURIComponent(token)}`;

  switch (capabilityId) {
    case "trello.create_card": {
      const listId = extractString(inputObj, "list_id", "List ID");
      const name = extractString(inputObj, "name", "Card name");
      const desc = typeof inputObj.desc === "string" ? inputObj.desc : "";

      const res = await fetch(`${TRELLO_API_BASE}/cards?${authParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idList: listId,
          name,
          desc,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Trello card creation failed: ${res.statusText}`, {
          code: "TRELLO_CARD_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const cardId = isRecord(data) && data.id ? String(data.id) : `card_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: cardId,
        rateLimit: null,
        metadata: {
          cardId,
          name,
          url: isRecord(data) && data.url ? data.url : null,
        },
      };
    }

    case "trello.move_card": {
      const cardId = extractString(inputObj, "card_id", "Card ID");
      const targetListId = extractString(inputObj, "target_list_id", "Target List ID");

      const res = await fetch(`${TRELLO_API_BASE}/cards/${encodeURIComponent(cardId)}?${authParams}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idList: targetListId,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Trello card move failed: ${res.statusText}`, {
          code: "TRELLO_MOVE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: cardId,
        rateLimit: null,
        metadata: {
          cardId,
          targetListId,
          moved: true,
        },
      };
    }

    case "trello.add_comment": {
      const cardId = extractString(inputObj, "card_id", "Card ID");
      const text = extractString(inputObj, "text", "Comment text");

      const res = await fetch(`${TRELLO_API_BASE}/cards/${encodeURIComponent(cardId)}/actions/comments?${authParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Trello comment addition failed: ${res.statusText}`, {
          code: "TRELLO_COMMENT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const commentId = isRecord(data) && data.id ? String(data.id) : `comment_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: commentId,
        rateLimit: null,
        metadata: {
          cardId,
          commentId,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Trello adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkTrelloHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_key", "token"]);
    const token = creds.access_token || creds.token;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing token" },
      };
    }

    const authParams = creds.api_key ? `key=${encodeURIComponent(creds.api_key)}&token=${encodeURIComponent(token)}` : `token=${encodeURIComponent(token)}`;
    const res = await fetch(`${TRELLO_API_BASE}/members/me?${authParams}`, {
      method: "GET",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const fullName = isRecord(data) && typeof data.fullName === "string" ? data.fullName : "Trello Member";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && data.id ? String(data.id) : "trello_member",
      externalAccountLabel: fullName,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Trello health check failed." },
    };
  }
}

export const TRELLO_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.trello.runtime",
    adapterVersion: "1.0.0",
    providerId: "trello",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "trello.create_card",
      "trello.move_card",
      "trello.add_comment",
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
  healthCheck: checkTrelloHealth,
  executeAction: executeTrelloAction,
};
