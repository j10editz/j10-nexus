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
const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readTikTokCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; openId?: string }> {
  const creds = await context.credentials.read(["access_token", "open_id"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("TikTok access token is missing.", {
      code: "TIKTOK_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, openId: creds.open_id };
}

async function executeTikTokAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_tiktok_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `tiktok_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token } = await readTikTokCredentials(invocation);

  switch (capabilityId) {
    case "tiktok.upload_content": {
      const sourceUrl = typeof inputObj.video_url === "string" && inputObj.video_url.trim()
        ? inputObj.video_url.trim()
        : typeof inputObj.source_info === "string" && inputObj.source_info.trim()
        ? inputObj.source_info.trim()
        : "";

      if (!sourceUrl) {
        throw new IntegrationRuntimeError("video_url or source_info is required.", {
          code: "INVALID_TIKTOK_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const title = typeof inputObj.title === "string" ? inputObj.title.trim() : (typeof inputObj.caption === "string" ? inputObj.caption.trim() : "New Post");
      const privacyLevel = typeof inputObj.privacy_level === "string" ? inputObj.privacy_level : "SELF_ONLY";

      const res = await fetch(`${TIKTOK_API_BASE}/post/publish/video/init/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post_info: {
            title,
            privacy_level: privacyLevel,
            disable_duet: Boolean(inputObj.disable_duet),
            disable_stitch: Boolean(inputObj.disable_stitch),
            disable_comment: Boolean(inputObj.disable_comment),
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: sourceUrl,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data?.error && data.error.code !== "ok" && data.error.code !== 0)) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to initialize TikTok video upload.", {
          code: "TIKTOK_UPLOAD_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-tt-logid") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "tiktok.publish_content": {
      const publishId = typeof inputObj.publish_id === "string" && inputObj.publish_id.trim()
        ? inputObj.publish_id.trim()
        : typeof inputObj.post_id === "string" && inputObj.post_id.trim()
        ? inputObj.post_id.trim()
        : "";

      if (!publishId) {
        throw new IntegrationRuntimeError("publish_id or post_id is required.", {
          code: "INVALID_TIKTOK_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publish_id: publishId,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data?.error && data.error.code !== "ok" && data.error.code !== 0)) {
        throw new IntegrationRuntimeError(data?.error?.message || "Failed to verify or publish TikTok content.", {
          code: "TIKTOK_PUBLISH_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-tt-logid") || null,
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

async function checkTikTokHealth(
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

    const res = await fetch(`${TIKTOK_API_BASE}/user/info/?fields=open_id,union_id,avatar_url,display_name`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const user = isRecord(data) && isRecord(data.data) && isRecord(data.data.user) ? data.data.user : null;
    const displayName = user && typeof user.display_name === "string" ? user.display_name : "TikTok Creator";
    const openId = user && typeof user.open_id === "string" ? user.open_id : "tiktok_user";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: openId,
      externalAccountLabel: displayName,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "TikTok health check failed." },
    };
  }
}

export const TIKTOK_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.tiktok.runtime",
    adapterVersion: "1.0.0",
    providerId: "tiktok",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "tiktok.upload_content",
      "tiktok.publish_content",
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
  healthCheck: checkTikTokHealth,
  executeAction: executeTikTokAction,
};
