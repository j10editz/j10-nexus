import "server-only";

import type {
  IntegrationOutlookMailReplyMessageInput,
  IntegrationOutlookMailSendMessageInput,
} from "@/types/integration-outlook-mail";
import { INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS } from "@/types/integration-outlook-mail";
import type {
  IntegrationConnectorRuntimeAdapter,
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeHealthResult,
  IntegrationRuntimeInvocationContext,
  IntegrationRuntimeResult,
} from "@/types/integration-runtime";
import { INTEGRATION_RUNTIME_SCHEMA_VERSION, IntegrationRuntimeError } from "@/types/integration-runtime";
import { executeMicrosoftGraphMailAction } from "../microsoft/live-action-runtime";
import { refreshMicrosoftOAuthAuthorization } from "../microsoft/oauth-runtime";

const MICROSOFT_GRAPH_MAIL_READ_WRITE_SCOPE = "https://graph.microsoft.com/Mail.ReadWrite";
const MICROSOFT_GRAPH_MAIL_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send";
const GRAPH_ME_ENDPOINT = "https://graph.microsoft.com/v1.0/me?$select=id";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ACCESS_TOKEN_LENGTH = 32_768;
const MAX_BODY_LENGTH = 2 * 1024 * 1024;
const MAX_SUBJECT_LENGTH = 998;
const MAX_ADDRESS_COUNT = 50;
const MAX_ADDRESS_LENGTH = 320;
const MAX_ID_LENGTH = 1_024;

function validationError(message: string): IntegrationRuntimeError {
  return new IntegrationRuntimeError(message, { code: "OUTLOOK_MAIL_ACTION_INPUT_INVALID", category: "validation", status: 400 });
}

function requireText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string") throw validationError(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw validationError(`${label} is invalid.`);
  }
  return normalized;
}

function optionalText(value: unknown, maximumLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireText(value, "An optional Outlook message field", maximumLength);
}

function normalizeAddresses(value: unknown, required: boolean): readonly string[] {
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  if (values.length > MAX_ADDRESS_COUNT) throw validationError("The Outlook recipient list is too large.");
  const addresses = values.map((entry) => {
    if (typeof entry !== "string") throw validationError("An Outlook recipient address is invalid.");
    const address = entry.trim();
    if (!address || address.length > MAX_ADDRESS_LENGTH || /[\u0000-\u001f\u007f]/.test(address) || !address.includes("@")) {
      throw validationError("An Outlook recipient address is invalid.");
    }
    return address;
  });
  if (required && addresses.length === 0) throw validationError("At least one Outlook recipient is required.");
  return Array.from(new Set(addresses));
}

function parseSendInput(input: Readonly<Record<string, unknown>>): IntegrationOutlookMailSendMessageInput {
  return {
    to: normalizeAddresses(input.to, true),
    cc: normalizeAddresses(input.cc, false),
    bcc: normalizeAddresses(input.bcc, false),
    subject: requireText(input.subject, "Outlook subject", MAX_SUBJECT_LENGTH),
    body: requireText(input.body, "Outlook body", MAX_BODY_LENGTH),
    htmlBody: optionalText(input.htmlBody, MAX_BODY_LENGTH),
  };
}

function parseReplyInput(input: Readonly<Record<string, unknown>>): IntegrationOutlookMailReplyMessageInput {
  return {
    messageId: requireText(input.messageId, "Outlook message ID", MAX_ID_LENGTH),
    body: requireText(input.body, "Outlook reply body", MAX_BODY_LENGTH),
    htmlBody: optionalText(input.htmlBody, MAX_BODY_LENGTH),
  };
}

function validateActionInput(invocation: IntegrationRuntimeActionInvocation): void {
  if (invocation.capabilityId === INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS.messageSend) {
    parseSendInput(invocation.input);
    return;
  }
  if (invocation.capabilityId === INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS.messageReply) {
    parseReplyInput(invocation.input);
    return;
  }
  throw new IntegrationRuntimeError("The Outlook capability is not implemented by this runtime.", {
    code: "OUTLOOK_MAIL_CAPABILITY_NOT_IMPLEMENTED", category: "configuration", status: 501,
  });
}

async function readAccessToken(context: IntegrationRuntimeInvocationContext): Promise<string> {
  const token = (await context.credentials.read(["access_token"])).access_token?.trim();
  if (!token || token.length > MAX_ACCESS_TOKEN_LENGTH || /[\u0000-\u001f\u007f]/.test(token)) {
    throw new IntegrationRuntimeError("Outlook authorization is required.", {
      code: "OUTLOOK_MAIL_ACCESS_TOKEN_MISSING", category: "authentication", status: 401,
    });
  }
  return token;
}

