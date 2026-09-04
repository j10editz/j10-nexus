import "server-only";

import {
  WHATSAPP_ACTION_CAPABILITY_IDS,
} from "@/types/integration-whatsapp";
import type {
  IntegrationConnectorRuntimeAdapter,
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeHealthResult,
  IntegrationRuntimeInvocationContext,
  IntegrationRuntimeRateLimit,
  IntegrationRuntimeResult,
} from "@/types/integration-runtime";
import {
  INTEGRATION_RUNTIME_SCHEMA_VERSION,
  IntegrationRuntimeError,
} from "@/types/integration-runtime";
import {
  buildWhatsAppCloudPayload,
} from "./payload";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_ACCESS_TOKEN_LENGTH = 32_768;
const DEFAULT_GRAPH_API_VERSION = "v26.0";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireConfigurationValue(
  context: IntegrationRuntimeInvocationContext,
  key: string,
  label: string,
  pattern: RegExp,
): string {
  const value = context.connection.publicConfiguration[key];
  const normalized = typeof value === "string" ? value.trim() : String(value ?? "");

  if (!normalized || !pattern.test(normalized)) {
    throw new IntegrationRuntimeError(`${label} is missing or invalid.`, {
      code: "WHATSAPP_CONFIGURATION_INVALID",
      category: "configuration",
      status: 409,
    });
  }

  return normalized;
}

function graphApiVersion(context: IntegrationRuntimeInvocationContext): string {
  const configured =
    context.connection.publicConfiguration.graph_api_version ??
    process.env.META_WHATSAPP_GRAPH_API_VERSION ??
    DEFAULT_GRAPH_API_VERSION;
  const version = typeof configured === "string" ? configured.trim() : "";

  if (!/^v\d{1,2}\.\d{1,2}$/.test(version)) {
    throw new IntegrationRuntimeError("WhatsApp Graph API version is invalid.", {
      code: "WHATSAPP_GRAPH_VERSION_INVALID",
      category: "configuration",
      status: 409,
    });
  }

  return version;
}

async function readAccessToken(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const credentials = await context.credentials.read(["access_token"]);
  const accessToken = credentials.access_token?.trim();

  if (
    !accessToken ||
    accessToken.length > MAX_ACCESS_TOKEN_LENGTH ||
    /[\u0000-\u0020\u007f]/.test(accessToken)
  ) {
    throw new IntegrationRuntimeError("WhatsApp access token is required.", {
      code: "WHATSAPP_ACCESS_TOKEN_MISSING",
      category: "authentication",
      status: 401,
    });
  }

  return accessToken;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new IntegrationRuntimeError("WhatsApp returned an oversized response.", {
      code: "WHATSAPP_RESPONSE_TOO_LARGE",
      category: "provider",
      status: 502,
    });
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new IntegrationRuntimeError("WhatsApp returned an unreadable response.", {
      code: "WHATSAPP_RESPONSE_INVALID",
      category: "provider",
      status: 502,
    });
  }
}

