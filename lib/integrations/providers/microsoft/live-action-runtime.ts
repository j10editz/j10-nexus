import "server-only";

import type { IntegrationRuntimeActionInvocation, IntegrationRuntimeRateLimit, IntegrationRuntimeResult } from "@/types/integration-runtime";
import { IntegrationRuntimeError } from "@/types/integration-runtime";
import { INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS } from "@/types/integration-outlook-mail";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

type JsonRecord = Record<string, unknown>;

interface GraphResponse {
  readonly data: unknown;
  readonly status: number;
  readonly requestId: string | null;
  readonly rateLimit: IntegrationRuntimeRateLimit | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, message: string): JsonRecord {
  if (!isRecord(value)) {
    throw new IntegrationRuntimeError(message, {
      code: "OUTLOOK_MAIL_ACTION_INPUT_INVALID", category: "validation", status: 400,
    });
  }
  return value;
}

function requireString(input: JsonRecord, key: string, message: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new IntegrationRuntimeError(message, {
      code: "OUTLOOK_MAIL_ACTION_INPUT_INVALID", category: "validation", status: 400,
    });
  }
  return value.trim();
}

function optionalString(input: JsonRecord, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value ? value : undefined;
}

function normalizeAddresses(value: unknown): readonly string[] {
  const entries = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return entries.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}

function recipients(addresses: readonly string[]): readonly JsonRecord[] {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

async function readAccessToken(invocation: IntegrationRuntimeActionInvocation): Promise<string> {
  const token = (await invocation.credentials.read(["access_token"])).access_token?.trim();
  if (!token) {
    throw new IntegrationRuntimeError("Outlook authorization is required.", {
      code: "OUTLOOK_MAIL_ACCESS_TOKEN_MISSING", category: "authentication", status: 401,
    });
  }
  return token;
}

function graphError(status: number): IntegrationRuntimeError {
  if (status === 401) return new IntegrationRuntimeError("Outlook authorization expired or consent was revoked.", {
    code: "OUTLOOK_MAIL_AUTHENTICATION_FAILED", category: "authentication", status: 401,
  });
  if (status === 403) return new IntegrationRuntimeError("Outlook denied the requested permission.", {
    code: "OUTLOOK_MAIL_AUTHORIZATION_FAILED", category: "authorization", status: 403,
  });
  return new IntegrationRuntimeError("Microsoft Graph rejected the Outlook mail operation.", {
    code: status === 429 ? "OUTLOOK_MAIL_RATE_LIMITED" : "OUTLOOK_MAIL_PROVIDER_ERROR",
    category: status === 429 ? "rate_limit" : "provider",
    status: status === 429 ? 429 : 502,
    retryable: status === 429 || status >= 500,
  });
}

async function graphRequest(input: {
  readonly accessToken: string;
  readonly url: string;
  readonly method: "GET" | "POST" | "PATCH";
  readonly body?: JsonRecord;
  readonly signal: AbortSignal;
}): Promise<GraphResponse> {
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: "no-store", redirect: "error",
      signal: AbortSignal.any([input.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new IntegrationRuntimeError("Microsoft Graph returned a response larger than J10 security limits.", {
        code: "OUTLOOK_MAIL_RESPONSE_TOO_LARGE", category: "provider", status: 502,
      });
    }
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text) as unknown; }
      catch { throw new IntegrationRuntimeError("Microsoft Graph returned an unreadable response.", {
        code: "OUTLOOK_MAIL_RESPONSE_INVALID", category: "provider", status: 502,
      }); }
    }
    if (!response.ok) throw graphError(response.status);
    const retryAfter = Number(response.headers.get("retry-after"));
    return {
      data, status: response.status,
      requestId: response.headers.get("request-id") ?? response.headers.get("client-request-id"),
      rateLimit: {
        limit: null, remaining: null, resetAt: null,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
      },
    };
  }
  catch (error) {
    if (error instanceof IntegrationRuntimeError) throw error;
    throw new IntegrationRuntimeError("J10 could not reach Microsoft Graph securely.", {
      code: "OUTLOOK_MAIL_NETWORK_ERROR",
      category: error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "network",
      status: 502, retryable: true,
    });
  }
}

