import "server-only";

import {
  createHash,
} from "node:crypto";

import type {
  GoogleCalendarCancelEventInput,
  GoogleCalendarCreateEventInput,
  GoogleCalendarSendUpdates,
  GoogleCalendarUpdateEventInput,
} from "@/types/integration-google-calendar";

import {
  GOOGLE_CALENDAR_SEND_UPDATE_OPTIONS,
} from "@/types/integration-google-calendar";

import type {
  IntegrationConnectorRuntimeAdapter,
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeErrorCategory,
  IntegrationRuntimeHealthResult,
  IntegrationRuntimeInvocationContext,
  IntegrationRuntimeResult,
  IntegrationRuntimeTokenRefreshInvocation,
  IntegrationRuntimeTokenRefreshResult,
  IntegrationRuntimeTokenRevocationResult,
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

const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

const GOOGLE_CALENDAR_API_BASE_URL =
  "https://www.googleapis.com/calendar/v3";

const MAX_PROVIDER_RESPONSE_BYTES =
  64 * 1024;

const MAX_CALENDAR_ID_LENGTH =
  1_024;

const MAX_EVENT_ID_LENGTH =
  1_024;

const MAX_SUMMARY_LENGTH =
  1_024;

const MAX_DESCRIPTION_LENGTH =
  16_384;

const MAX_LOCATION_LENGTH =
  1_024;

const MAX_TIME_ZONE_LENGTH =
  255;

const MAX_ATTENDEES =
  100;

function runtimeError(
  code: string,
  message: string,
  options: {
    category?: IntegrationRuntimeErrorCategory;
    status?: number;
    retryable?: boolean;
    retryAfterSeconds?: number | null;
  } = {},
): IntegrationRuntimeError {
  return new IntegrationRuntimeError(
    message,
    {
      code,
      category:
        options.category ??
        "validation",
      status:
        options.status ??
        400,
      retryable:
        options.retryable ??
        false,
      retryAfterSeconds:
        options.retryAfterSeconds ??
        null,
    },
  );
}

function requireRecord(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_INPUT",
      "Google Calendar action input must be an object.",
    );
  }

  return value as Readonly<
    Record<string, unknown>
  >;
}

function requireString(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
  maximumLength: number,
): string {
  const value =
    input[key];

  if (
    typeof value !== "string"
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_REQUIRED_FIELD",
      `${label} is required.`,
    );
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maximumLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(
      normalized,
    )
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_FIELD",
      `${label} is invalid.`,
    );
  }

  return normalized;
}

function optionalString(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
  maximumLength: number,
): string | undefined {
  const value =
    input[key];

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return requireString(
    input,
    key,
    label,
    maximumLength,
  );
}

function normalizeCalendarId(
  input: Readonly<Record<string, unknown>>,
): string {
  return (
    optionalString(
      input,
      "calendarId",
      "Calendar ID",
      MAX_CALENDAR_ID_LENGTH,
    ) ??
    "primary"
  );
}

function normalizeEventId(
  input: Readonly<Record<string, unknown>>,
): string {
  return requireString(
    input,
    "eventId",
    "Event ID",
    MAX_EVENT_ID_LENGTH,
  );
}

function normalizeDateTime(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): string {
  const value =
    requireString(
      input,
      key,
      label,
      128,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(
      Date.parse(value),
    )
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_DATETIME",
      `${label} must be a valid RFC 3339 date and time with a timezone offset.`,
    );
  }

  return value;
}

function optionalDateTime(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): string | undefined {
  if (
    input[key] === undefined ||
    input[key] === null
  ) {
    return undefined;
  }

  return normalizeDateTime(
    input,
    key,
    label,
  );
}

function normalizeTimeZone(
  input: Readonly<Record<string, unknown>>,
): string | undefined {
  const timeZone =
    optionalString(
      input,
      "timeZone",
      "Timezone",
      MAX_TIME_ZONE_LENGTH,
    );

  if (!timeZone) {
    return undefined;
  }

  try {
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
      },
    ).format();
  }
  catch {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_TIMEZONE",
      "The Google Calendar timezone is invalid.",
    );
  }

  return timeZone;
}

function normalizeEmailAddress(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_ATTENDEE",
      "Calendar attendees must contain valid email addresses.",
    );
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalized,
    ) ||
    normalized.length > 320
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_ATTENDEE",
      "Calendar attendees must contain valid email addresses.",
    );
  }

  return normalized;
}

function normalizeAttendees(
  input: Readonly<Record<string, unknown>>,
): readonly string[] | undefined {
  const value =
    input.attendees;

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.length > MAX_ATTENDEES
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_ATTENDEES",
      `Calendar attendees must contain no more than ${MAX_ATTENDEES} addresses.`,
    );
  }

  const attendees =
    value.map(
      normalizeEmailAddress,
    );

  if (
    new Set(attendees).size !==
    attendees.length
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_DUPLICATE_ATTENDEE",
      "Calendar attendees cannot contain duplicate addresses.",
    );
  }

  return attendees;
}

