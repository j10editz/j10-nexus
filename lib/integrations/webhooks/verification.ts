import "server-only";

import type {
  IntegrationEnvironment,
  IntegrationProviderId,
} from "../../../types/integration";

import type {
  IntegrationWebhookVerificationResult,
} from "../../../types/integration-webhook";

import {
  hmacSha256Base64,
  hmacSha256Hex,
  isWebhookTimestampFresh,
  normalizeSignatureHex,
  parseUnixTimestamp,
  safeStringEqual,
} from "./crypto";

import {
  IntegrationWebhookError,
} from "./errors";

type CredentialValues = Readonly<Record<string, string>>;

type VerifyWebhookDeliveryInput = {
  providerId: IntegrationProviderId;
  environment: IntegrationEnvironment;
  headers: Headers;
  rawBody: string;
  payload: Record<string, unknown>;
  credentials: CredentialValues;
};

export const WEBHOOK_INGRESS_PROVIDER_IDS = [
  "generic-webhook",
  "shopify",
  "stripe",
  "whatsapp-business",
] as const satisfies readonly IntegrationProviderId[];

const WEBHOOK_INGRESS_PROVIDER_SET = new Set<IntegrationProviderId>(
  WEBHOOK_INGRESS_PROVIDER_IDS,
);

const STORED_WEBHOOK_HEADERS = [
  "content-type",
  "user-agent",
  "x-j10-event-id",
  "x-j10-event-type",
  "x-j10-occurred-at",
  "x-j10-timestamp",
  "x-shopify-topic",
  "x-shopify-triggered-at",
  "x-shopify-webhook-id",
  "x-shopify-shop-domain",
] as const;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function requiredCredential(
  credentials: CredentialValues,
  key: string,
  providerName: string,
) {
  const value = credentials[key]?.trim();

  if (!value) {
    throw new IntegrationWebhookError(
      `${providerName} webhook verification is not configured.`,
      "WEBHOOK_SIGNATURE_SECRET_MISSING",
      503,
      true,
    );
  }

  return value;
}

function rejectSignature(message: string): never {
  throw new IntegrationWebhookError(
    message,
    "WEBHOOK_SIGNATURE_INVALID",
    401,
    true,
  );
}

function normalizedEventType(
  value: unknown,
  fallback: string,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "_")
    .slice(0, 160);

  return normalized || fallback;
}

function normalizedExternalEventId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().slice(0, 255);
  return normalized || null;
}

function normalizeOccurredAt(
  value: unknown,
  fallback = new Date().toISOString(),
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000
      ? value
      : value * 1000;

    const date = new Date(milliseconds);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = value.trim();

    if (/^\d+$/.test(normalized)) {
      return normalizeOccurredAt(Number(normalized), fallback);
    }

    const date = new Date(normalized);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return fallback;
}

function verifyGenericWebhook(
  input: VerifyWebhookDeliveryInput,
): IntegrationWebhookVerificationResult {
  const signingSecret = input.credentials.signing_secret?.trim();
  let signatureStatus: "valid" | "not_configured" = "valid";

  if (!signingSecret) {
    if (input.environment === "production") {
      throw new IntegrationWebhookError(
        "Production generic webhooks require a signing secret.",
        "WEBHOOK_SIGNING_SECRET_REQUIRED",
        503,
        true,
      );
    }

    signatureStatus = "not_configured";
  } else {
    const timestampHeader = input.headers.get("x-j10-timestamp");
    const unixTimestamp = parseUnixTimestamp(timestampHeader);
    const receivedSignature = normalizeSignatureHex(
      input.headers.get("x-j10-signature"),
    );

    if (
      unixTimestamp === null ||
      !isWebhookTimestampFresh(unixTimestamp) ||
      !receivedSignature
    ) {
      rejectSignature(
        "Generic webhook signature or timestamp is invalid.",
      );
    }

    const expectedSignature = hmacSha256Hex(
      signingSecret,
      `${timestampHeader!.trim()}.${input.rawBody}`,
    );

    if (!safeStringEqual(receivedSignature, expectedSignature)) {
      rejectSignature("Generic webhook signature is invalid.");
    }
  }

  return {
    eventType: normalizedEventType(
      input.headers.get("x-j10-event-type"),
      "webhook.request.received",
    ),
    externalEventId: normalizedExternalEventId(
      input.headers.get("x-j10-event-id"),
    ),
    occurredAt: normalizeOccurredAt(
      input.headers.get("x-j10-occurred-at"),
    ),
    signatureStatus,
  };
}

function verifyShopifyWebhook(
  input: VerifyWebhookDeliveryInput,
): IntegrationWebhookVerificationResult {
  const webhookSecret = requiredCredential(
    input.credentials,
    "webhook_secret",
    "Shopify",
  );

  const receivedSignature =
    input.headers.get("x-shopify-hmac-sha256")?.trim() || "";

  const expectedSignature = hmacSha256Base64(
    webhookSecret,
    input.rawBody,
  );

  if (
    !receivedSignature ||
    !safeStringEqual(receivedSignature, expectedSignature)
  ) {
    rejectSignature("Shopify webhook signature is invalid.");
  }

  return {
    eventType: normalizedEventType(
      input.headers.get("x-shopify-topic"),
      "shopify.webhook.received",
    ),
    externalEventId: normalizedExternalEventId(
      input.headers.get("x-shopify-webhook-id"),
    ),
    occurredAt: normalizeOccurredAt(
      input.headers.get("x-shopify-triggered-at"),
    ),
    signatureStatus: "valid",
  };
}

