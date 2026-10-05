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
const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_CLICKUP_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readClickUpCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string }> {
  const creds = await context.credentials.read(["access_token", "api_token", "token"]);
  const token = creds.access_token || creds.api_token || creds.token;

  if (!token) {
    throw new IntegrationRuntimeError("ClickUp Personal API token or OAuth token is missing.", {
      code: "CLICKUP_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token };
}

async function executeClickUpAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_clickup_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `cu_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readClickUpCredentials(invocation);

  switch (capabilityId) {
    case "clickup.create_task": {
      const listId = extractString(inputObj, "list_id", "List ID");
      const name = extractString(inputObj, "name", "Task name");
      const description = typeof inputObj.description === "string" ? inputObj.description : "";
      const priority = typeof inputObj.priority === "number" ? inputObj.priority : 3;

      const res = await fetch(`${CLICKUP_API_BASE}/list/${encodeURIComponent(listId)}/task`, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          priority,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`ClickUp task creation failed: ${res.statusText}`, {
          code: "CLICKUP_TASK_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const taskId = isRecord(data) && data.id ? String(data.id) : `task_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: taskId,
        rateLimit: null,
        metadata: {
          taskId,
          name,
          url: isRecord(data) && data.url ? data.url : null,
        },
      };
    }

    case "clickup.update_task": {
      const taskId = extractString(inputObj, "task_id", "Task ID");
      const payload: Record<string, unknown> = {};

      if (typeof inputObj.name === "string") payload.name = inputObj.name;
      if (typeof inputObj.description === "string") payload.description = inputObj.description;
      if (typeof inputObj.status === "string") payload.status = inputObj.status;

      const res = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}`, {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`ClickUp task update failed: ${res.statusText}`, {
          code: "CLICKUP_UPDATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: taskId,
        rateLimit: null,
        metadata: {
          taskId,
          updated: true,
        },
      };
    }

    case "clickup.add_comment": {
      const taskId = extractString(inputObj, "task_id", "Task ID");
      const commentText = extractString(inputObj, "comment_text", "Comment text");

      const res = await fetch(`${CLICKUP_API_BASE}/task/${encodeURIComponent(taskId)}/comment`, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment_text: commentText,
          notify_all: inputObj.notify_all === true,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`ClickUp comment addition failed: ${res.statusText}`, {
          code: "CLICKUP_COMMENT_FAILED",
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
          taskId,
          commentId,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for ClickUp adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkClickUpHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_token", "token"]);
    const token = creds.access_token || creds.api_token || creds.token;
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

    const res = await fetch(`${CLICKUP_API_BASE}/user`, {
      method: "GET",
      headers: {
        Authorization: token,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const user = isRecord(data) && isRecord((data as any).user) ? (data as any).user : null;

    return {
      healthy: res.ok && user !== null,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: user?.id ? String(user.id) : "clickup_user",
      externalAccountLabel: user?.username ? String(user.username) : "ClickUp Workspace",
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "ClickUp health check failed." },
    };
  }
}

export const CLICKUP_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.clickup.runtime",
    adapterVersion: "1.0.0",
    providerId: "clickup",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "clickup.create_task",
      "clickup.update_task",
      "clickup.add_comment",
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
  healthCheck: checkClickUpHealth,
  executeAction: executeClickUpAction,
};
