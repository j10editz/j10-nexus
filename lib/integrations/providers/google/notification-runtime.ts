import "server-only";

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  EXTERNAL_TRIGGER_SCHEMA_VERSION,
} from "@/types/external-trigger";

import type {
  ExternalTriggerEvent,
} from "@/types/external-trigger";

import type {
  IntegrationWebhookEndpoint,
  IntegrationWebhookEvent,
} from "@/types/integration-webhook";

const MAX_IDENTIFIER_LENGTH =
  1_024;

const MAX_ATTRIBUTE_COUNT =
  32;

const MAX_ATTRIBUTE_VALUE_LENGTH =
  1_024;

const GOOGLE_CALENDAR_TOKEN_HASH_PATTERN =
  /^[a-f0-9]{64}$/i;

export type GoogleNotificationProviderId =
  | "gmail"
  | "google-calendar";

export type GoogleAcceptedNotificationSignatureStatus =
  | "valid"
  | "not_required"
  | "not_configured";

export interface GoogleProviderNotificationSubscription {
  readonly id: string;

  readonly providerId:
    GoogleNotificationProviderId;

  readonly kind:
    | "gmail.mailbox.watch"
    | "google-calendar.events.watch";

  readonly state:
    "active";

  readonly externalChannelId:
    string | null;

  readonly externalResourceId:
    string | null;

  readonly externalHistoryId:
    string | null;

  readonly channelTokenSha256:
    string | null;
}

export interface GoogleProviderNotificationReceipt {
  readonly providerId:
    GoogleNotificationProviderId;

  readonly eventType: string;
  readonly capabilityId: string;
  readonly providerEventType: string;
  readonly externalEventId: string;
  readonly replayKey: string;

  readonly signatureStatus:
    GoogleAcceptedNotificationSignatureStatus;

  readonly occurredAt: string;
  readonly payloadSha256: string;

  readonly payload:
    Readonly<Record<string, unknown>>;

  readonly headers:
    Readonly<Record<string, string>>;

  readonly subject: {
    readonly type: string;
    readonly id: string | null;
    readonly label: string | null;
  };

  readonly data:
    Readonly<Record<string, unknown>>;

  readonly externalHistoryId:
    string | null;

  readonly dispatch: boolean;
}

export class GoogleProviderNotificationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly expose: boolean;

  constructor(
    message: string,
    options: {
      readonly code: string;
      readonly status?: number;
      readonly expose?: boolean;
    },
  ) {
    super(message);

    this.name =
      "GoogleProviderNotificationError";

    this.code =
      options.code;

    this.status =
      options.status ?? 400;

    this.expose =
      options.expose ?? true;
  }
}

function notificationError(
  message: string,
  code: string,
  status = 400,
): GoogleProviderNotificationError {
  return new GoogleProviderNotificationError(
    message,
    {
      code,
      status,
      expose: true,
    },
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

function sha256Hex(
  value: string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function safeIdentifier(
  value: string,
): string {
  return value
    .trim()
    .slice(
      0,
      MAX_IDENTIFIER_LENGTH,
    );
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  errorCode: string,
): string {
  const value =
    record[key];

  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    throw notificationError(
      `Google notification field ${key} is missing.`,
      errorCode,
    );
  }

  const normalized =
    safeIdentifier(
      String(value),
    );

  if (!normalized) {
    throw notificationError(
      `Google notification field ${key} is invalid.`,
      errorCode,
    );
  }

  return normalized;
}

function optionalString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return null;
  }

  const normalized =
    safeIdentifier(
      String(value),
    );

  return normalized || null;
}

function safeOccurredAt(
  value: unknown,
  fallback: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return fallback;
  }

  const timestamp =
    Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return fallback;
  }

  return new Date(
    timestamp,
  ).toISOString();
}

function safeAttributes(
  value: unknown,
): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    return {};
  }

  const entries =
    Object.entries(value)
      .filter(
        (
          entry,
        ): entry is [string, string] =>
          typeof entry[1] ===
          "string",
      )
      .slice(
        0,
        MAX_ATTRIBUTE_COUNT,
      )
      .map(
        ([key, attributeValue]) => [
          key.slice(0, 128),
          attributeValue.slice(
            0,
            MAX_ATTRIBUTE_VALUE_LENGTH,
          ),
        ],
      );

  return Object.fromEntries(
    entries,
  );
}

