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
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_ONEDRIVE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readOneDriveCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string }> {
  const creds = await context.credentials.read(["access_token"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("OneDrive OAuth access token is missing.", {
      code: "ONEDRIVE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token };
}

async function executeOneDriveAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_onedrive_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `od_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readOneDriveCredentials(invocation);

  switch (capabilityId) {
    case "onedrive.upload_file": {
      const fileName = extractString(inputObj, "file_name", "File name");
      const content = typeof inputObj.content === "string" ? inputObj.content : "Sample file content";
      const folderPath = typeof inputObj.folder_path === "string" ? inputObj.folder_path.replace(/^\//, "") : "";

      const uploadUrl = folderPath
        ? `${GRAPH_API_BASE}/me/drive/root:/${encodeURIComponent(folderPath)}/${encodeURIComponent(fileName)}:/content`
        : `${GRAPH_API_BASE}/me/drive/root:/${encodeURIComponent(fileName)}:/content`;

      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: content,
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`OneDrive file upload failed: ${res.statusText}`, {
          code: "ONEDRIVE_UPLOAD_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const fileId = isRecord(data) && data.id ? String(data.id) : `od_file_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: fileId,
        rateLimit: null,
        metadata: {
          fileId,
          fileName,
          webUrl: isRecord(data) && data.webUrl ? data.webUrl : null,
        },
      };
    }

    case "onedrive.create_folder": {
      const folderName = extractString(inputObj, "folder_name", "Folder name");
      const parentId = typeof inputObj.parent_id === "string" ? inputObj.parent_id : "root";

      const res = await fetch(`${GRAPH_API_BASE}/me/drive/items/${encodeURIComponent(parentId)}/children`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: folderName,
          folder: {},
          "@microsoft.graph.conflictBehavior": "rename",
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`OneDrive folder creation failed: ${res.statusText}`, {
          code: "ONEDRIVE_FOLDER_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const folderId = isRecord(data) && data.id ? String(data.id) : `od_folder_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: folderId,
        rateLimit: null,
        metadata: {
          folderId,
          folderName,
          webUrl: isRecord(data) && data.webUrl ? data.webUrl : null,
        },
      };
    }

    case "onedrive.share_file": {
      const fileId = extractString(inputObj, "file_id", "File ID");
      const type = typeof inputObj.type === "string" ? inputObj.type : "view";

      const res = await fetch(`${GRAPH_API_BASE}/me/drive/items/${encodeURIComponent(fileId)}/createLink`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          scope: "anonymous",
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`OneDrive share link creation failed: ${res.statusText}`, {
          code: "ONEDRIVE_SHARE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const shareLink = isRecord(data) && isRecord(data.link) && typeof (data.link as any).webUrl === "string"
        ? (data.link as any).webUrl
        : `https://onedrive.live.com/redir?resid=${fileId}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `share_${Date.now()}`,
        rateLimit: null,
        metadata: {
          fileId,
          shareLink,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for OneDrive adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkOneDriveHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token"]);
    if (!creds.access_token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing access token" },
      };
    }

    const res = await fetch(`${GRAPH_API_BASE}/me/drive`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && data.id ? String(data.id) : "onedrive_drive",
      externalAccountLabel: isRecord(data) && typeof data.driveType === "string" ? `OneDrive (${data.driveType})` : "Microsoft OneDrive",
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "OneDrive health check failed." },
    };
  }
}

export const ONEDRIVE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.onedrive.runtime",
    adapterVersion: "1.0.0",
    providerId: "onedrive",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "onedrive.upload_file",
      "onedrive.create_folder",
      "onedrive.share_file",
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
  healthCheck: checkOneDriveHealth,
  executeAction: executeOneDriveAction,
};