function normalizeSendUpdates(
  input: Readonly<Record<string, unknown>>,
): GoogleCalendarSendUpdates {
  const value =
    input.sendUpdates ??
    "all";

  if (
    typeof value !== "string" ||
    !GOOGLE_CALENDAR_SEND_UPDATE_OPTIONS.includes(
      value as GoogleCalendarSendUpdates,
    )
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_SEND_UPDATES",
      "Google Calendar notification behavior is invalid.",
    );
  }

  return value as GoogleCalendarSendUpdates;
}

function validateDateRange(
  start: string,
  end: string,
): void {
  if (
    Date.parse(end) <=
    Date.parse(start)
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INVALID_DATE_RANGE",
      "Calendar event end time must be after its start time.",
    );
  }
}

function normalizeCreateEventInput(
  value: unknown,
): GoogleCalendarCreateEventInput {
  const input =
    requireRecord(value);

  const start =
    normalizeDateTime(
      input,
      "start",
      "Event start",
    );

  const end =
    normalizeDateTime(
      input,
      "end",
      "Event end",
    );

  validateDateRange(
    start,
    end,
  );

  return {
    calendarId:
      normalizeCalendarId(input),
    summary:
      requireString(
        input,
        "summary",
        "Event summary",
        MAX_SUMMARY_LENGTH,
      ),
    description:
      optionalString(
        input,
        "description",
        "Event description",
        MAX_DESCRIPTION_LENGTH,
      ),
    location:
      optionalString(
        input,
        "location",
        "Event location",
        MAX_LOCATION_LENGTH,
      ),
    start,
    end,
    timeZone:
      normalizeTimeZone(input),
    attendees:
      normalizeAttendees(input),
    sendUpdates:
      normalizeSendUpdates(input),
  };
}

function normalizeUpdateEventInput(
  value: unknown,
): GoogleCalendarUpdateEventInput {
  const input =
    requireRecord(value);

  const start =
    optionalDateTime(
      input,
      "start",
      "Event start",
    );

  const end =
    optionalDateTime(
      input,
      "end",
      "Event end",
    );

  if (
    Boolean(start) !==
    Boolean(end)
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_INCOMPLETE_DATE_RANGE",
      "Updating event dates requires both start and end.",
    );
  }

  if (
    start &&
    end
  ) {
    validateDateRange(
      start,
      end,
    );
  }

  const normalized:
    GoogleCalendarUpdateEventInput = {
      calendarId:
        normalizeCalendarId(input),
      eventId:
        normalizeEventId(input),
      summary:
        optionalString(
          input,
          "summary",
          "Event summary",
          MAX_SUMMARY_LENGTH,
        ),
      description:
        optionalString(
          input,
          "description",
          "Event description",
          MAX_DESCRIPTION_LENGTH,
        ),
      location:
        optionalString(
          input,
          "location",
          "Event location",
          MAX_LOCATION_LENGTH,
        ),
      start,
      end,
      timeZone:
        normalizeTimeZone(input),
      attendees:
        normalizeAttendees(input),
      sendUpdates:
        normalizeSendUpdates(input),
    };

  if (
    normalized.summary === undefined &&
    normalized.description === undefined &&
    normalized.location === undefined &&
    normalized.start === undefined &&
    normalized.end === undefined &&
    normalized.timeZone === undefined &&
    normalized.attendees === undefined
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_EMPTY_UPDATE",
      "At least one event field must be supplied for an update.",
    );
  }

  return normalized;
}

function normalizeCancelEventInput(
  value: unknown,
): GoogleCalendarCancelEventInput {
  const input =
    requireRecord(value);

  return {
    calendarId:
      normalizeCalendarId(input),
    eventId:
      normalizeEventId(input),
    sendUpdates:
      normalizeSendUpdates(input),
  };
}

function createOperationFingerprint(
  invocation:
    IntegrationRuntimeActionInvocation,
  metadata:
    Readonly<Record<string, unknown>>,
): string {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify({
        capabilityId:
          invocation.capabilityId,
        idempotencyKey:
          invocation.idempotencyKey,
        metadata,
      }),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
}

