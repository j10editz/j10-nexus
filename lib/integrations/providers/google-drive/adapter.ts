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

const REQUEST_TIMEOUT_MS = 20_000;
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_DRIVE_INPUT",
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
    throw new IntegrationRuntimeError("Google Drive access token is missing.", {
      code: "DRIVE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return token;
}

async function executeDriveAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_drive_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        fileName: typeof inputObj.name === "string" ? inputObj.name : "agreement.pdf",
        fileId: `drive_file_${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  const token = await readGoogleToken(invocation);

  switch (capabilityId) {
    case "google-drive.upload_file": {
      const fileName = extractString(inputObj, "name", "File Name");
      const mimeType = typeof inputObj.mime_type === "string" ? inputObj.mime_type : "text/plain";
      const content = typeof inputObj.content === "string" ? inputObj.content : "";

      const metadata = {
        name: fileName,
        mimeType,
        parents: Array.isArray(inputObj.parents) ? inputObj.parents : undefined,
      };

      const boundary = `-------314159265358979323846`;
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n` +
        content +
        closeDelim;

      const res = await fetch(DRIVE_UPLOAD_BASE, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to upload file to Google Drive.", {
          code: "DRIVE_UPLOAD_ERROR",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: data.id || `drive_${Date.now()}`,
        rateLimit: null,
        metadata: {
          fileId: data.id,
          fileName: data.name,
          webViewLink: data.webViewLink,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported Google Drive capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkDriveHealth(
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
        metadata: { reason: "Google Drive access token missing." },
      };
    }

    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${token}` },
      signal: context.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const latency = Date.now() - started;
    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: res.ok ? "google_drive_account" : null,
      externalAccountLabel: res.ok ? "Google Drive Storage" : null,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Drive health check failed." },
    };
  }
}

export const GOOGLE_DRIVE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.google_drive.runtime",
    adapterVersion: "1.0.0",
    providerId: "google-drive",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "google-drive.upload_file",
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
  healthCheck: checkDriveHealth,
  executeAction: executeDriveAction,
};