function decodePubSubData(
  encodedData: string,
): Record<string, unknown> {
  if (
    !encodedData ||
    encodedData.length >
      64 * 1024
  ) {
    throw notificationError(
      "Google Pub/Sub message data is invalid.",
      "GOOGLE_PUBSUB_DATA_INVALID",
    );
  }

  let decoded: string;

  try {
    decoded =
      Buffer.from(
        encodedData,
        "base64",
      ).toString("utf8");
  }
  catch {
    throw notificationError(
      "Google Pub/Sub message data could not be decoded.",
      "GOOGLE_PUBSUB_DATA_INVALID",
    );
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(
        decoded,
      ) as unknown;
  }
  catch {
    throw notificationError(
      "Google Pub/Sub message data contains invalid JSON.",
      "GOOGLE_PUBSUB_DATA_JSON_INVALID",
    );
  }

  if (!isRecord(parsed)) {
    throw notificationError(
      "Google Pub/Sub message data must contain an object.",
      "GOOGLE_PUBSUB_DATA_OBJECT_REQUIRED",
    );
  }

  return parsed;
}

function sanitizeGoogleHeaders(
  headers: Headers,
): Record<string, string> {
  const allowedHeaderNames = [
    "content-type",
    "user-agent",
    "x-cloud-trace-context",
    "x-goog-channel-id",
    "x-goog-resource-id",
    "x-goog-resource-state",
    "x-goog-resource-uri",
    "x-goog-message-number",
    "x-goog-changed",
  ] as const;

  const sanitized:
    Record<string, string> = {};

  for (
    const headerName of
    allowedHeaderNames
  ) {
    const value =
      headers.get(
        headerName,
      );

    if (value) {
      sanitized[headerName] =
        value.slice(
          0,
          2_048,
        );
    }
  }

  return sanitized;
}

function constantTimeHexEqual(
  expectedHex: string,
  actualHex: string,
): boolean {
  if (
    !GOOGLE_CALENDAR_TOKEN_HASH_PATTERN.test(
      expectedHex,
    ) ||
    !GOOGLE_CALENDAR_TOKEN_HASH_PATTERN.test(
      actualHex,
    )
  ) {
    return false;
  }

  const expected =
    Buffer.from(
      expectedHex,
      "hex",
    );

  const actual =
    Buffer.from(
      actualHex,
      "hex",
    );

  return (
    expected.length ===
      actual.length &&
    timingSafeEqual(
      expected,
      actual,
    )
  );
}

function parseGmailNotification(
  rawBody: string,
  headers: Headers,
  subscription:
    GoogleProviderNotificationSubscription,
  receivedAt: string,
): GoogleProviderNotificationReceipt {
  let body: unknown;

  try {
    body =
      JSON.parse(
        rawBody,
      ) as unknown;
  }
  catch {
    throw notificationError(
      "Google Pub/Sub notification contains invalid JSON.",
      "GOOGLE_PUBSUB_JSON_INVALID",
    );
  }

  if (!isRecord(body)) {
    throw notificationError(
      "Google Pub/Sub notification must contain an object.",
      "GOOGLE_PUBSUB_OBJECT_REQUIRED",
    );
  }

  const message =
    body.message;

  if (!isRecord(message)) {
    throw notificationError(
      "Google Pub/Sub notification is missing its message.",
      "GOOGLE_PUBSUB_MESSAGE_REQUIRED",
    );
  }

  const messageId =
    requiredString(
      message,
      "messageId",
      "GOOGLE_PUBSUB_MESSAGE_ID_REQUIRED",
    );

  const encodedData =
    requiredString(
      message,
      "data",
      "GOOGLE_PUBSUB_DATA_REQUIRED",
    );

  const decoded =
    decodePubSubData(
      encodedData,
    );

  const emailAddress =
    requiredString(
      decoded,
      "emailAddress",
      "GMAIL_PUSH_EMAIL_REQUIRED",
    );

  const historyId =
    requiredString(
      decoded,
      "historyId",
      "GMAIL_PUSH_HISTORY_ID_REQUIRED",
    );

  const pubSubSubscription =
    optionalString(
      body.subscription,
    );

  const occurredAt =
    safeOccurredAt(
      message.publishTime,
      receivedAt,
    );

  const attributes =
    safeAttributes(
      message.attributes,
    );

  const payload = {
    messageId,

    publishTime:
      optionalString(
        message.publishTime,
      ),

    subscription:
      pubSubSubscription,

    emailAddress,
    historyId,
    attributes,

    deliveryAttempt:
      typeof body.deliveryAttempt ===
      "number"
        ? body.deliveryAttempt
        : null,
  };

  return {
    providerId:
      "gmail",

    eventType:
      "gmail.push.notification",

    capabilityId:
      "gmail.message.received",

    providerEventType:
      "gmail.message.received",

    externalEventId:
      messageId,

    replayKey:
      sha256Hex(
        [
          "gmail",
          subscription.id,
          pubSubSubscription ??
            "unknown-subscription",
          messageId,
        ].join(":"),
      ),

    /*
    Google Pub/Sub authentication is configured on the
    Pub/Sub push subscription. The high-entropy J10 endpoint
    key protects this receiver, while full Google OIDC JWT
    verification will be activated with the deployment layer.
    */
    signatureStatus:
      "not_configured",

    occurredAt,

    payloadSha256:
      sha256Hex(
        rawBody,
      ),

    payload,

    headers:
      sanitizeGoogleHeaders(
        headers,
      ),

    subject: {
      type:
        "gmail.mailbox",

      id:
        emailAddress,

      label:
        emailAddress,
    },

    data: {
      emailAddress,
      historyId,
      messageId,
      pubSubSubscription,
      attributes,

      hydrationRequired:
        true,
    },

    externalHistoryId:
      historyId,

    dispatch:
      true,
  };
}

