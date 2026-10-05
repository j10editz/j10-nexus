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
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_SHEETS_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readGoogleToken(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["access_token", "api_key"]);
  const token = creds.access_token || creds.api_key;

  if (!token) {
    throw new IntegrationRuntimeError("Google Sheets OAuth access token is missing.", {
      code: "SHEETS_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return token;
}

async function executeSheetsAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_sheets_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        spreadsheetId: typeof inputObj.spreadsheet_id === "string" ? inputObj.spreadsheet_id : "sim_sheet_123",
        updatedRows: 1,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const token = await readGoogleToken(invocation);

  switch (capabilityId) {
    case "google-sheets.add_row": {
      const spreadsheetId = extractString(inputObj, "spreadsheet_id", "Spreadsheet ID");
      const range = typeof inputObj.range === "string" && inputObj.range.trim() ? inputObj.range.trim() : "Sheet1!A1";
      const values = Array.isArray(inputObj.values) ? inputObj.values : [Object.values(inputObj)];

      const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [values] }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to append row to Google Sheet.", {
          code: "SHEETS_APPEND_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.updates?.updatedRange || `sheets_${Date.now()}`,
        rateLimit: null,
        metadata: {
          updatedRange: data.updates?.updatedRange,
          updatedRows: data.updates?.updatedRows || 1,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported Google Sheets capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkSheetsHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token", "api_key"]);
    const token = creds.access_token || creds.api_key;

    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Google Sheets access token missing." },
      };
    }

    const res = await fetch("https://www.googleapis.com/oauth2/v3/tokeninfo", {
      headers: { Authorization: `Bearer ${token}` },
      signal: context.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: res.ok ? "google_sheets_account" : null,
      externalAccountLabel: res.ok ? "Google Sheets Workspace" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Sheets health check failed." },
    };
  }
}

export const GOOGLE_SHEETS_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.google_sheets.runtime",
    adapterVersion: "1.0.0",
    providerId: "google-sheets",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "google-sheets.add_row",
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
  healthCheck: checkSheetsHealth,
  executeAction: executeSheetsAction,
};