function parseRetryAfter(response: Response): number | null {
  const raw = response.headers.get("retry-after");

  if (!raw) {
    return null;
  }

  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function rateLimit(response: Response): IntegrationRuntimeRateLimit | null {
  const retryAfterSeconds = parseRetryAfter(response);

  return retryAfterSeconds === null
    ? null
    : {
        limit: null,
        remaining: null,
        resetAt: null,
        retryAfterSeconds,
      };
}

function providerError(
  response: Response,
  data: unknown,
): IntegrationRuntimeError {
  const providerCode =
    isRecord(data) && isRecord(data.error) && typeof data.error.code === "number"
      ? data.error.code
      : null;
  const retryAfterSeconds = parseRetryAfter(response);

  if (providerCode === 131030) {
    return new IntegrationRuntimeError(
      "Recipient phone number is not in Meta's allowed list. Since you are using a Meta Test Number, open Meta Developer Console -> WhatsApp -> API Setup -> Step 1, click 'Manage phone number list', add and verify this phone number with the OTP code Meta texts you.",
      {
        code: "WHATSAPP_RECIPIENT_NOT_ALLOWED",
        category: "authorization",
        status: 400,
        details: { providerCode },
      },
    );
  }

  if (response.status === 401 || providerCode === 190) {
    return new IntegrationRuntimeError(
      "WhatsApp authentication failed or Meta token expired. Refresh your Meta access token in .env.local.",
      {
        code: "WHATSAPP_AUTHENTICATION_FAILED",
        category: "authentication",
        status: 401,
        details: { providerCode },
      },
    );
  }

  if (response.status === 403) {
    return new IntegrationRuntimeError(
      "WhatsApp denied this phone number or action.",
      {
        code: "WHATSAPP_AUTHORIZATION_FAILED",
        category: "authorization",
        status: 403,
        details: { providerCode },
      },
    );
  }

  const limited = response.status === 429;

  return new IntegrationRuntimeError(
    limited
      ? "WhatsApp rate-limited this request."
      : "WhatsApp could not complete the provider request.",
    {
      code: limited ? "WHATSAPP_RATE_LIMITED" : "WHATSAPP_PROVIDER_ERROR",
      category: limited ? "rate_limit" : "provider",
      status: limited ? 429 : 502,
      retryable: limited || response.status >= 500,
      retryAfterSeconds,
      details: { providerCode, providerStatus: response.status },
    },
  );
}

function providerRequestId(response: Response): string | null {
  return response.headers.get("x-fb-trace-id") ?? response.headers.get("x-request-id");
}

async function executeLiveAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const payload = buildWhatsAppCloudPayload(invocation.capabilityId, invocation.input);
  const phoneNumberId = requireConfigurationValue(
    invocation,
    "phone_number_id",
    "WhatsApp Phone Number ID",
    /^\d{5,32}$/,
  );
  const accessToken = await readAccessToken(invocation);
  const endpoint = `https://graph.facebook.com/${graphApiVersion(invocation)}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        invocation.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });
    const data = await readBoundedJson(response);

    if (!response.ok) {
      throw providerError(response, data);
    }

    const firstMessage =
      isRecord(data) && Array.isArray(data.messages) && isRecord(data.messages[0])
        ? data.messages[0]
        : null;
    const messageId =
      firstMessage && typeof firstMessage.id === "string"
        ? firstMessage.id
        : null;

    if (!messageId) {
      throw new IntegrationRuntimeError(
        "WhatsApp accepted the request without returning a message ID.",
        {
          code: "WHATSAPP_MESSAGE_ID_MISSING",
          category: "provider",
          status: 502,
        },
      );
    }

    return {
      success: true,
      responseStatus: response.status,
      providerRequestId: providerRequestId(response),
      rateLimit: rateLimit(response),
      metadata: {
        providerId: "whatsapp-business",
        capabilityId: invocation.capabilityId,
        mode: "live",
        providerCall: true,
        externalSideEffect: true,
        messageId,
      },
    };
  } catch (error) {
    if (error instanceof IntegrationRuntimeError) {
      throw error;
    }

    throw new IntegrationRuntimeError("J10 could not reach WhatsApp securely.", {
      code: "WHATSAPP_NETWORK_ERROR",
      category:
        error instanceof DOMException && error.name === "TimeoutError"
          ? "timeout"
          : "network",
      status: 502,
      retryable: true,
    });
  }
}

async function executeWhatsAppAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const payload = buildWhatsAppCloudPayload(invocation.capabilityId, invocation.input);

  if (invocation.mode === "live") {
    return executeLiveAction(invocation);
  }

  if (invocation.mode !== "simulate" && invocation.mode !== "sandbox") {
    throw new IntegrationRuntimeError(
      "The requested WhatsApp execution mode is unsupported.",
      {
        code: "WHATSAPP_EXECUTION_MODE_UNSUPPORTED",
        category: "configuration",
        status: 409,
      },
    );
  }

  return {
    success: true,
    responseStatus: 200,
    providerRequestId: null,
    rateLimit: null,
    metadata: {
      providerId: "whatsapp-business",
      capabilityId: invocation.capabilityId,
      mode: invocation.mode,
      providerCall: false,
      externalSideEffect: false,
      messageType: payload.type,
      inputKeys: Object.keys(invocation.input).sort(),
    },
  };
}

async function checkWhatsAppHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const startedAt = performance.now();
  const phoneNumberId = requireConfigurationValue(
    context,
    "phone_number_id",
    "WhatsApp Phone Number ID",
    /^\d{5,32}$/,
  );
  const accessToken = await readAccessToken(context);
  const endpoint = new URL(
    `https://graph.facebook.com/${graphApiVersion(context)}/${phoneNumberId}`,
  );
  endpoint.searchParams.set(
    "fields",
    "id,display_phone_number,verified_name,quality_rating",
  );

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        context.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });
    const data = await readBoundedJson(response);

    if (!response.ok || !isRecord(data) || typeof data.id !== "string") {
      throw providerError(response, data);
    }

    return {
      healthy: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      externalAccountId: data.id,
      externalAccountLabel:
        typeof data.verified_name === "string"
          ? data.verified_name
          : typeof data.display_phone_number === "string"
            ? data.display_phone_number
            : data.id,
      metadata: {
        qualityRating:
          typeof data.quality_rating === "string" ? data.quality_rating : null,
        providerRequestId: providerRequestId(response),
      },
    };
  } catch (error) {
    if (error instanceof IntegrationRuntimeError) {
      throw error;
    }

    throw new IntegrationRuntimeError("J10 could not reach WhatsApp securely.", {
      code: "WHATSAPP_HEALTH_NETWORK_ERROR",
      category:
        error instanceof DOMException && error.name === "TimeoutError"
          ? "timeout"
          : "network",
      status: 502,
      retryable: true,
    });
  }
}

export const WHATSAPP_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.whatsapp-business.runtime",
    adapterVersion: "1.0.0",
    providerId: "whatsapp-business",
    state: "installed",
    authType: "access_token",
    environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      WHATSAPP_ACTION_CAPABILITY_IDS.messageSend,
      WHATSAPP_ACTION_CAPABILITY_IDS.templateSend,
      WHATSAPP_ACTION_CAPABILITY_IDS.mediaSend,
    ].map((capabilityId) => ({
      capabilityId,
      kind: "action" as const,
      modes: ["simulate", "sandbox", "live"] as const,
      requiredScopes: [],
      supportsIdempotency: false,
    })),
    supportsHealthChecks: true,
    supportsTokenRefresh: false,
    supportsTokenRevocation: false,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxConcurrency: 10,
  },
  healthCheck: checkWhatsAppHealth,
  executeAction: executeWhatsAppAction,
};