function parseCalendarNotification(
  rawBody: string,
  headers: Headers,
  subscription:
    GoogleProviderNotificationSubscription,
  receivedAt: string,
): GoogleProviderNotificationReceipt {
  const channelId =
    safeIdentifier(
      headers.get(
        "x-goog-channel-id",
      ) ?? "",
    );

  const resourceId =
    safeIdentifier(
      headers.get(
        "x-goog-resource-id",
      ) ?? "",
    );

  const resourceState =
    safeIdentifier(
      headers.get(
        "x-goog-resource-state",
      ) ?? "",
    ).toLowerCase();

  const messageNumber =
    safeIdentifier(
      headers.get(
        "x-goog-message-number",
      ) ?? "",
    );

  const channelToken =
    headers.get(
      "x-goog-channel-token",
    ) ?? "";

  if (
    !channelId ||
    !resourceId ||
    !resourceState ||
    !messageNumber
  ) {
    throw notificationError(
      "Google Calendar notification headers are incomplete.",
      "GOOGLE_CALENDAR_NOTIFICATION_HEADERS_INVALID",
    );
  }

  if (
    subscription.externalChannelId &&
    channelId !==
      subscription.externalChannelId
  ) {
    throw notificationError(
      "Google Calendar channel identifier does not match the active subscription.",
      "GOOGLE_CALENDAR_CHANNEL_MISMATCH",
      401,
    );
  }

  if (
    subscription.externalResourceId &&
    resourceId !==
      subscription.externalResourceId
  ) {
    throw notificationError(
      "Google Calendar resource identifier does not match the active subscription.",
      "GOOGLE_CALENDAR_RESOURCE_MISMATCH",
      401,
    );
  }

  if (
    !subscription.channelTokenSha256 ||
    !channelToken
  ) {
    throw notificationError(
      "Google Calendar channel authentication is unavailable.",
      "GOOGLE_CALENDAR_CHANNEL_TOKEN_REQUIRED",
      401,
    );
  }

  const receivedTokenSha256 =
    sha256Hex(
      channelToken,
    );

  if (
    !constantTimeHexEqual(
      subscription.channelTokenSha256,
      receivedTokenSha256,
    )
  ) {
    throw notificationError(
      "Google Calendar channel authentication failed.",
      "GOOGLE_CALENDAR_CHANNEL_TOKEN_INVALID",
      401,
    );
  }

  const resourceUri =
    optionalString(
      headers.get(
        "x-goog-resource-uri",
      ),
    );

  const changed =
    optionalString(
      headers.get(
        "x-goog-changed",
      ),
    );

  const sanitizedHeaders =
    sanitizeGoogleHeaders(
      headers,
    );

  /*
  Store only the SHA-256 digest. The raw channel token
  must never enter webhook payloads, headers, logs, or errors.
  */
  sanitizedHeaders[
    "x-goog-channel-token-sha256"
  ] = receivedTokenSha256;

  const syncNotification =
    resourceState ===
      "sync";

  const cancelledNotification =
    resourceState ===
      "not_exists";

  const capabilityId =
    cancelledNotification
      ? "google-calendar.event.cancelled"
      : "google-calendar.event.updated";

  const externalEventId =
    `${channelId}:${messageNumber}`;

  const payload = {
    channelId,
    resourceId,
    resourceState,
    resourceUri,
    messageNumber,
    changed,

    bodyPresent:
      Boolean(
        rawBody.trim(),
      ),
  };

  return {
    providerId:
      "google-calendar",

    eventType:
      "google-calendar.push.notification",

    capabilityId,

    providerEventType:
      capabilityId,

    externalEventId,

    replayKey:
      sha256Hex(
        [
          "google-calendar",
          subscription.id,
          channelId,
          resourceId,
          messageNumber,
        ].join(":"),
      ),

    signatureStatus:
      "valid",

    occurredAt:
      receivedAt,

    payloadSha256:
      sha256Hex(
        rawBody,
      ),

    payload,

    headers:
      sanitizedHeaders,

    subject: {
      type:
        "google-calendar.resource",

      id:
        resourceId,

      label:
        resourceState,
    },

    data: {
      channelId,
      resourceId,
      resourceState,
      resourceUri,
      messageNumber,
      changed,

      hydrationRequired:
        !syncNotification,

      syncNotification,
      cancelledNotification,
    },

    externalHistoryId:
      null,

    /*
    Calendar sends a sync notification immediately after
    channel creation. It confirms the channel but does not
    represent a business event, so no workflow is dispatched.
    */
    dispatch:
      !syncNotification,
  };
}