function createActionMetadata(
  invocation:
    IntegrationRuntimeActionInvocation,
): Readonly<Record<string, unknown>> {
  switch (
    invocation.capabilityId
  ) {
    case "google-calendar.event.create": {
      const input =
        normalizeCreateEventInput(
          invocation.input,
        );

      return {
        operation:
          "create_event",
        calendar:
          input.calendarId ===
          "primary"
            ? "primary"
            : "custom",
        summaryLength:
          input.summary.length,
        descriptionPresent:
          Boolean(
            input.description,
          ),
        locationPresent:
          Boolean(
            input.location,
          ),
        attendeeCount:
          input.attendees?.length ??
          0,
        durationMinutes:
          Math.round(
            (
              Date.parse(input.end) -
              Date.parse(input.start)
            ) /
              60_000,
          ),
        notificationMode:
          input.sendUpdates,
      };
    }

    case "google-calendar.event.update": {
      const input =
        normalizeUpdateEventInput(
          invocation.input,
        );

      return {
        operation:
          "update_event",
        calendar:
          input.calendarId ===
          "primary"
            ? "primary"
            : "custom",
        eventIdPresent:
          true,
        summaryChanged:
          input.summary !==
          undefined,
        descriptionChanged:
          input.description !==
          undefined,
        locationChanged:
          input.location !==
          undefined,
        scheduleChanged:
          input.start !==
          undefined,
        attendeesChanged:
          input.attendees !==
          undefined,
        attendeeCount:
          input.attendees?.length ??
          0,
        notificationMode:
          input.sendUpdates,
      };
    }

    case "google-calendar.event.cancel": {
      const input =
        normalizeCancelEventInput(
          invocation.input,
        );

      return {
        operation:
          "cancel_event",
        calendar:
          input.calendarId ===
          "primary"
            ? "primary"
            : "custom",
        eventIdPresent:
          true,
        notificationMode:
          input.sendUpdates,
      };
    }

    default:
      throw runtimeError(
        "GOOGLE_CALENDAR_CAPABILITY_NOT_SUPPORTED",
        "The requested Google Calendar capability is not installed.",
        {
          status: 501,
          category:
            "configuration",
        },
      );
  }
}

async function readAccessToken(
  context:
    IntegrationRuntimeInvocationContext,
): Promise<string> {
  const credentials =
    await context.credentials.read([
      "access_token",
    ]);

  const accessToken =
    credentials.access_token?.trim();

  if (
    !accessToken ||
    accessToken.length >
      16_384 ||
    /[\u0000-\u0020\u007f]/.test(
      accessToken,
    )
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_ACCESS_TOKEN_MISSING",
      "Google Calendar authorization is unavailable.",
      {
        status: 401,
        category:
          "authentication",
      },
    );
  }

  return accessToken;
}

async function readProviderJson(
  response: Response,
): Promise<unknown> {
  const responseText =
    await response.text();

  if (
    Buffer.byteLength(
      responseText,
      "utf8",
    ) >
    MAX_PROVIDER_RESPONSE_BYTES
  ) {
    throw runtimeError(
      "GOOGLE_CALENDAR_RESPONSE_TOO_LARGE",
      "Google Calendar returned a response exceeding J10 security limits.",
      {
        status: 502,
        category:
          "provider",
      },
    );
  }

  if (!responseText) {
    return {};
  }

  try {
    const value: unknown =
      JSON.parse(
        responseText,
      );

    return value;
  }
  catch {
    throw runtimeError(
      "GOOGLE_CALENDAR_RESPONSE_INVALID",
      "Google Calendar returned an unreadable response.",
      {
        status: 502,
        category:
          "provider",
      },
    );
  }
}

async function calendarHealthCheck(
  context:
    IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeHealthResult> {
  const startedAt =
    Date.now();

  const accessToken =
    await readAccessToken(
      context,
    );

  try {
    const profileUrl =
      new URL(
        `${GOOGLE_CALENDAR_API_BASE_URL}/users/me/calendarList/primary`,
      );

    profileUrl.searchParams.set(
      "fields",
      "id,summary,accessRole",
    );

    const response =
      await fetch(
        profileUrl,
        {
          method:
            "GET",
          headers: {
            Accept:
              "application/json",
            Authorization:
              `Bearer ${accessToken}`,
          },
          cache:
            "no-store",
          redirect:
            "error",
          signal:
            context.signal,
        },
      );

    const providerResponse =
      await readProviderJson(
        response,
      );

    if (!response.ok) {
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        throw runtimeError(
          "GOOGLE_CALENDAR_AUTHORIZATION_REJECTED",
          "Google Calendar rejected the stored authorization.",
          {
            status:
              response.status,
            category:
              response.status === 401
                ? "authentication"
                : "authorization",
          },
        );
      }

      throw runtimeError(
        "GOOGLE_CALENDAR_HEALTH_CHECK_FAILED",
        "Google Calendar health verification failed.",
        {
          status: 502,
          category:
            "provider",
          retryable:
            response.status === 429 ||
            response.status >= 500,
        },
      );
    }

    const profile =
      requireRecord(
        providerResponse,
      );

    return {
      healthy: true,
      checkedAt:
        new Date().toISOString(),
      latencyMs:
        Math.max(
          Date.now() -
            startedAt,
          0,
        ),
      externalAccountId:
        typeof profile.id ===
        "string"
          ? profile.id
          : null,
      externalAccountLabel:
        typeof profile.summary ===
        "string"
          ? profile.summary
          : null,
      metadata: {
        provider:
          "google-calendar",
        accessRole:
          typeof profile.accessRole ===
          "string"
            ? profile.accessRole
            : null,
      },
    };
  }
  catch (error) {
    if (
      error instanceof
      IntegrationRuntimeError
    ) {
      throw error;
    }

    if (
      context.signal.aborted
    ) {
      throw runtimeError(
        "GOOGLE_CALENDAR_REQUEST_ABORTED",
        "Google Calendar health verification timed out.",
        {
          status: 504,
          category:
            "timeout",
          retryable: true,
        },
      );
    }

    throw runtimeError(
      "GOOGLE_CALENDAR_NETWORK_ERROR",
      "J10 could not reach Google Calendar.",
      {
        status: 503,
        category:
          "network",
        retryable: true,
      },
    );
  }
}