function messageMetadata(response: GraphResponse): { providerMessageId: string | null; conversationId: string | null } {
  if (!isRecord(response.data)) return { providerMessageId: null, conversationId: null };
  return {
    providerMessageId: typeof response.data.id === "string" ? response.data.id : null,
    conversationId: typeof response.data.conversationId === "string" ? response.data.conversationId : null,
  };
}

function messageBody(body: string, htmlBody: string | undefined): JsonRecord {
  return { contentType: htmlBody ? "HTML" : "Text", content: htmlBody ?? body };
}

export async function executeMicrosoftGraphMailAction(invocation: IntegrationRuntimeActionInvocation): Promise<IntegrationRuntimeResult> {
  const accessToken = await readAccessToken(invocation);
  const input = requireRecord(invocation.input, "Outlook action input must be an object.");

  if (invocation.capabilityId === INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS.messageSend) {
    const to = normalizeAddresses(input.to);
    const cc = normalizeAddresses(input.cc);
    const bcc = normalizeAddresses(input.bcc);
    const subject = requireString(input, "subject", "Outlook subject is required.");
    const body = requireString(input, "body", "Outlook body is required.");
    const htmlBody = optionalString(input, "htmlBody");
    const draft = await graphRequest({
      accessToken, url: `${GRAPH_BASE_URL}/me/messages`, method: "POST", signal: invocation.signal,
      body: { subject, body: messageBody(body, htmlBody), toRecipients: recipients(to), ...(cc.length ? { ccRecipients: recipients(cc) } : {}), ...(bcc.length ? { bccRecipients: recipients(bcc) } : {}) },
    });
    const identifiers = messageMetadata(draft);
    if (!identifiers.providerMessageId) throw new IntegrationRuntimeError("Microsoft Graph did not return a message identifier.", {
      code: "OUTLOOK_MAIL_RESPONSE_INVALID", category: "provider", status: 502,
    });
    const sent = await graphRequest({
      accessToken, url: `${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(identifiers.providerMessageId)}/send`,
      method: "POST", signal: invocation.signal,
    });
    return {
      success: true, responseStatus: sent.status, providerRequestId: sent.requestId, rateLimit: sent.rateLimit,
      metadata: {
        providerId: "outlook-mail", capabilityId: invocation.capabilityId, mode: "live", externalSideEffect: true,
        operation: "send_message", recipientCount: to.length + cc.length + bcc.length,
        providerMessageId: identifiers.providerMessageId, conversationId: identifiers.conversationId,
        status: "sent", sentAt: new Date().toISOString(),
      },
    };
  }

  if (invocation.capabilityId === INTEGRATION_OUTLOOK_MAIL_CAPABILITY_IDS.messageReply) {
    const sourceMessageId = requireString(input, "messageId", "Outlook message ID is required.");
    const body = requireString(input, "body", "Outlook reply body is required.");
    const htmlBody = optionalString(input, "htmlBody");
    const draft = await graphRequest({
      accessToken, url: `${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(sourceMessageId)}/createReply`, method: "POST", signal: invocation.signal,
    });
    const identifiers = messageMetadata(draft);
    if (!identifiers.providerMessageId) throw new IntegrationRuntimeError("Microsoft Graph did not return a reply identifier.", {
      code: "OUTLOOK_MAIL_RESPONSE_INVALID", category: "provider", status: 502,
    });
    await graphRequest({
      accessToken, url: `${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(identifiers.providerMessageId)}`,
      method: "PATCH", signal: invocation.signal, body: { body: messageBody(body, htmlBody) },
    });
    const sent = await graphRequest({
      accessToken, url: `${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(identifiers.providerMessageId)}/send`,
      method: "POST", signal: invocation.signal,
    });
    return {
      success: true, responseStatus: sent.status, providerRequestId: sent.requestId, rateLimit: sent.rateLimit,
      metadata: {
        providerId: "outlook-mail", capabilityId: invocation.capabilityId, mode: "live", externalSideEffect: true,
        operation: "reply_message", providerMessageId: identifiers.providerMessageId,
        conversationId: identifiers.conversationId, status: "sent", sentAt: new Date().toISOString(),
      },
    };
  }

  throw new IntegrationRuntimeError("The Outlook capability is not implemented by Microsoft Graph.", {
    code: "OUTLOOK_MAIL_CAPABILITY_NOT_IMPLEMENTED", category: "configuration", status: 501,
  });
}
