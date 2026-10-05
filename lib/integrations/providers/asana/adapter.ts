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
const ASANA_API_BASE = "https://app.asana.com/api/1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_ASANA_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readAsanaCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; workspaceId?: string }> {
  const creds = await context.credentials.read(["access_token", "api_token", "workspace_id"]);
  const token = creds.access_token || creds.api_token;

  if (!token) {
    throw new IntegrationRuntimeError("Asana Personal Access Token or OAuth token is missing.", {
      code: "ASANA_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, workspaceId: creds.workspace_id };
}

async function executeAsanaAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_asana_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `asana_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, workspaceId: defaultWorkspaceId } = await readAsanaCredentials(invocation);

  switch (capabilityId) {
    case "asana.create_task": {
      const name = extractString(inputObj, "name", "Task name");
      const workspace = typeof inputObj.workspace === "string" ? inputObj.workspace : defaultWorkspaceId;
      const projects = Array.isArray(inputObj.projects) ? inputObj.projects : undefined;
      const notes = typeof inputObj.notes === "string" ? inputObj.notes : "";

      const dataPayload: Record<string, unknown> = {
        name,
        notes,
      };

      if (workspace) {
        dataPayload.workspace = workspace;
      }
      if (projects) {
        dataPayload.projects = projects;
      }

      const res = await fetch(`${ASANA_API_BASE}/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: dataPayload }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Asana task creation failed: ${res.statusText}`, {
          code: "ASANA_TASK_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const taskId = isRecord(data) && isRecord((data as any).data) ? (data as any).data.gid : `task_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(taskId),
        rateLimit: null,
        metadata: {
          taskId,
          name,
        },
      };
    }

    case "asana.update_task": {
      const taskId = extractString(inputObj, "task_id", "Task GID");
      const dataPayload: Record<string, unknown> = {};

      if (typeof inputObj.name === "string") dataPayload.name = inputObj.name;
      if (typeof inputObj.notes === "string") dataPayload.notes = inputObj.notes;
      if (typeof inputObj.completed === "boolean") dataPayload.completed = inputObj.completed;

      const res = await fetch(`${ASANA_API_BASE}/tasks/${encodeURIComponent(taskId)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: dataPayload }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Asana task update failed: ${res.statusText}`, {
          code: "ASANA_UPDATE_FAILED",
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

    case "asana.add_comment": {
      const taskId = extractString(inputObj, "task_id", "Task GID");
      const text = extractString(inputObj, "text", "Comment text");

      const res = await fetch(`${ASANA_API_BASE}/tasks/${encodeURIComponent(taskId)}/stories`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: { text } }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Asana comment addition failed: ${res.statusText}`, {
          code: "ASANA_COMMENT_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const storyId = isRecord(data) && isRecord((data as any).data) ? (data as any).data.gid : `story_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(storyId),
        rateLimit: null,
        metadata: {
          taskId,
          storyId,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Asana adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkAsanaHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_token"]);
    const token = creds.access_token || creds.api_token;
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

    const res = await fetch(`${ASANA_API_BASE}/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const name = isRecord(data) && isRecord((data as any).data) ? (data as any).data.name : "Asana User";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && isRecord((data as any).data) ? String((data as any).data.gid) : "asana_user",
      externalAccountLabel: name,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Asana health check failed." },
    };
  }
}

export const ASANA_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.asana.runtime",
    adapterVersion: "1.0.0",
    providerId: "asana",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "asana.create_task",
      "asana.update_task",
      "asana.add_comment",
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
  healthCheck: checkAsanaHealth,
  executeAction: executeAsanaAction,
};