async function executeCalendarAction(
  invocation:
    IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const actionMetadata =
    createActionMetadata(
      invocation,
    );

  if (
    invocation.mode ===
    "live"
  ) {
    return executeGoogleLiveAction(
      invocation,
    );
  }

  const operationFingerprint =
    createOperationFingerprint(
      invocation,
      actionMetadata,
    );

  return {
    success: true,
    responseStatus: 200,
    providerRequestId:
      `j10-calendar-${operationFingerprint}`,
    rateLimit: null,
    metadata: {
      schemaVersion:
        "j10.google-calendar-runtime-receipt.v1",
      providerId:
        "google-calendar",
      capabilityId:
        invocation.capabilityId,
      mode:
        invocation.mode,
      simulated:
        invocation.mode ===
        "simulate",
      sandbox:
        invocation.mode ===
        "sandbox",
      externalSideEffect:
        false,
      operationFingerprint,
      action:
        actionMetadata,
    },
  };
}

async function refreshCalendarAuthorization(
  invocation:
    IntegrationRuntimeTokenRefreshInvocation,
): Promise<IntegrationRuntimeTokenRefreshResult> {
  return refreshGoogleOAuthAuthorization({
    providerId:
      "google-calendar",
    credentials:
      invocation.credentials,
    grantedScopes:
      invocation.grantedScopes,
    signal:
      invocation.signal,
  });
}

async function revokeCalendarAuthorization(
  context:
    IntegrationRuntimeInvocationContext,
): Promise<IntegrationRuntimeTokenRevocationResult> {
  return revokeGoogleOAuthAuthorization({
    credentials:
      context.credentials,
    signal:
      context.signal,
  });
}

export const GOOGLE_CALENDAR_RUNTIME_ADAPTER:
  IntegrationConnectorRuntimeAdapter = {
    manifest: {
      schemaVersion:
        INTEGRATION_RUNTIME_SCHEMA_VERSION,
      adapterId:
        "google-calendar.oauth2.v1",
      adapterVersion:
        "1.1.0",
      providerId:
        "google-calendar",
      state:
        "installed",
      authType:
        "oauth2",
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
            "google-calendar.event.create",
          kind:
            "action",
          modes: [
            "simulate",
            "sandbox",
            "live",
          ],
          requiredScopes: [
            GOOGLE_CALENDAR_SCOPE,
          ],
          supportsIdempotency:
            true,
        },
        {
          capabilityId:
            "google-calendar.event.update",
          kind:
            "action",
          modes: [
            "simulate",
            "sandbox",
            "live",
          ],
          requiredScopes: [
            GOOGLE_CALENDAR_SCOPE,
          ],
          supportsIdempotency:
            true,
        },
        {
          capabilityId:
            "google-calendar.event.cancel",
          kind:
            "action",
          modes: [
            "simulate",
            "sandbox",
            "live",
          ],
          requiredScopes: [
            GOOGLE_CALENDAR_SCOPE,
          ],
          supportsIdempotency:
            true,
        },
      ],
      supportsHealthChecks:
        true,
      supportsTokenRefresh:
        true,
      supportsTokenRevocation:
        true,
      requestTimeoutMs:
        20_000,
      maxConcurrency:
        10,
    },

    healthCheck:
      calendarHealthCheck,

    executeAction:
      executeCalendarAction,

    refreshAuthorization:
      refreshCalendarAuthorization,

    revokeAuthorization:
      revokeCalendarAuthorization,
  };