function verifyStripeWebhook(
  input: VerifyWebhookDeliveryInput,
): IntegrationWebhookVerificationResult {
  const webhookSecret = requiredCredential(
    input.credentials,
    "webhook_signing_secret",
    "Stripe",
  );

  const signatureHeader = input.headers.get("stripe-signature") || "";
  const signatureParts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const timestampValue = signatureParts
    .find((part) => part.startsWith("t="))
    ?.slice(2) ?? null;

  const timestamp = parseUnixTimestamp(timestampValue);
  const signatures = signatureParts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3).toLowerCase());

  if (
    timestamp === null ||
    !isWebhookTimestampFresh(timestamp) ||
    signatures.length === 0
  ) {
    rejectSignature("Stripe webhook signature or timestamp is invalid.");
  }

  const expectedSignature = hmacSha256Hex(
    webhookSecret,
    `${timestamp}.${input.rawBody}`,
  );

  if (
    !signatures.some((signature) =>
      safeStringEqual(signature, expectedSignature),
    )
  ) {
    rejectSignature("Stripe webhook signature is invalid.");
  }

  return {
    eventType: normalizedEventType(
      input.payload.type,
      "stripe.event.received",
    ),
    externalEventId: normalizedExternalEventId(input.payload.id),
    occurredAt: normalizeOccurredAt(input.payload.created),
    signatureStatus: "valid",
  };
}

function getWhatsAppEventIdentity(
  payload: Record<string, unknown>,
) {
  const entry = Array.isArray(payload.entry)
    ? payload.entry[0]
    : null;

  const entryRecord = isRecord(entry) ? entry : null;
  const change = Array.isArray(entryRecord?.changes)
    ? entryRecord.changes[0]
    : null;

  const wrappedChange = isRecord(change) ? change : null;
  const sampleChange =
    typeof payload.field === "string" &&
    isRecord(payload.value)
      ? payload
      : null;
  const changeRecord =
    wrappedChange ?? sampleChange;
  const value = isRecord(changeRecord?.value)
    ? changeRecord.value
    : null;

  const message = Array.isArray(value?.messages)
    ? value.messages[0]
    : null;

  const status = Array.isArray(value?.statuses)
    ? value.statuses[0]
    : null;

  const messageRecord = isRecord(message) ? message : null;
  const statusRecord = isRecord(status) ? status : null;

  if (messageRecord) {
    return {
      eventType: "whatsapp.message.received",
      externalEventId: normalizedExternalEventId(messageRecord.id),
      occurredAt: normalizeOccurredAt(messageRecord.timestamp),
    };
  }

  if (statusRecord) {
    return {
      eventType: "whatsapp.message.status_updated",
      externalEventId: normalizedExternalEventId(statusRecord.id),
      occurredAt: normalizeOccurredAt(statusRecord.timestamp),
    };
  }

  return {
    eventType: "whatsapp.webhook.received",
    externalEventId: normalizedExternalEventId(entryRecord?.id),
    occurredAt: new Date().toISOString(),
  };
}

function verifyWhatsAppWebhook(
  input: VerifyWebhookDeliveryInput,
): IntegrationWebhookVerificationResult {
  const appSecret = requiredCredential(
    input.credentials,
    "app_secret",
    "WhatsApp Business",
  );

  const receivedSignature = normalizeSignatureHex(
    input.headers.get("x-hub-signature-256"),
  );

  const expectedSignature = hmacSha256Hex(
    appSecret,
    input.rawBody,
  );

  if (
    !receivedSignature ||
    !safeStringEqual(receivedSignature, expectedSignature)
  ) {
    rejectSignature("WhatsApp webhook signature is invalid.");
  }

  return {
    ...getWhatsAppEventIdentity(input.payload),
    signatureStatus: "valid",
  };
}

export function supportsWebhookIngress(
  providerId: IntegrationProviderId,
) {
  return WEBHOOK_INGRESS_PROVIDER_SET.has(providerId);
}

export function sanitizeWebhookHeaders(headers: Headers) {
  const sanitized: Record<string, string> = {};

  for (const headerName of STORED_WEBHOOK_HEADERS) {
    const value = headers.get(headerName);

    if (value) {
      sanitized[headerName] = value.slice(0, 2048);
    }
  }

  return sanitized;
}

export function verifyWebhookDelivery(
  input: VerifyWebhookDeliveryInput,
): IntegrationWebhookVerificationResult {
  switch (input.providerId) {
    case "generic-webhook":
      return verifyGenericWebhook(input);

    case "shopify":
      return verifyShopifyWebhook(input);

    case "stripe":
      return verifyStripeWebhook(input);

    case "whatsapp-business":
      return verifyWhatsAppWebhook(input);

    default:
      throw new IntegrationWebhookError(
        "This connector does not have an inbound webhook adapter yet.",
        "WEBHOOK_PROVIDER_ADAPTER_PENDING",
        409,
        true,
      );
  }
}

export function verifyWhatsAppChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  credentials: CredentialValues;
}) {
  const expectedToken = requiredCredential(
    input.credentials,
    "webhook_verify_token",
    "WhatsApp Business",
  );

  if (
    input.mode !== "subscribe" ||
    !input.token ||
    !safeStringEqual(input.token, expectedToken) ||
    !input.challenge
  ) {
    throw new IntegrationWebhookError(
      "WhatsApp webhook verification failed.",
      "WHATSAPP_WEBHOOK_CHALLENGE_INVALID",
      403,
      true,
    );
  }

  return input.challenge;
}
