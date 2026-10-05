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
const GOOGLE_MYBUSINESS_BASE = "https://mybusiness.googleapis.com/v4";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_GOOGLE_BUSINESS_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readGoogleAccessToken(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const creds = await context.credentials.read(["access_token", "api_key"]);
  const token = creds.access_token || creds.api_key;

  if (!token) {
    throw new IntegrationRuntimeError("Google Business Profile access token is missing in vault.", {
      code: "GOOGLE_BUSINESS_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return token;
}

async function executeGoogleBusinessAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_gbp_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        reviewReplied: true,
        replyText: typeof inputObj.reply_text === "string" ? inputObj.reply_text : "Thank you for your 5-star review with J10!",
        timestamp: new Date().toISOString(),
      },
    };
  }

  const token = await readGoogleAccessToken(invocation);

  switch (capabilityId) {
    case "google-business.reply_to_review": {
      const reviewName = extractString(inputObj, "review_name", "Google Review resource name");
      const replyText = extractString(inputObj, "reply_text", "Review reply comment");

      const res = await fetch(`${GOOGLE_MYBUSINESS_BASE}/${reviewName}/reply`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment: replyText }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to reply to Google review.", {
          code: "GOOGLE_BUSINESS_REPLY_FAILED",
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
        metadata: {
          mode: "live",
          reply: data,
        },
      };
    }

    case "google-business.post_business_update": {
      const locationName = extractString(inputObj, "location_name", "Google Location resource name");
      const summary = extractString(inputObj, "summary", "Post summary / announcement");

      const res = await fetch(`${GOOGLE_MYBUSINESS_BASE}/${locationName}/localPosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          languageCode: "en-US",
          summary,
          topicType: "STANDARD",
        }),
        signal: invocation.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data.error?.message || "Failed to create Google Business post.", {
          code: "GOOGLE_BUSINESS_POST_FAILED",
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
        metadata: {
          mode: "live",
          post: data,
        },
      };
    }

    default:
      throw new IntegrationRuntimeError(`Unsupported capability ${capabilityId} for Google Business Profile adapter.`, {
        code: "UNSUPPORTED_GOOGLE_BUSINESS_CAPABILITY",
        category: "validation",
        status: 400,
      });
  }
}

async function checkGoogleBusinessHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const creds = await context.credentials.read(["access_token", "api_key"]);
  const token = creds.access_token || creds.api_key;

  if (!token) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: "Google Business OAuth access token missing in vault.",
      },
    };
  }

  const startTime = Date.now();
  try {
    const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { Authorization: `Bearer ${token}` },
      signal: context.signal || AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;
    if (res.ok || res.status === 404 || res.status === 403) {
      return {
        healthy: res.ok,
        checkedAt: new Date().toISOString(),
        latencyMs,
        externalAccountId: "google_business_location",
        externalAccountLabel: "Google Business Profile & Reviews",
        metadata: {
          service: "Google Business Profile API",
        },
      };
    }

    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: `Google Business API returned HTTP ${res.status}`,
      },
    };
  } catch (err) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: {
        reason: err instanceof Error ? err.message : "Failed to connect to Google Business API",
      },
    };
  }
}

export const GOOGLE_BUSINESS_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.google_business.runtime",
    adapterVersion: "1.0.0",
    providerId: "google-business",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "google-business.reply_to_review",
      "google-business.post_business_update",
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
  healthCheck: checkGoogleBusinessHealth,
  executeAction: executeGoogleBusinessAction,
};
