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
const MONDAY_API_ENDPOINT = "https://api.monday.com/v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_MONDAY_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readMondayCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string }> {
  const creds = await context.credentials.read(["access_token", "api_token", "token"]);
  const token = creds.access_token || creds.api_token || creds.token;

  if (!token) {
    throw new IntegrationRuntimeError("monday.com API token is missing.", {
      code: "MONDAY_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token };
}

async function executeMondayAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_monday_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `mon_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readMondayCredentials(invocation);

  switch (capabilityId) {
    case "monday.create_item": {
      const boardId = extractString(inputObj, "board_id", "Board ID");
      const itemName = extractString(inputObj, "item_name", "Item name");
      const columnValues = isRecord(inputObj.column_values) ? JSON.stringify(inputObj.column_values) : undefined;

      const query = `
        mutation CreateItem($boardId: ID!, $itemName: String!, $columnValues: JSON) {
          create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
            id
            name
          }
        }
      `;

      const res = await fetch(MONDAY_API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          "API-Version": "2024-01",
        },
        body: JSON.stringify({
          query,
          variables: {
            boardId,
            itemName,
            columnValues,
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as any).errors?.length) {
        throw new IntegrationRuntimeError(`monday.com item creation failed: ${(data as any).errors?.[0]?.message || res.statusText}`, {
          code: "MONDAY_CREATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const itemId = isRecord(data) && isRecord((data as any).data?.create_item) ? (data as any).data.create_item.id : `item_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(itemId),
        rateLimit: null,
        metadata: {
          itemId,
          boardId,
          itemName,
        },
      };
    }

    case "monday.update_item": {
      const boardId = extractString(inputObj, "board_id", "Board ID");
      const itemId = extractString(inputObj, "item_id", "Item ID");
      const columnValues = isRecord(inputObj.column_values) ? JSON.stringify(inputObj.column_values) : "{}";

      const query = `
        mutation ChangeMultipleColumnValues($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id
          }
        }
      `;

      const res = await fetch(MONDAY_API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          "API-Version": "2024-01",
        },
        body: JSON.stringify({
          query,
          variables: {
            boardId,
            itemId,
            columnValues,
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as any).errors?.length) {
        throw new IntegrationRuntimeError(`monday.com update failed: ${(data as any).errors?.[0]?.message || res.statusText}`, {
          code: "MONDAY_UPDATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: itemId,
        rateLimit: null,
        metadata: {
          boardId,
          itemId,
          updated: true,
        },
      };
    }

    case "monday.assign_owner": {
      const boardId = extractString(inputObj, "board_id", "Board ID");
      const itemId = extractString(inputObj, "item_id", "Item ID");
      const userId = extractString(inputObj, "user_id", "User ID");
      const columnId = typeof inputObj.column_id === "string" ? inputObj.column_id : "person";

      const columnValues = JSON.stringify({
        [columnId]: { personsAndTeams: [{ id: parseInt(userId, 10) || userId, kind: "person" }] },
      });

      const query = `
        mutation AssignOwner($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id
          }
        }
      `;

      const res = await fetch(MONDAY_API_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          "API-Version": "2024-01",
        },
        body: JSON.stringify({
          query,
          variables: {
            boardId,
            itemId,
            columnValues,
          },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as any).errors?.length) {
        throw new IntegrationRuntimeError(`monday.com assignment failed: ${(data as any).errors?.[0]?.message || res.statusText}`, {
          code: "MONDAY_ASSIGN_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `assign_${Date.now()}`,
        rateLimit: null,
        metadata: {
          itemId,
          userId,
          assigned: true,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for monday.com adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkMondayHealth(
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

    const res = await fetch(MONDAY_API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        "API-Version": "2024-01",
      },
      body: JSON.stringify({ query: "query { me { id name } }" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const me = isRecord(data) && isRecord((data as any).data?.me) ? (data as any).data.me : null;

    return {
      healthy: res.ok && me !== null,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: me?.id ? String(me.id) : "monday_user",
      externalAccountLabel: me?.name ? String(me.name) : "monday.com",
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "monday.com health check failed." },
    };
  }
}

export const MONDAY_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.monday.runtime",
    adapterVersion: "1.0.0",
    providerId: "monday",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "monday.create_item",
      "monday.update_item",
      "monday.assign_owner",
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
  healthCheck: checkMondayHealth,
  executeAction: executeMondayAction,
};
