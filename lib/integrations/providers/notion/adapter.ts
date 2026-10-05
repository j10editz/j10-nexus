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
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_NOTION_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readNotionCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ secret: string }> {
  const creds = await context.credentials.read(["secret_key", "api_key", "access_token"]);
  const secret = creds.secret_key || creds.api_key || creds.access_token;

  if (!secret) {
    throw new IntegrationRuntimeError("Notion Integration Secret is missing.", {
      code: "NOTION_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { secret };
}

async function executeNotionAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_notion_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `notion_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { secret } = await readNotionCredentials(invocation);

  switch (capabilityId) {
    case "notion.create_page": {
      const title = extractString(inputObj, "title", "Page title");
      const parentId = typeof inputObj.parent_page_id === "string" ? inputObj.parent_page_id : undefined;
      const databaseId = typeof inputObj.database_id === "string" ? inputObj.database_id : undefined;

      if (!parentId && !databaseId) {
        throw new IntegrationRuntimeError("Either parent_page_id or database_id is required.", {
          code: "INVALID_NOTION_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const parent = databaseId
        ? { database_id: databaseId }
        : { page_id: parentId };

      const properties: Record<string, unknown> = databaseId
        ? {
            Name: {
              title: [{ text: { content: title } }],
            },
          }
        : {
            title: [{ text: { content: title } }],
          };

      const res = await fetch(`${NOTION_API_BASE}/pages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent,
          properties,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Notion page creation failed: ${res.statusText}`, {
          code: "NOTION_PAGE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const pageId = isRecord(data) && data.id ? String(data.id) : `page_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: pageId,
        rateLimit: null,
        metadata: {
          pageId,
          url: isRecord(data) && data.url ? data.url : null,
          title,
        },
      };
    }

    case "notion.update_page": {
      const pageId = extractString(inputObj, "page_id", "Page ID");
      const properties = isRecord(inputObj.properties) ? inputObj.properties : {};

      const res = await fetch(`${NOTION_API_BASE}/pages/${encodeURIComponent(pageId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties,
          archived: inputObj.archived === true,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Notion page update failed: ${res.statusText}`, {
          code: "NOTION_UPDATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: pageId,
        rateLimit: null,
        metadata: {
          pageId,
          updated: true,
        },
      };
    }

    case "notion.add_database_item": {
      const databaseId = extractString(inputObj, "database_id", "Database ID");
      const title = extractString(inputObj, "title", "Item title");
      const extraProps = isRecord(inputObj.properties) ? inputObj.properties : {};

      const payload = {
        parent: { database_id: databaseId },
        properties: {
          Name: {
            title: [{ text: { content: title } }],
          },
          ...extraProps,
        },
      };

      const res = await fetch(`${NOTION_API_BASE}/pages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Notion database item creation failed: ${res.statusText}`, {
          code: "NOTION_DB_ITEM_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const itemId = isRecord(data) && data.id ? String(data.id) : `item_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: itemId,
        rateLimit: null,
        metadata: {
          itemId,
          databaseId,
          title,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Notion adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkNotionHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["secret_key", "api_key", "access_token"]);
    const secret = creds.secret_key || creds.api_key || creds.access_token;
    if (!secret) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing secret key" },
      };
    }

    const res = await fetch(`${NOTION_API_BASE}/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Notion-Version": NOTION_VERSION,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const botName = isRecord(data) && typeof data.name === "string" ? data.name : "Notion Integration";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && data.id ? String(data.id) : "notion_bot",
      externalAccountLabel: botName,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Notion health check failed." },
    };
  }
}

export const NOTION_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.notion.runtime",
    adapterVersion: "1.0.0",
    providerId: "notion",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "notion.create_page",
      "notion.update_page",
      "notion.add_database_item",
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
  healthCheck: checkNotionHealth,
  executeAction: executeNotionAction,
};
