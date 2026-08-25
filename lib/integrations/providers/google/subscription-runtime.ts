import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import type {
  IntegrationRuntimeRateLimit,
} from "@/types/integration-runtime";

import {
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

import {
  INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION,
} from "@/types/integration-provider-subscription";

import type {
  GmailSubscriptionOptions,
  GoogleCalendarSubscriptionOptions,
  IntegrationProviderHttpRequestPlan,
  IntegrationProviderSubscriptionAdapter,
  IntegrationProviderSubscriptionCreateInvocation,
  IntegrationProviderSubscriptionPlan,
  IntegrationProviderSubscriptionResult,
  IntegrationProviderSubscriptionStopInvocation,
  IntegrationProviderSubscriptionStopResult,
} from "@/types/integration-provider-subscription";

const GMAIL_WATCH_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/watch";

const GMAIL_STOP_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/stop";

const GOOGLE_CALENDAR_API_ROOT =
  "https://www.googleapis.com/calendar/v3";

const REQUEST_TIMEOUT_MS =
  20_000;

const MAX_RESPONSE_BYTES =
  64 * 1024;

const MAX_CALLBACK_LENGTH =
  2_048;

const MAX_TOPIC_LENGTH =
  1_024;

const MAX_CALENDAR_ID_LENGTH =
  1_024;

const MIN_CALENDAR_TTL_SECONDS =
  60;

const MAX_CALENDAR_TTL_SECONDS =
  604_800;

const GOOGLE_TOPIC_PATTERN =
  /^projects\/[a-z][a-z0-9-]{4,61}[a-z0-9]\/topics\/[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/;

const SAFE_LABEL_PATTERN =
  /^[A-Za-z0-9_-]{1,128}$/;

type ProviderResponse = {
  readonly response: Response;
  readonly data: unknown;
};

function subscriptionError(
  message: string,
  options: {
    code: string;
    category?:
      | "authentication"
      | "authorization"
      | "validation"
      | "rate_limit"
      | "provider"
      | "network"
      | "timeout"
      | "configuration"
      | "internal";
    status?: number;
    retryable?: boolean;
    retryAfterSeconds?: number | null;
  },
): IntegrationRuntimeError {
  return new IntegrationRuntimeError(
    message,
    {
      code:
        options.code,
      category:
        options.category ??
        "provider",
      status:
        options.status ??
        500,
      retryable:
        options.retryable ??
        false,
      retryAfterSeconds:
        options.retryAfterSeconds ??
        null,
    },
  );
}

function sha256Hex(
  value: string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function deterministicUuid(
  seed: string,
): string {
  const digest =
    sha256Hex(seed);

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

function normalizeCallbackUrl(
  value: string,
  live: boolean,
): string {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      MAX_CALLBACK_LENGTH
  ) {
    throw subscriptionError(
      "The Google subscription callback URL is invalid.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_CALLBACK_INVALID",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  let url: URL;

  try {
    url =
      new URL(normalized);
  }
  catch {
    throw subscriptionError(
      "The Google subscription callback URL is invalid.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_CALLBACK_INVALID",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  if (
    url.username ||
    url.password ||
    url.hash
  ) {
    throw subscriptionError(
      "The Google subscription callback URL contains unsupported components.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_CALLBACK_INVALID",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  if (
    live &&
    url.protocol !==
      "https:"
  ) {
    throw subscriptionError(
      "Live Google subscriptions require a public HTTPS callback URL.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_HTTPS_REQUIRED",
        category:
          "configuration",
        status:
          409,
      },
    );
  }

  if (
    !live &&
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw subscriptionError(
      "The Google subscription callback URL protocol is unsupported.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_CALLBACK_PROTOCOL_INVALID",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  return url.toString();
}

function requireMatchingConnection(
  invocation:
    IntegrationProviderSubscriptionCreateInvocation |
    IntegrationProviderSubscriptionStopInvocation,
): void {
  if (
    invocation.connection.providerId !==
      invocation.providerId
  ) {
    throw subscriptionError(
      "The Google subscription provider does not match the integration connection.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_PROVIDER_MISMATCH",
        category:
          "validation",
        status:
          409,
      },
    );
  }

  if (
    invocation.connection.workspaceId !==
      invocation.userId
  ) {
    throw subscriptionError(
      "The Google subscription connection is outside the authorized workspace.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_WORKSPACE_MISMATCH",
        category:
          "authorization",
        status:
          403,
      },
    );
  }

  if (
    invocation.connection.environment !==
      invocation.environment
  ) {
    throw subscriptionError(
      "The Google subscription environment does not match the integration connection.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_ENVIRONMENT_MISMATCH",
        category:
          "validation",
        status:
          409,
      },
    );
  }
}

function requireGmailTopicName(
  options: GmailSubscriptionOptions,
): string {
  const value =
    options.topicName?.trim() ||
    process.env
      .GOOGLE_GMAIL_PUBSUB_TOPIC
      ?.trim() ||
    "";

  if (
    !value ||
    value.length >
      MAX_TOPIC_LENGTH ||
    !GOOGLE_TOPIC_PATTERN.test(
      value,
    )
  ) {
    throw subscriptionError(
      "Gmail Pub/Sub topic configuration is missing or invalid.",
      {
        code:
          "GMAIL_PUBSUB_TOPIC_INVALID",
        category:
          "configuration",
        status:
          503,
      },
    );
  }

  return value;
}

function normalizeGmailLabelIds(
  options: GmailSubscriptionOptions,
): readonly string[] {
  const values =
    options.labelIds ??
    [];

  if (
    values.length >
      100
  ) {
    throw subscriptionError(
      "Gmail watch requests cannot contain more than 100 labels.",
      {
        code:
          "GMAIL_WATCH_LABEL_LIMIT_EXCEEDED",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  const labels =
    values.map(
      (value) =>
        value.trim(),
    );

  if (
    labels.some(
      (value) =>
        !SAFE_LABEL_PATTERN.test(
          value,
        ),
    )
  ) {
    throw subscriptionError(
      "Gmail watch request contains an invalid label ID.",
      {
        code:
          "GMAIL_WATCH_LABEL_INVALID",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  return Array.from(
    new Set(labels),
  );
}

function normalizeCalendarId(
  options:
    GoogleCalendarSubscriptionOptions,
): string {
  const calendarId =
    options.calendarId
      ?.trim() ||
    "primary";

  if (
    !calendarId ||
    calendarId.length >
      MAX_CALENDAR_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(
      calendarId,
    )
  ) {
    throw subscriptionError(
      "Google Calendar watch request contains an invalid calendar ID.",
      {
        code:
          "GOOGLE_CALENDAR_ID_INVALID",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  return calendarId;
}

function normalizeCalendarTtl(
  options:
    GoogleCalendarSubscriptionOptions,
): number {
  const ttl =
    options.ttlSeconds ??
    MAX_CALENDAR_TTL_SECONDS;

  if (
    !Number.isInteger(ttl) ||
    ttl <
      MIN_CALENDAR_TTL_SECONDS ||
    ttl >
      MAX_CALENDAR_TTL_SECONDS
  ) {
    throw subscriptionError(
      "Google Calendar subscription TTL must be between 60 and 604800 seconds.",
      {
        code:
          "GOOGLE_CALENDAR_TTL_INVALID",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  return ttl;
}

function parseRateLimit(
  response: Response,
): IntegrationRuntimeRateLimit | null {
  const limit =
    response.headers.get(
      "x-ratelimit-limit",
    );

  const remaining =
    response.headers.get(
      "x-ratelimit-remaining",
    );

  const reset =
    response.headers.get(
      "x-ratelimit-reset",
    );

  const retryAfter =
    response.headers.get(
      "retry-after",
    );

  if (
    !limit &&
    !remaining &&
    !reset &&
    !retryAfter
  ) {
    return null;
  }

  const numeric = (
    value: string | null,
  ): number | null => {
    if (!value) {
      return null;
    }

    const parsed =
      Number(value);

    return Number.isFinite(
      parsed,
    )
      ? parsed
      : null;
  };

  const resetSeconds =
    numeric(reset);

  return {
    limit:
      numeric(limit),
    remaining:
      numeric(remaining),
    resetAt:
      resetSeconds === null
        ? null
        : new Date(
            resetSeconds * 1000,
          ).toISOString(),
    retryAfterSeconds:
      numeric(retryAfter),
  };
}

function providerRequestId(
  response: Response,
): string | null {
  return (
    response.headers.get(
      "x-guploader-uploadid",
    ) ??
    response.headers.get(
      "x-request-id",
    )
  );
}

function providerSignal(
  signal: AbortSignal,
): AbortSignal {
  return AbortSignal.any([
    signal,
    AbortSignal.timeout(
      REQUEST_TIMEOUT_MS,
    ),
  ]);
}

async function readProviderResponse(
  response: Response,
): Promise<unknown> {
  const text =
    await response.text();

  if (!text.trim()) {
    return {};
  }

  if (
    Buffer.byteLength(
      text,
      "utf8",
    ) >
    MAX_RESPONSE_BYTES
  ) {
    throw subscriptionError(
      "Google returned a subscription response larger than J10 security limits.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_RESPONSE_TOO_LARGE",
        status:
          502,
      },
    );
  }

  try {
    const value: unknown =
      JSON.parse(text);

    return value;
  }
  catch {
    throw subscriptionError(
      "Google returned an unreadable subscription response.",
      {
        code:
          "GOOGLE_SUBSCRIPTION_RESPONSE_INVALID",
        status:
          502,
      },
    );
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value ===
      "object" &&
    !Array.isArray(value);
}

function stringValue(
  value: unknown,
): string | null {
  if (
    typeof value ===
      "string"
  ) {
    const normalized =
      value.trim();

    return normalized ||
      null;
  }

  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return null;
}

function expirationIso(
  value: unknown,
): string | null {
  const raw =
    stringValue(value);

  if (!raw) {
    return null;
  }

  const milliseconds =
    Number(raw);

  if (
    !Number.isFinite(
      milliseconds,
    ) ||
    milliseconds <= 0
  ) {
    return null;
  }

  const date =
    new Date(milliseconds);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

async function readAccessToken(
  invocation:
    IntegrationProviderSubscriptionCreateInvocation |
    IntegrationProviderSubscriptionStopInvocation,
): Promise<string> {
  const credentials =
    await invocation.credentials.read([
      "access_token",
    ]);

  const accessToken =
    credentials.access_token
      ?.trim();

  if (!accessToken) {
    throw subscriptionError(
      "The Google connection does not contain an OAuth access token.",
      {
        code:
          "GOOGLE_ACCESS_TOKEN_MISSING",
        category:
          "authentication",
        status:
          401,
      },
    );
  }

  return accessToken;
}

async function callGoogle(
  input: {
    url: string;
    accessToken: string;
    body?: Readonly<Record<string, unknown>>;
    signal: AbortSignal;
  },
): Promise<ProviderResponse> {
  try {
    const response =
      await fetch(
        input.url,
        {
          method:
            "POST",
          headers: {
            Accept:
              "application/json",
            Authorization:
              `Bearer ${input.accessToken}`,
            ...(input.body
              ? {
                  "Content-Type":
                    "application/json",
                }
              : {}),
          },
          body:
            input.body
              ? JSON.stringify(
                  input.body,
                )
              : undefined,
          cache:
            "no-store",
          redirect:
            "error",
          signal:
            providerSignal(
              input.signal,
            ),
        },
      );

    const data =
      await readProviderResponse(
        response,
      );

    if (!response.ok) {
      const retryAfter =
        Number(
          response.headers.get(
            "retry-after",
          ),
        );

      throw subscriptionError(
        "Google rejected the provider subscription request.",
        {
          code:
            response.status === 401
              ? "GOOGLE_SUBSCRIPTION_AUTHENTICATION_FAILED"
              : response.status === 403
                ? "GOOGLE_SUBSCRIPTION_PERMISSION_DENIED"
                : response.status === 429
                  ? "GOOGLE_SUBSCRIPTION_RATE_LIMITED"
                  : "GOOGLE_SUBSCRIPTION_PROVIDER_REJECTED",
          category:
            response.status === 401
              ? "authentication"
              : response.status === 403
                ? "authorization"
                : response.status === 429
                  ? "rate_limit"
                  : "provider",
          status:
            response.status === 401 ||
            response.status === 403
              ? response.status
              : 502,
          retryable:
            response.status === 429 ||
            response.status >= 500,
          retryAfterSeconds:
            Number.isFinite(
              retryAfter,
            )
              ? retryAfter
              : null,
        },
      );
    }

    return {
      response,
      data,
    };
  }
  catch (error) {
    if (
      error instanceof
      IntegrationRuntimeError
    ) {
      throw error;
    }

    throw subscriptionError(
      "J10 could not reach Google securely for the provider subscription.",
      {
        code:
          error instanceof DOMException &&
          (
            error.name ===
              "TimeoutError" ||
            error.name ===
              "AbortError"
          )
            ? "GOOGLE_SUBSCRIPTION_TIMEOUT"
            : "GOOGLE_SUBSCRIPTION_NETWORK_ERROR",
        category:
          error instanceof DOMException &&
          (
            error.name ===
              "TimeoutError" ||
            error.name ===
              "AbortError"
          )
            ? "timeout"
            : "network",
        status:
          502,
        retryable:
          true,
      },
    );
  }
}

function gmailPlan(
  invocation:
    Extract<
      IntegrationProviderSubscriptionCreateInvocation,
      {
        providerId: "gmail";
      }
    >,
  callbackUrl: string,
  topicName: string,
  labelIds: readonly string[],
): IntegrationProviderSubscriptionPlan {
  const body:
    Record<string, unknown> = {
      topicName,
    };

  if (
    labelIds.length > 0
  ) {
    body.labelIds =
      labelIds;

    body.labelFilterBehavior =
      invocation.options
        .labelFilterBehavior ??
      "include";
  }

  return {
    schemaVersion:
      INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION,
    providerId:
      "gmail",
    kind:
      "gmail.mailbox.watch",
    mode:
      invocation.mode,
    environment:
      invocation.environment,
    callbackUrl,
    request: {
      method:
        "POST",
      url:
        GMAIL_WATCH_URL,
      headerNames: [
        "Accept",
        "Authorization",
        "Content-Type",
      ],
      body,
    },
    externalSideEffect:
      invocation.mode ===
      "live",
  };
}

function calendarPlan(
  invocation:
    Extract<
      IntegrationProviderSubscriptionCreateInvocation,
      {
        providerId: "google-calendar";
      }
    >,
  callbackUrl: string,
  calendarId: string,
  ttlSeconds: number,
  channelId: string,
): IntegrationProviderSubscriptionPlan {
  return {
    schemaVersion:
      INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION,
    providerId:
      "google-calendar",
    kind:
      "google-calendar.events.watch",
    mode:
      invocation.mode,
    environment:
      invocation.environment,
    callbackUrl,
    request: {
      method:
        "POST",
      url:
        `${GOOGLE_CALENDAR_API_ROOT}/calendars/${encodeURIComponent(
          calendarId,
        )}/events/watch`,
      headerNames: [
        "Accept",
        "Authorization",
        "Content-Type",
      ],
      body: {
        id:
          channelId,
        type:
          "web_hook",
        address:
          callbackUrl,
        token:
          "[redacted]",
        params: {
          ttl:
            String(
              ttlSeconds,
            ),
        },
      },
    },
    externalSideEffect:
      invocation.mode ===
      "live",
  };
}

async function createGmailSubscription(
  invocation:
    Extract<
      IntegrationProviderSubscriptionCreateInvocation,
      {
        providerId: "gmail";
      }
    >,
): Promise<IntegrationProviderSubscriptionResult> {
  const callbackUrl =
    normalizeCallbackUrl(
      invocation.callbackUrl,
      invocation.mode ===
        "live",
    );

  const topicName =
    requireGmailTopicName(
      invocation.options,
    );

  const labelIds =
    normalizeGmailLabelIds(
      invocation.options,
    );

  const plan =
    gmailPlan(
      invocation,
      callbackUrl,
      topicName,
      labelIds,
    );

  if (
    invocation.mode ===
      "simulate"
  ) {
    const historyId =
      sha256Hex(
        `${invocation.connection.id}:${topicName}`,
      ).slice(
        0,
        20,
      );

    return {
      success:
        true,
      simulated:
        true,
      providerId:
        "gmail",
      kind:
        "gmail.mailbox.watch",
      state:
        "simulated",
      externalChannelId:
        null,
      externalResourceId:
        null,
      externalHistoryId:
        historyId,
      expiresAt:
        null,
      channelTokenSha256:
        null,
      providerRequestId:
        null,
      rateLimit:
        null,
      plan,
      metadata: {
        topicName,
        labelIds,
        labelFilterBehavior:
          invocation.options
            .labelFilterBehavior ??
          "include",
        externalSideEffect:
          false,
      },
    };
  }

  const accessToken =
    await readAccessToken(
      invocation,
    );

  const response =
    await callGoogle({
      url:
        GMAIL_WATCH_URL,
      accessToken,
      body:
        plan.request.body ??
        undefined,
      signal:
        invocation.signal,
    });

  if (
    !isRecord(
      response.data,
    )
  ) {
    throw subscriptionError(
      "Gmail returned an invalid watch response.",
      {
        code:
          "GMAIL_WATCH_RESPONSE_INVALID",
        status:
          502,
      },
    );
  }

  const historyId =
    stringValue(
      response.data.historyId,
    );

  if (!historyId) {
    throw subscriptionError(
      "Gmail watch response did not contain a history checkpoint.",
      {
        code:
          "GMAIL_WATCH_HISTORY_ID_MISSING",
        status:
          502,
      },
    );
  }

  return {
    success:
      true,
    simulated:
      false,
    providerId:
      "gmail",
    kind:
      "gmail.mailbox.watch",
    state:
      "active",
    externalChannelId:
      null,
    externalResourceId:
      null,
    externalHistoryId:
      historyId,
    expiresAt:
      expirationIso(
        response.data.expiration,
      ),
    channelTokenSha256:
      null,
    providerRequestId:
      providerRequestId(
        response.response,
      ),
    rateLimit:
      parseRateLimit(
        response.response,
      ),
    plan,
    metadata: {
      topicName,
      labelIds,
      labelFilterBehavior:
        invocation.options
          .labelFilterBehavior ??
        "include",
      externalSideEffect:
        true,
    },
  };
}

async function createCalendarSubscription(
  invocation:
    Extract<
      IntegrationProviderSubscriptionCreateInvocation,
      {
        providerId: "google-calendar";
      }
    >,
): Promise<IntegrationProviderSubscriptionResult> {
  const callbackUrl =
    normalizeCallbackUrl(
      invocation.callbackUrl,
      invocation.mode ===
        "live",
    );

  const calendarId =
    normalizeCalendarId(
      invocation.options,
    );

  const ttlSeconds =
    normalizeCalendarTtl(
      invocation.options,
    );

  const seed =
    [
      invocation.connection.id,
      calendarId,
      invocation.correlationId,
    ].join(":");

  const channelId =
    invocation.mode ===
      "simulate"
      ? deterministicUuid(
          seed,
        )
      : randomUUID();

  const channelToken =
    invocation.mode ===
      "simulate"
      ? sha256Hex(
          `simulation:${seed}`,
        )
      : randomBytes(
          32,
        ).toString(
          "base64url",
        );

  const channelTokenSha256 =
    sha256Hex(
      channelToken,
    );

  const plan =
    calendarPlan(
      invocation,
      callbackUrl,
      calendarId,
      ttlSeconds,
      channelId,
    );

  if (
    invocation.mode ===
      "simulate"
  ) {
    return {
      success:
        true,
      simulated:
        true,
      providerId:
        "google-calendar",
      kind:
        "google-calendar.events.watch",
      state:
        "simulated",
      externalChannelId:
        channelId,
      externalResourceId:
        `simulation:${calendarId}`,
      externalHistoryId:
        null,
      expiresAt:
        new Date(
          Date.now() +
          ttlSeconds *
            1000,
        ).toISOString(),
      channelTokenSha256,
      providerRequestId:
        null,
      rateLimit:
        null,
      plan,
      metadata: {
        calendarId,
        ttlSeconds,
        externalSideEffect:
          false,
      },
    };
  }

  const accessToken =
    await readAccessToken(
      invocation,
    );

  const requestBody = {
    id:
      channelId,
    type:
      "web_hook",
    address:
      callbackUrl,
    token:
      channelToken,
    params: {
      ttl:
        String(
          ttlSeconds,
        ),
    },
  };

  const response =
    await callGoogle({
      url:
        plan.request.url,
      accessToken,
      body:
        requestBody,
      signal:
        invocation.signal,
    });

  if (
    !isRecord(
      response.data,
    )
  ) {
    throw subscriptionError(
      "Google Calendar returned an invalid watch response.",
      {
        code:
          "GOOGLE_CALENDAR_WATCH_RESPONSE_INVALID",
        status:
          502,
      },
    );
  }

  const externalChannelId =
    stringValue(
      response.data.id,
    );

  const externalResourceId =
    stringValue(
      response.data.resourceId,
    );

  if (
    !externalChannelId ||
    !externalResourceId
  ) {
    throw subscriptionError(
      "Google Calendar watch response did not contain required channel identifiers.",
      {
        code:
          "GOOGLE_CALENDAR_WATCH_IDENTIFIERS_MISSING",
        status:
          502,
      },
    );
  }

  return {
    success:
      true,
    simulated:
      false,
    providerId:
      "google-calendar",
    kind:
      "google-calendar.events.watch",
    state:
      "active",
    externalChannelId,
    externalResourceId,
    externalHistoryId:
      null,
    expiresAt:
      expirationIso(
        response.data.expiration,
      ),
    channelTokenSha256,
    providerRequestId:
      providerRequestId(
        response.response,
      ),
    rateLimit:
      parseRateLimit(
        response.response,
      ),
    plan,
    metadata: {
      calendarId,
      ttlSeconds,
      resourceUri:
        stringValue(
          response.data.resourceUri,
        ),
      externalSideEffect:
        true,
    },
  };
}

async function stopGoogleSubscription(
  invocation:
    IntegrationProviderSubscriptionStopInvocation,
): Promise<IntegrationProviderSubscriptionStopResult> {
  requireMatchingConnection(
    invocation,
  );

  if (
    invocation.mode ===
      "simulate"
  ) {
    return {
      success:
        true,
      simulated:
        true,
      providerId:
        invocation.providerId,
      kind:
        invocation.kind,
      state:
        "simulated",
      stoppedAt:
        new Date().toISOString(),
      providerRequestId:
        null,
      rateLimit:
        null,
    };
  }

  const accessToken =
    await readAccessToken(
      invocation,
    );

  if (
    invocation.providerId ===
      "gmail"
  ) {
    const response =
      await callGoogle({
        url:
          GMAIL_STOP_URL,
        accessToken,
        signal:
          invocation.signal,
      });

    return {
      success:
        true,
      simulated:
        false,
      providerId:
        "gmail",
      kind:
        "gmail.mailbox.watch",
      state:
        "stopped",
      stoppedAt:
        new Date().toISOString(),
      providerRequestId:
        providerRequestId(
          response.response,
        ),
      rateLimit:
        parseRateLimit(
          response.response,
        ),
    };
  }

  const channelId =
    invocation
      .externalChannelId
      .trim();

  const resourceId =
    invocation
      .externalResourceId
      .trim();

  if (
    !channelId ||
    !resourceId
  ) {
    throw subscriptionError(
      "Google Calendar channel and resource identifiers are required.",
      {
        code:
          "GOOGLE_CALENDAR_STOP_IDENTIFIERS_MISSING",
        category:
          "validation",
        status:
          400,
      },
    );
  }

  const response =
    await callGoogle({
      url:
        `${GOOGLE_CALENDAR_API_ROOT}/channels/stop`,
      accessToken,
      body: {
        id:
          channelId,
        resourceId,
      },
      signal:
        invocation.signal,
    });

  return {
    success:
      true,
    simulated:
      false,
    providerId:
      "google-calendar",
    kind:
      "google-calendar.events.watch",
    state:
      "stopped",
    stoppedAt:
      new Date().toISOString(),
    providerRequestId:
      providerRequestId(
        response.response,
      ),
    rateLimit:
      parseRateLimit(
        response.response,
      ),
  };
}

async function createGoogleSubscription(
  invocation:
    IntegrationProviderSubscriptionCreateInvocation,
): Promise<IntegrationProviderSubscriptionResult> {
  requireMatchingConnection(
    invocation,
  );

  if (
    invocation.providerId ===
      "gmail"
  ) {
    return createGmailSubscription(
      invocation,
    );
  }

  return createCalendarSubscription(
    invocation,
  );
}

export const GOOGLE_PROVIDER_SUBSCRIPTION_ADAPTER:
  IntegrationProviderSubscriptionAdapter = {
    manifest: {
      schemaVersion:
        INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION,
      adapterId:
        "j10.google.provider-subscriptions",
      adapterVersion:
        "1.0.0",
      state:
        "development",
      providerIds: [
        "gmail",
        "google-calendar",
      ],
      kinds: [
        "gmail.mailbox.watch",
        "google-calendar.events.watch",
      ],
      modes: [
        "simulate",
        "live",
      ],
      supportsStart:
        true,
      supportsStop:
        true,
      requestTimeoutMs:
        REQUEST_TIMEOUT_MS,
    },

    create:
      createGoogleSubscription,

    stop:
      stopGoogleSubscription,
  };
  