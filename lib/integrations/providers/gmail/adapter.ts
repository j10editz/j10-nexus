import "server-only";

import type {
  IntegrationGmailAddLabelInput,
  IntegrationGmailReplyMessageInput,
  IntegrationGmailSendMessageInput,
} from "@/types/integration-gmail";
import { INTEGRATION_GMAIL_CAPABILITY_IDS } from "@/types/integration-gmail";
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
import {
  executeGoogleLiveAction,
} from "../google/live-action-runtime";

import {
  refreshGoogleOAuthAuthorization,
  revokeGoogleOAuthAuthorization,
} from "../google/oauth-runtime";

const GMAIL_PROFILE_ENDPOINT =
  "https://gmail.googleapis.com/gmail/v1/users/me/profile";

const GMAIL_MODIFY_SCOPE =
  "https://www.googleapis.com/auth/gmail.modify";

const GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_ACCESS_TOKEN_LENGTH = 32_768;
const MAX_BODY_LENGTH = 2 * 1024 * 1024;
const MAX_SUBJECT_LENGTH = 998;
const MAX_ADDRESS_COUNT = 50;
const MAX_ADDRESS_LENGTH = 320;
const MAX_ID_LENGTH = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validationError(message: string): IntegrationRuntimeError {
  return new IntegrationRuntimeError(message, {
    code: "GMAIL_ACTION_INPUT_INVALID",
    category: "validation",
    status: 400,
  });
}

function requireText(
  value: unknown,
  fieldName: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw validationError(`${fieldName} is required.`);
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maximumLength) {
    throw validationError(`${fieldName} is invalid.`);
  }

  return normalized;
}

function optionalText(
  value: unknown,
  maximumLength: number,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || value.length > maximumLength) {
    throw validationError(
      "An optional Gmail message field is invalid.",
    );
  }

  return value;
}

function requireId(value: unknown, fieldName: string): string {
  const id = requireText(value, fieldName, MAX_ID_LENGTH);

  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw validationError(`${fieldName} is invalid.`);
  }

  return id;
}

function normalizeAddresses(
  value: unknown,
  required: boolean,
): readonly string[] {
  const values =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : [];

  if (values.length > MAX_ADDRESS_COUNT) {
    throw validationError(
      "The Gmail recipient list is too large.",
    );
  }

  const addresses = values.map((entry) => {
    if (typeof entry !== "string") {
      throw validationError(
        "A Gmail recipient address is invalid.",
      );
    }

    const address = entry.trim();

    if (
      !address ||
      address.length > MAX_ADDRESS_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(address) ||
      !address.includes("@")
    ) {
      throw validationError(
        "A Gmail recipient address is invalid.",
      );
    }

    return address;
  });

  if (required && addresses.length === 0) {
    throw validationError(
      "At least one Gmail recipient is required.",
    );
  }

  return Array.from(new Set(addresses));
}

function parseSendInput(
  input: Readonly<Record<string, unknown>>,
): IntegrationGmailSendMessageInput {
  return {
    to: normalizeAddresses(input.to, true),
    cc: normalizeAddresses(input.cc, false),
    bcc: normalizeAddresses(input.bcc, false),
    subject: requireText(
      input.subject,
      "Gmail subject",
      MAX_SUBJECT_LENGTH,
    ),
    body: requireText(
      input.body,
      "Gmail body",
      MAX_BODY_LENGTH,
    ),
    htmlBody: optionalText(
      input.htmlBody,
      MAX_BODY_LENGTH,
    ),
  };
}

function parseReplyInput(
  input: Readonly<Record<string, unknown>>,
): IntegrationGmailReplyMessageInput {
  return {
    messageId: requireId(
      input.messageId,
      "Gmail message ID",
    ),
    body: requireText(
      input.body,
      "Gmail reply body",
      MAX_BODY_LENGTH,
    ),
    htmlBody: optionalText(
      input.htmlBody,
      MAX_BODY_LENGTH,
    ),
  };
}

