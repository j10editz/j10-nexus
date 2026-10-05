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
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_YOUTUBE_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readYouTubeCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; channelId?: string }> {
  const creds = await context.credentials.read(["access_token", "channel_id"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("YouTube access token is missing.", {
      code: "YOUTUBE_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, channelId: creds.channel_id };
}

async function executeYouTubeAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_yt_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `yt_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readYouTubeCredentials(invocation);

  switch (capabilityId) {
    case "youtube.upload_video": {
      const title = extractString(inputObj, "title", "Video Title");
      const description = typeof inputObj.description === "string" ? inputObj.description : "";
      const privacyStatus = typeof inputObj.privacyStatus === "string" ? inputObj.privacyStatus : "private";

      const res = await fetch(`${YOUTUBE_API_BASE}/videos?part=snippet,status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            title,
            description,
            tags: Array.isArray(inputObj.tags) ? inputObj.tags : [],
            categoryId: typeof inputObj.categoryId === "string" ? inputObj.categoryId : "22",
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to upload video to YouTube.", {
          code: "YOUTUBE_UPLOAD_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "youtube.update_video": {
      const videoId = extractString(inputObj, "videoId", "Video ID");
      const title = typeof inputObj.title === "string" ? inputObj.title.trim() : undefined;
      const description = typeof inputObj.description === "string" ? inputObj.description : undefined;

      const bodyPayload: Record<string, unknown> = {
        id: videoId,
      };

      if (title || description) {
        bodyPayload.snippet = {
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          categoryId: typeof inputObj.categoryId === "string" ? inputObj.categoryId : "22",
        };
      }

      const res = await fetch(`${YOUTUBE_API_BASE}/videos?part=snippet`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to update YouTube video.", {
          code: "YOUTUBE_UPDATE_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "youtube.add_to_playlist": {
      const playlistId = extractString(inputObj, "playlistId", "Playlist ID");
      const videoId = extractString(inputObj, "videoId", "Video ID");

      const res = await fetch(`${YOUTUBE_API_BASE}/playlistItems?part=snippet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: {
              kind: "youtube#video",
              videoId,
            },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to add video to YouTube playlist.", {
          code: "YOUTUBE_PLAYLIST_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability: ${capabilityId}`, {
        code: "UNSUPPORTED_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkYouTubeHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const creds = await context.credentials.read(["access_token"]);
    const token = creds.access_token;
    if (!token) {
      return {
        healthy: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        externalAccountId: null,
        externalAccountLabel: null,
        metadata: { reason: "Missing access token" },
      };
    }

    const res = await fetch(`${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const channel = isRecord(data) && Array.isArray(data.items) && isRecord(data.items[0]) ? data.items[0] : null;
    const channelSnippet = channel && isRecord(channel.snippet) ? channel.snippet : null;
    const channelTitle = channelSnippet && typeof channelSnippet.title === "string" ? channelSnippet.title : "YouTube Channel";
    const channelId = channel && typeof channel.id === "string" ? channel.id : "youtube_channel";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: channelId,
      externalAccountLabel: channelTitle,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "YouTube health check failed." },
    };
  }
}

export const YOUTUBE_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.youtube.runtime",
    adapterVersion: "1.0.0",
    providerId: "youtube",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "youtube.upload_video",
      "youtube.update_video",
      "youtube.add_to_playlist",
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
  healthCheck: checkYouTubeHealth,
  executeAction: executeYouTubeAction,
};
