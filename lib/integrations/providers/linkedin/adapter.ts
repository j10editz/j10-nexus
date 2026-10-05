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
const LINKEDIN_API_BASE = "https://api.linkedin.com/v2";
const LINKEDIN_REST_BASE = "https://api.linkedin.com/rest";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_LINKEDIN_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readLinkedInCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ token: string; authorUrn?: string }> {
  const creds = await context.credentials.read(["access_token", "author_urn", "person_urn"]);
  const token = creds.access_token;

  if (!token) {
    throw new IntegrationRuntimeError("LinkedIn access token is missing.", {
      code: "LINKEDIN_AUTH_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return { token, authorUrn: creds.author_urn || creds.person_urn };
}

async function executeLinkedInAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_linkedin_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `li_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { token, authorUrn } = await readLinkedInCredentials(invocation);

  switch (capabilityId) {
    case "linkedin.publish_post": {
      const commentary = typeof inputObj.text === "string" && inputObj.text.trim()
        ? inputObj.text.trim()
        : typeof inputObj.commentary === "string" && inputObj.commentary.trim()
        ? inputObj.commentary.trim()
        : "";

      if (!commentary) {
        throw new IntegrationRuntimeError("text or commentary is required.", {
          code: "INVALID_LINKEDIN_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const author = typeof inputObj.author === "string" && inputObj.author.trim()
        ? inputObj.author.trim()
        : authorUrn;

      if (!author) {
        throw new IntegrationRuntimeError("author URN is required.", {
          code: "INVALID_LINKEDIN_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const visibility = typeof inputObj.visibility === "string" ? inputObj.visibility : "PUBLIC";

      const res = await fetch(`${LINKEDIN_REST_BASE}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author,
          commentary,
          visibility,
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to publish LinkedIn post.", {
          code: "LINKEDIN_POST_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-restli-gateway-error") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "linkedin.create_campaign": {
      const name = extractString(inputObj, "name", "Campaign Name");
      const accountUrn = typeof inputObj.account_urn === "string" && inputObj.account_urn.trim()
        ? inputObj.account_urn.trim()
        : typeof inputObj.account_id === "string" && inputObj.account_id.trim()
        ? `urn:li:sponsoredAccount:${inputObj.account_id.trim()}`
        : "";

      if (!accountUrn) {
        throw new IntegrationRuntimeError("account_urn or account_id is required.", {
          code: "INVALID_LINKEDIN_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${LINKEDIN_REST_BASE}/adCampaigns`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          account: accountUrn,
          name,
          status: typeof inputObj.status === "string" ? inputObj.status : "PAUSED",
          type: typeof inputObj.type === "string" ? inputObj.type : "TEXT_AD",
          costType: typeof inputObj.cost_type === "string" ? inputObj.cost_type : "CPC",
          dailyBudget: typeof inputObj.daily_budget === "object" ? inputObj.daily_budget : { amount: "50", currencyCode: "USD" },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to create LinkedIn campaign.", {
          code: "LINKEDIN_CAMPAIGN_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-restli-gateway-error") || null,
        rateLimit: null,
        metadata: data,
      };
    }

    case "linkedin.reply_to_lead": {
      const message = extractString(inputObj, "message", "Message Text");
      const conversationId = typeof inputObj.conversation_id === "string" && inputObj.conversation_id.trim()
        ? inputObj.conversation_id.trim()
        : typeof inputObj.lead_id === "string" && inputObj.lead_id.trim()
        ? inputObj.lead_id.trim()
        : "";

      if (!conversationId) {
        throw new IntegrationRuntimeError("conversation_id or lead_id is required.", {
          code: "INVALID_LINKEDIN_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const res = await fetch(`${LINKEDIN_REST_BASE}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          conversation: conversationId.startsWith("urn:li:") ? conversationId : `urn:li:msg_conversation:${conversationId}`,
          message: {
            body: message,
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to reply to LinkedIn lead.", {
          code: "LINKEDIN_REPLY_FAILED",
          category: "provider",
          status: res.status,
          details: data,
        });
      }

      return {
        success: true,
        responseStatus: res.status,
        providerRequestId: res.headers.get("x-restli-gateway-error") || null,
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

async function checkLinkedInHealth(
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

    const res = await fetch(`${LINKEDIN_API_BASE}/userinfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const name = isRecord(data) && typeof data.name === "string" ? data.name : "LinkedIn Member";
    const sub = isRecord(data) && typeof data.sub === "string" ? data.sub : "linkedin_user";

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: sub,
      externalAccountLabel: name,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "LinkedIn health check failed." },
    };
  }
}

export const LINKEDIN_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.linkedin.runtime",
    adapterVersion: "1.0.0",
    providerId: "linkedin",
    state: "installed",
    authType: "oauth2",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "linkedin.publish_post",
      "linkedin.create_campaign",
      "linkedin.reply_to_lead",
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
  healthCheck: checkLinkedInHealth,
  executeAction: executeLinkedInAction,
};