function parseAddLabelInput(
  input: Readonly<Record<string, unknown>>,
): IntegrationGmailAddLabelInput {
  if (
    !Array.isArray(input.labelIds) ||
    input.labelIds.length < 1 ||
    input.labelIds.length > 100
  ) {
    throw validationError(
      "One or more Gmail label IDs are required.",
    );
  }

  return {
    messageId: requireId(
      input.messageId,
      "Gmail message ID",
    ),
    labelIds: Array.from(
      new Set(
        input.labelIds.map((labelId) =>
          requireId(labelId, "Gmail label ID"),
        ),
      ),
    ),
  };
}

function validateActionInput(
  invocation: IntegrationRuntimeActionInvocation,
): void {
  switch (invocation.capabilityId) {
    case INTEGRATION_GMAIL_CAPABILITY_IDS.messageSend:
      parseSendInput(invocation.input);
      return;

    case INTEGRATION_GMAIL_CAPABILITY_IDS.messageReply:
      parseReplyInput(invocation.input);
      return;

    case INTEGRATION_GMAIL_CAPABILITY_IDS.messageAddLabel:
      parseAddLabelInput(invocation.input);
      return;

    default:
      throw new IntegrationRuntimeError(
        "The Gmail capability is not implemented by this runtime.",
        {
          code: "GMAIL_CAPABILITY_NOT_IMPLEMENTED",
          category: "configuration",
          status: 501,
        },
      );
  }
}

