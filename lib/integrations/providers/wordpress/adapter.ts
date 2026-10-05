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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(input: Record<string, unknown>, key: string, label: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new IntegrationRuntimeError(`${label} is required.`, {
      code: "INVALID_WORDPRESS_INPUT",
      category: "validation",
      status: 400,
    });
  }
  return val.trim();
}

async function readWordPressCredentials(
  context: IntegrationRuntimeInvocationContext,
): Promise<{ siteUrl: string; authHeader: string }> {
  const creds = await context.credentials.read(["site_url", "access_token", "username", "application_password", "password"]);
  const siteUrl = (creds.site_url || "").replace(/\/+$/, "");

  if (!siteUrl) {
    throw new IntegrationRuntimeError("WordPress site_url is missing.", {
      code: "WORDPRESS_SITE_URL_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  if (creds.access_token) {
    return { siteUrl, authHeader: `Bearer ${creds.access_token}` };
  }

  if (creds.username && (creds.application_password || creds.password)) {
    const pass = creds.application_password || creds.password;
    const encoded = Buffer.from(`${creds.username}:${pass}`).toString("base64");
    return { siteUrl, authHeader: `Basic ${encoded}` };
  }

  throw new IntegrationRuntimeError("WordPress credentials (access_token or username + application_password) are missing.", {
    code: "WORDPRESS_AUTH_MISSING",
    category: "authentication",
    status: 401,
  });
}

async function executeWordPressAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const { capabilityId, input, mode } = invocation;
  const inputObj = isRecord(input) ? input : {};

  if (mode === "sandbox" || mode === "simulate") {
    return {
      success: true,
      responseStatus: 200,
      providerRequestId: `sim_wp_${Date.now()}`,
      rateLimit: null,
      metadata: {
        mode,
        simulated: true,
        capabilityId,
        id: `wp_${Date.now()}`,
        echo: inputObj,
      },
    };
  }

  const { siteUrl, authHeader } = await readWordPressCredentials(invocation);

  switch (capabilityId) {
    case "wordpress.create_post": {
      const title = extractString(inputObj, "title", "Post Title");
      const content = typeof inputObj.content === "string" ? inputObj.content : "";
      const status = typeof inputObj.status === "string" ? inputObj.status : "publish";

      const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          status,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to create WordPress post.", {
          code: "WORDPRESS_POST_FAILED",
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

    case "wordpress.update_post": {
      const postId = inputObj.post_id ?? inputObj.id;
      if (!postId) {
        throw new IntegrationRuntimeError("post_id is required.", {
          code: "INVALID_WORDPRESS_INPUT",
          category: "validation",
          status: 400,
        });
      }

      const bodyPayload: Record<string, unknown> = {};
      if (typeof inputObj.title === "string") bodyPayload.title = inputObj.title;
      if (typeof inputObj.content === "string") bodyPayload.content = inputObj.content;
      if (typeof inputObj.status === "string") bodyPayload.status = inputObj.status;

      const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts/${encodeURIComponent(String(postId))}`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new IntegrationRuntimeError(data?.message || "Failed to update WordPress post.", {
          code: "WORDPRESS_UPDATE_FAILED",
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

    case "wordpress.capture_inbound_lead": {
      const email = extractString(inputObj, "email", "Lead Email");
      const name = typeof inputObj.name === "string" ? inputObj.name : "Website Visitor";
      const message = typeof inputObj.message === "string" ? inputObj.message : "";

      const res = await fetch(`${siteUrl}/wp-json/wp/v2/comments`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          author_name: name,
          author_email: email,
          content: message,
          post: typeof inputObj.post_id === "number" ? inputObj.post_id : 1,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = await res.json().catch(() => ({}));

      return {
        success: true,
        responseStatus: res.ok ? 200 : res.status,
        providerRequestId: res.headers.get("x-request-id") || null,
        rateLimit: null,
        metadata: {
          leadCaptured: true,
          email,
          name,
          details: data,
        },
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

async function checkWordPressHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const started = Date.now();
  try {
    const { siteUrl, authHeader } = await readWordPressCredentials(context);

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: authHeader,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));
    const latency = Date.now() - started;
    const name = isRecord(data) && typeof data.name === "string" ? data.name : "WordPress Site";
    const id = isRecord(data) && data.id ? String(data.id) : siteUrl;

    return {
      healthy: res.ok,
      checkedAt: new Date().toISOString(),
      latencyMs: latency,
      externalAccountId: id,
      externalAccountLabel: `${name} (${siteUrl})`,
      metadata: { status: res.status },
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      externalAccountId: null,
      externalAccountLabel: null,
      metadata: { reason: err instanceof Error ? err.message : "WordPress health check failed." },
    };
  }
}

export const WORDPRESS_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.wordpress.runtime",
    adapterVersion: "1.0.0",
    providerId: "wordpress",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      "wordpress.create_post",
      "wordpress.update_post",
      "wordpress.capture_inbound_lead",
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
  healthCheck: checkWordPressHealth,
  executeAction: executeWordPressAction,
};