export function parseGoogleProviderNotification(args: {
  readonly providerId:
    GoogleNotificationProviderId;

  readonly rawBody: string;
  readonly headers: Headers;

  readonly subscription:
    GoogleProviderNotificationSubscription;

  readonly receivedAt: string;
}): GoogleProviderNotificationReceipt {
  if (
    args.subscription.state !==
      "active"
  ) {
    throw notificationError(
      "The Google provider subscription is not active.",
      "GOOGLE_SUBSCRIPTION_NOT_ACTIVE",
      410,
    );
  }

  if (
    args.subscription.providerId !==
      args.providerId
  ) {
    throw notificationError(
      "The Google notification provider does not match its subscription.",
      "GOOGLE_SUBSCRIPTION_PROVIDER_MISMATCH",
      409,
    );
  }

  if (
    args.providerId ===
      "gmail"
  ) {
    return parseGmailNotification(
      args.rawBody,
      args.headers,
      args.subscription,
      args.receivedAt,
    );
  }

  return parseCalendarNotification(
    args.rawBody,
    args.headers,
    args.subscription,
    args.receivedAt,
  );
}

export function buildGoogleExternalTriggerEvent(args: {
  readonly endpoint:
    IntegrationWebhookEndpoint;

  readonly event:
    IntegrationWebhookEvent;

  readonly receipt:
    GoogleProviderNotificationReceipt;
}): ExternalTriggerEvent {
  return {
    schemaVersion:
      EXTERNAL_TRIGGER_SCHEMA_VERSION,

    id:
      args.event.id,

    externalEventId:
      args.receipt.externalEventId,

    dedupeKey:
      args.receipt.replayKey,

    capabilityId:
      args.receipt.capabilityId,

    providerEventType:
      args.receipt.providerEventType,

    workspaceId:
      args.endpoint.userId,

    occurredAt:
      args.receipt.occurredAt,

    receivedAt:
      args.event.receivedAt,

    source: {
      kind:
        "integration_webhook",

      providerId:
        args.endpoint.providerId,

      integrationId:
        args.endpoint.integrationId,

      endpointId:
        args.endpoint.id,

      requestId:
        args.event.requestId,

      signatureStatus:
        args.receipt.signatureStatus,
    },

    subject:
      args.receipt.subject,

    actor:
      null,

    data: {
      ...args.receipt.data,
    },

    metadata: {
      payloadSha256:
        args.event.payloadSha256,

      adapterVersion:
        "day14h.v1",
    },
  };
}