async function executeGmailAction(
  invocation: IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  validateActionInput(invocation);

  if (
    invocation.mode === "live"
  ) {
    return executeGoogleLiveAction(
      invocation,
    );
  }

  if (
    invocation.mode !== "simulate" &&
    invocation.mode !== "sandbox"
  ) {
    throw new IntegrationRuntimeError(
      "The requested Gmail execution mode is unsupported.",
      {
        code: "GMAIL_EXECUTION_MODE_UNSUPPORTED",
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
      providerId: "gmail",
      capabilityId: invocation.capabilityId,
      mode: invocation.mode,
      providerCall: false,
      externalSideEffect: false,
      inputKeys: Object.keys(invocation.input).sort(),
    },
  };
}

async function readProfileJson(
  response: Response,
): Promise<unknown> {
  const text = await response.text();

  if (
    !text ||
    Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES
  ) {
    throw new IntegrationRuntimeError(
      "Gmail returned an invalid health response.",
      {
        code: "GMAIL_HEALTH_RESPONSE_INVALID",
        category: "provider",
        status: 502,
      },
    );
  }

  try {
    const value: unknown = JSON.parse(text);
    return value;
  }
  catch {
    throw new IntegrationRuntimeError(
      "Gmail returned an unreadable health response.",
      {
        code: "GMAIL_HEALTH_RESPONSE_INVALID",
        category: "provider",
        status: 502,
      },
    );
  }
}

function gmailHealthError(
  status: number,
): IntegrationRuntimeError {
  if (status === 401) {
    return new IntegrationRuntimeError(
      "Gmail authorization expired or was revoked.",
      {
        code: "GMAIL_AUTHENTICATION_FAILED",
        category: "authentication",
        status: 401,
      },
    );
  }

  if (status === 403) {
    return new IntegrationRuntimeError(
      "Gmail denied the requested health-check scope.",
      {
        code: "GMAIL_AUTHORIZATION_FAILED",
        category: "authorization",
        status: 403,
      },
    );
  }

  return new IntegrationRuntimeError(
    "Gmail could not complete the health check.",
    {
      code:
        status === 429
          ? "GMAIL_RATE_LIMITED"
          : "GMAIL_PROVIDER_ERROR",
      category:
        status === 429
          ? "rate_limit"
          : "provider",
      status:
        status === 429
          ? 429
          : 502,
      retryable:
        status === 429 ||
        status >= 500,
    },
  );
}

async function readAccessToken(
  context: IntegrationRuntimeInvocationContext,
): Promise<string> {
  const stored = await context.credentials.read([
    "access_token",
  ]);

  const accessToken = stored.access_token?.trim();

  if (
    !accessToken ||
    accessToken.length > MAX_ACCESS_TOKEN_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(accessToken)
  ) {
    throw new IntegrationRuntimeError(
      "Gmail authorization is required.",
      {
        code: "GMAIL_ACCESS_TOKEN_MISSING",
        category: "authentication",
        status: 401,
      },
    );
  }

  return accessToken;
}

async function checkGmailHealth(
  context: IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const startedAt = performance.now();
  const accessToken = await readAccessToken(context);

  try {
    const response = await fetch(GMAIL_PROFILE_ENDPOINT, {
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

    const data = await readProfileJson(response);

    if (!response.ok) {
      throw gmailHealthError(response.status);
    }

    if (
      !isRecord(data) ||
      typeof data.emailAddress !== "string"
    ) {
      throw gmailHealthError(502);
    }

    const emailAddress = data.emailAddress.trim();

    return {
      healthy: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.max(
        0,
        Math.round(performance.now() - startedAt),
      ),
      externalAccountId: emailAddress,
      externalAccountLabel: emailAddress,
      metadata: {
        messagesTotal:
          typeof data.messagesTotal === "number"
            ? data.messagesTotal
            : null,
        threadsTotal:
          typeof data.threadsTotal === "number"
            ? data.threadsTotal
            : null,
        historyId:
          typeof data.historyId === "string"
            ? data.historyId
            : null,
        providerRequestId:
          response.headers.get("x-guploader-uploadid") ??
          response.headers.get("x-request-id"),
      },
    };
  }
  catch (error) {
    if (error instanceof IntegrationRuntimeError) {
      throw error;
    }

    throw new IntegrationRuntimeError(
      "J10 could not reach Gmail securely.",
      {
        code: "GMAIL_HEALTH_NETWORK_ERROR",
        category:
          error instanceof DOMException &&
          error.name === "TimeoutError"
            ? "timeout"
            : "network",
        status: 502,
        retryable: true,
      },
    );
  }
}

export const GMAIL_RUNTIME_ADAPTER:
  IntegrationConnectorRuntimeAdapter = {
  manifest: {
    schemaVersion: INTEGRATION_RUNTIME_SCHEMA_VERSION,
    adapterId: "j10.gmail.runtime",
    adapterVersion: "1.1.0",
    providerId: "gmail",
    state: "installed",
    authType: "oauth2",
    environments: [
      "development",
      "production",
    ],
    modes: [
      "simulate",
      "sandbox",
      "live",
    ],
    capabilities: [
      {
        capabilityId:
          INTEGRATION_GMAIL_CAPABILITY_IDS.messageSend,
        kind: "action",
        modes: [
          "simulate",
          "sandbox",
          "live",
        ],
        requiredScopes: [
          GMAIL_SEND_SCOPE,
        ],
        supportsIdempotency: false,
      },
      {
        capabilityId:
          INTEGRATION_GMAIL_CAPABILITY_IDS.messageReply,
        kind: "action",
        modes: [
          "simulate",
          "sandbox",
          "live",
        ],
        requiredScopes: [
          GMAIL_SEND_SCOPE,
        ],
        supportsIdempotency: false,
      },
      {
        capabilityId:
          INTEGRATION_GMAIL_CAPABILITY_IDS.messageAddLabel,
        kind: "action",
        modes: [
          "simulate",
          "sandbox",
          "live",
        ],
        requiredScopes: [
          GMAIL_MODIFY_SCOPE,
        ],
        supportsIdempotency: true,
      },
    ],
    supportsHealthChecks: true,
    supportsTokenRefresh: true,
    supportsTokenRevocation: true,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxConcurrency: 10,
  },

  healthCheck: checkGmailHealth,

  executeAction: executeGmailAction,

  refreshAuthorization: (invocation) =>
    refreshGoogleOAuthAuthorization({
      providerId: "gmail",
      credentials: invocation.credentials,
      grantedScopes: invocation.grantedScopes,
      signal: invocation.signal,
    }),

  revokeAuthorization: (context) =>
    revokeGoogleOAuthAuthorization({
      credentials: context.credentials,
      signal: context.signal,
    }),
};