function healthError(status: number): IntegrationRuntimeError {
  if (status === 401) return new IntegrationRuntimeError("Outlook authorization expired or consent was revoked.", {
    code: "OUTLOOK_MAIL_AUTHENTICATION_FAILED", category: "authentication", status: 401,
  });
  if (status === 403) return new IntegrationRuntimeError("Outlook denied the requested permission.", {
    code: "OUTLOOK_MAIL_AUTHORIZATION_FAILED", category: "authorization", status: 403,
  });
  return new IntegrationRuntimeError("Outlook could not complete the health check.", {
    code: status === 429 ? "OUTLOOK_MAIL_RATE_LIMITED" : "OUTLOOK_MAIL_PROVIDER_ERROR",
    category: status === 429 ? "rate_limit" : "provider",
    status: status === 429 ? 429 : 502,
    retryable: status === 429 || status >= 500,
  });
}

async function healthCheck(context: IntegrationRuntimeInvocationContext): Promise<IntegrationRuntimeHealthResult> {
  const startedAt = performance.now();
  const accessToken = await readAccessToken(context);
  try {
    const response = await fetch(GRAPH_ME_ENDPOINT, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      cache: "no-store", redirect: "error",
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    const data: unknown = await response.json();
    if (!response.ok || !data || typeof data !== "object" || Array.isArray(data) || typeof (data as Record<string, unknown>).id !== "string") {
      throw healthError(response.status);
    }
    return {
      healthy: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      externalAccountId: (data as Record<string, unknown>).id as string,
      externalAccountLabel: null,
      metadata: { providerId: "outlook-mail", providerRequestId: response.headers.get("request-id") },
    };
  }
  catch (error) {
    if (error instanceof IntegrationRuntimeError) throw error;
    throw new IntegrationRuntimeError("J10 could not reach Outlook securely.", {
      code: "OUTLOOK_MAIL_HEALTH_NETWORK_ERROR",
      category: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network",
      status: 502, retryable: true,
    });
  }
}

async function executeAction(invocation: IntegrationRuntimeActionInvocation): Promise<IntegrationRuntimeResult> {
  validateActionInput(invocation);
  if (invocation.mode === "live") return executeMicrosoftGraphMailAction(invocation);
  if (invocation.mode !== "simulate" && invocation.mode !== "sandbox") {
    throw new IntegrationRuntimeError("The requested Outlook execution mode is unsupported.", {
      code: "OUTLOOK_MAIL_EXECUTION_MODE_UNSUPPORTED", category: "configuration", status: 409,
    });
  }
  return {
    success: true, responseStatus: 200, providerRequestId: null, rateLimit: null,
    metadata: {
      providerId: "outlook-mail", capabilityId: invocation.capabilityId, mode: invocation.mode,
      providerCall: false, externalSideEffect: false, inputKeys: Object.keys(invocation.input).sort(),
    },
  };
}

export const OUTLOOK_MAIL_RUNTIME_ADAPTER: IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.outlook-mail.runtime", adapterVersion: "1.0.0", providerId: "outlook-mail",
    state: "installed", authType: "oauth2", environments: ["development", "production"],
    modes: ["simulate", "sandbox", "live"],
    capabilities: [
      { capabilityId: INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS.messageSend, kind: "action", modes: ["simulate", "sandbox", "live"], requiredScopes: [MICROSOFT_GRAPH_MAIL_READ_WRITE_SCOPE, MICROSOFT_GRAPH_MAIL_SEND_SCOPE], supportsIdempotency: true },
      { capabilityId: INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS.messageReply, kind: "action", modes: ["simulate", "sandbox", "live"], requiredScopes: [MICROSOFT_GRAPH_MAIL_READ_WRITE_SCOPE, MICROSOFT_GRAPH_MAIL_SEND_SCOPE], supportsIdempotency: true },
    ],
    supportsHealthChecks: true, supportsTokenRefresh: true, supportsTokenRevocation: false,
    requestTimeoutMs: REQUEST_TIMEOUT_MS, maxConcurrency: 10,
  },
  healthCheck,
  executeAction,
  refreshAuthorization: (invocation) => refreshMicrosoftOAuthAuthorization({
    providerId: "outlook-mail", credentials: invocation.credentials,
    grantedScopes: invocation.grantedScopes, signal: invocation.signal,
  }),
};
