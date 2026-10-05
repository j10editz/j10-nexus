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
const AIRTABLE_API_BASE = "https://api.airtable.com/v0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_AIRTABLE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readAirtableCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; baseId?: string }> {
  const creds = await context.credentials.read(["secret_key", "api_key", "access_token", "base_id"]);
  const token = creds.secret_key || creds.api_key || creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Airtable Personal Access Token is missing.", {
      code: "AIRTABLE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, baseId: creds.base_id };
}

async function executeAirtableAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_airtable_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `rec_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, baseId: defaultBaseId } = await readAirtableCredentials(invocation);

  switch (capabilityId) {
    case "airtable.create_record": {
      const baseId = typeof inputObj.base_id === "string" ? inputObj.base_id : defaultBaseId;
      const tableName = extractString(inputObj, "table_name", "Table name or ID");
      const fields = isRecord(inputObj.fields) ? inputObj.fields : {};

      if (!baseId) {
        throw new IntegrationRuntimeError("Airtable Base ID is required.", {
          code: "INVALID_AIRTABLE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${AIRTABLE_API_BASE}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Airtable record creation failed: ${res.statusText}`, {
          code: "AIRTABLE_CREATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const recordId = isRecord(data) && data.id ? String(data.id) : `rec_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: recordId,
        rateLimit: null,
        metadata: {
          recordId,
          baseId,
          tableName,
        },
      };
    }

    case "airtable.update_record": {
      const baseId = typeof inputObj.base_id === "string" ? inputObj.base_id : defaultBaseId;
      const tableName = extractString(inputObj, "table_name", "Table name or ID");
      const recordId = extractString(inputObj, "record_id", "Record ID");
      const fields = isRecord(inputObj.fields) ? inputObj.fields : {};

      if (!baseId) {
        throw new IntegrationRuntimeError("Airtable Base ID is required.", {
          code: "INVALID_AIRTABLE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${AIRTABLE_API_BASE}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Airtable record update failed: ${res.statusText}`, {
          code: "AIRTABLE_UPDATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: recordId,
        rateLimit: null,
        metadata: {
          recordId,
          updated: true,
        },
      };
    }

    case "airtable.delete_record": {
      const baseId = typeof inputObj.base_id === "string" ? inputObj.base_id : defaultBaseId;
      const tableName = extractString(inputObj, "table_name", "Table name or ID");
      const recordId = extractString(inputObj, "record_id", "Record ID");

      if (!baseId) {
        throw new IntegrationRuntimeError("Airtable Base ID is required.", {
          code: "INVALID_AIRTABLE_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${AIRTABLE_API_BASE}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Airtable record deletion failed: ${res.statusText}`, {
          code: "AIRTABLE_DELETE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: recordId,
        rateLimit: null,
        metadata: {
          recordId,
          deleted: true,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Airtable adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkAirtableHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["secret_key", "api_key", "access_token"]);
    const token = creds.secret_key || creds.api_key || creds.access_token;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing API token" },
      };
    }

    const res = await fetch(`${AIRTABLE_API_BASE}/meta/whoami`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && data.id ? String(data.id) : "airtable_user",
      externalAccountLabel: isRecord(data) && data.email ? String(data.email) : "Airtable Workspace",
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Airtable health check failed." },
    };
  }
}

export const AIRTABLE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.airtable.runtime",
    adapterVersion: "1.0.0",
    providerId: "airtable",
    state: "installed",
    authType: "secret_key",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "airtable.create_record",
      "airtable.update_record",
      "airtable.delete_record",
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
  healthCheck: checkAirtableHealth,
  executeAction: executeAirtableAction,
};
