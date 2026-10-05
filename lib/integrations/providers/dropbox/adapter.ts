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
const DROPBOX_API_BASE = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_DROPBOX_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readDropboxCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string }> {
  const creds = await context.credentials.read(["access_token"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("Dropbox OAuth access token is missing.", {
      code: "DROPBOX_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token };
}

async function executeDropboxAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_dbx_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `dbx_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readDropboxCredentials(invocation);

  switch (capabilityId) {
    case "dropbox.upload_file": {
      const fileName = extractString(inputObj, "file_name", "File name");
      const folderPath = typeof inputObj.folder_path === "string" ? inputObj.folder_path.replace(/^\/?/, "/") : "/";
      const fullPath = folderPath.endsWith("/") ? `${folderPath}${fileName}` : `${folderPath}/${fileName}`;
      const content = typeof inputObj.content === "string" ? inputObj.content : "Sample file content";

      const res = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: fullPath,
            mode: "add",
            autorename: true,
            mute: false,
          }),
          "Content-Type": "application/octet-stream",
        },
        body: content,
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Dropbox file upload failed: ${res.statusText}`, {
          code: "DROPBOX_UPLOAD_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const fileId = isRecord(data) && data.id ? String(data.id) : `dbx_file_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: fileId,
        rateLimit: null,
        metadata: {
          fileId,
          pathDisplay: isRecord(data) && data.path_display ? data.path_display : fullPath,
        },
      };
    }

    case "dropbox.create_folder": {
      const folderPath = extractString(inputObj, "folder_path", "Folder path");
      const normalizedPath = folderPath.startsWith("/") ? folderPath : `/${folderPath}`;

      const res = await fetch(`${DROPBOX_API_BASE}/files/create_folder_v2`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: normalizedPath,
          autorename: false,
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Dropbox folder creation failed: ${res.statusText}`, {
          code: "DROPBOX_FOLDER_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const folderId = isRecord(data) && isRecord((data as any).metadata) ? (data as any).metadata.id : `dbx_dir_${Date.now()}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: String(folderId),
        rateLimit: null,
        metadata: {
          folderId,
          path: normalizedPath,
        },
      };
    }

    case "dropbox.share_file": {
      const filePath = extractString(inputObj, "file_path", "File path");
      const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;

      const res = await fetch(`${DROPBOX_API_BASE}/sharing/create_shared_link_with_settings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: normalizedPath,
          settings: { requested_visibility: "public" },
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(`Dropbox share link failed: ${res.statusText}`, {
          code: "DROPBOX_SHARE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      const shareUrl = isRecord(data) && typeof data.url === "string"
        ? data.url
        : `https://www.dropbox.com/s/preview${normalizedPath}`;

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: `dbx_share_${Date.now()}`,
        rateLimit: null,
        metadata: {
          filePath: normalizedPath,
          shareUrl,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Dropbox adapter.`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkDropboxHealth(
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

    const res = await fetch(`${DROPBOX_API_BASE}/users/get_current_account`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;

    const accountName = isRecord(data) && isRecord((data as any).name)
      ? (data as any).name.display_name
      : "Dropbox User";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: isRecord(data) && data.account_id ? String(data.account_id) : "dbx_account",
      externalAccountLabel: accountName,
      metadata: { status: res.status },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "Dropbox health check failed." },
    };
  }
}

export const DROPBOX_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.dropbox.runtime",
    adapterVersion: "1.0.0",
    providerId: "dropbox",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "dropbox.upload_file",
      "dropbox.create_folder",
      "dropbox.share_file",
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
  healthCheck: checkDropboxHealth,
  executeAction: executeDropboxAction,
};
