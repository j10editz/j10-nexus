$runtimeDirectory =
    ".\lib\integrations\providers\google"

$runtimeFile =
    "$runtimeDirectory\live-action-runtime.ts"

$gmailFile =
    ".\lib\integrations\providers\gmail\adapter.ts"

$calendarFile =
    ".\lib\integrations\providers\google-calendar\adapter.ts"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $runtimeDirectory |
Out-Null

$runtimeContent = @'
import "server-only";

import {
  createHash,
} from "node:crypto";

import type {
  IntegrationRuntimeActionInvocation,
  IntegrationRuntimeRateLimit,
  IntegrationRuntimeResult,
} from "@/types/integration-runtime";

import {
  IntegrationRuntimeError,
} from "@/types/integration-runtime";

const GMAIL_API_BASE =
  "https://gmail.googleapis.com/gmail/v1";

const CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3";

const REQUEST_TIMEOUT_MS =
  20_000;

const MAX_RESPONSE_BYTES =
  128 * 1024;

type JsonRecord =
  Record<string, unknown>;

interface GoogleApiResponse {
  readonly data: unknown;
  readonly status: number;
  readonly requestId: string | null;
  readonly rateLimit: IntegrationRuntimeRateLimit | null;
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireRecord(
  value: unknown,
  message: string,
): JsonRecord {
  if (!isRecord(value)) {
    throw new IntegrationRuntimeError(
      message,
      {
        code:
          "GOOGLE_ACTION_INPUT_INVALID",
        category:
          "validation",
        status: 400,
      },
    );
  }

  return value;
}

function requireString(
  input: JsonRecord,
  key: string,
  maximumLength: number,
): string {
  const value =
    input[key];

  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength
  ) {
    throw new IntegrationRuntimeError(
      `${key} is required or invalid.`,
      {
        code:
          "GOOGLE_ACTION_INPUT_INVALID",
        category:
          "validation",
        status: 400,
      },
    );
  }

  return value.trim();
}

function optionalString(
  input: JsonRecord,
  key: string,
  maximumLength: number,
): string | undefined {
  const value =
    input[key];

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  return requireString(
    input,
    key,
    maximumLength,
  );
}

function requireStringArray(
  value: unknown,
  required: boolean,
): readonly string[] {
  const values =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : [];

  if (
    required &&
    values.length === 0
  ) {
    throw new IntegrationRuntimeError(
      "At least one value is required.",
      {
        code:
          "GOOGLE_ACTION_INPUT_INVALID",
        category:
          "validation",
        status: 400,
      },
    );
  }

  return Array.from(
    new Set(
      values.map(
        (entry) => {
          if (
            typeof entry !== "string" ||
            !entry.trim() ||
            entry.length > 1_024 ||
            /[\r\n\u0000]/.test(entry)
          ) {
            throw new IntegrationRuntimeError(
              "A supplied action value is invalid.",
              {
                code:
                  "GOOGLE_ACTION_INPUT_INVALID",
                category:
                  "validation",
                status: 400,
              },
            );
          }

          return entry.trim();
        },
      ),
    ),
  );
}

async function readAccessToken(
  invocation:
    IntegrationRuntimeActionInvocation,
): Promise<string> {
  const credentials =
    await invocation.credentials.read([
      "access_token",
    ]);

  const accessToken =
    credentials.access_token?.trim();

  if (
    !accessToken ||
    accessToken.length > 32_768 ||
    /[\u0000-\u0020\u007f]/.test(
      accessToken,
    )
  ) {
    throw new IntegrationRuntimeError(
      "Google OAuth authorization is required.",
      {
        code:
          "GOOGLE_ACCESS_TOKEN_MISSING",
        category:
          "authentication",
        status: 401,
      },
    );
  }

  return accessToken;
}

function parseRetryAfter(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const seconds =
    Number.parseInt(
      value,
      10,
    );

  return Number.isFinite(seconds) &&
    seconds >= 0
    ? seconds
    : null;
}

function createRateLimit(
  response: Response,
): IntegrationRuntimeRateLimit | null {
  const retryAfterSeconds =
    parseRetryAfter(
      response.headers.get(
        "retry-after",
      ),
    );

  if (
    retryAfterSeconds === null
  ) {
    return null;
  }

  return {
    limit: null,
    remaining: null,
    resetAt: null,
    retryAfterSeconds,
  };
}

function googleProviderError(
  response: Response,
): IntegrationRuntimeError {
  const requestId =
    response.headers.get(
      "x-guploader-uploadid",
    ) ??
    response.headers.get(
      "x-request-id",
    );

  const retryAfterSeconds =
    parseRetryAfter(
      response.headers.get(
        "retry-after",
      ),
    );

  if (response.status === 401) {
    return new IntegrationRuntimeError(
      "Google rejected the stored OAuth authorization.",
      {
        code:
          "GOOGLE_AUTHENTICATION_FAILED",
        category:
          "authentication",
        status: 401,
        details: {
          requestId,
        },
      },
    );
  }

  if (response.status === 403) {
    return new IntegrationRuntimeError(
      "Google denied the requested capability or OAuth scope.",
      {
        code:
          "GOOGLE_AUTHORIZATION_FAILED",
        category:
          "authorization",
        status: 403,
        details: {
          requestId,
        },
      },
    );
  }

  if (response.status === 429) {
    return new IntegrationRuntimeError(
      "Google temporarily rate-limited this action.",
      {
        code:
          "GOOGLE_RATE_LIMITED",
        category:
          "rate_limit",
        status: 429,
        retryable: true,
        retryAfterSeconds,
        details: {
          requestId,
        },
      },
    );
  }

  return new IntegrationRuntimeError(
    "Google could not complete the requested action.",
    {
      code:
        response.status >= 500
          ? "GOOGLE_PROVIDER_UNAVAILABLE"
          : "GOOGLE_PROVIDER_REJECTED_ACTION",
      category:
        "provider",
      status:
        response.status >= 500
          ? 502
          : response.status,
      retryable:
        response.status >= 500,
      retryAfterSeconds,
      details: {
        requestId,
        providerStatus:
          response.status,
      },
    },
  );
}

async function readResponse(
  response: Response,
): Promise<unknown> {
  const declaredLength =
    Number(
      response.headers.get(
        "content-length",
      ),
    );

  if (
    Number.isFinite(
      declaredLength,
    ) &&
    declaredLength >
      MAX_RESPONSE_BYTES
  ) {
    throw new IntegrationRuntimeError(
      "Google returned a response larger than J10 security limits.",
      {
        code:
          "GOOGLE_RESPONSE_TOO_LARGE",
        category:
          "provider",
        status: 502,
      },
    );
  }

  const text =
    await response.text();

  if (
    Buffer.byteLength(
      text,
      "utf8",
    ) >
    MAX_RESPONSE_BYTES
  ) {
    throw new IntegrationRuntimeError(
      "Google returned a response larger than J10 security limits.",
      {
        code:
          "GOOGLE_RESPONSE_TOO_LARGE",
        category:
          "provider",
        status: 502,
      },
    );
  }

  if (!text) {
    return null;
  }

  try {
    const value: unknown =
      JSON.parse(text);

    return value;
  }
  catch {
    throw new IntegrationRuntimeError(
      "Google returned an unreadable response.",
      {
        code:
          "GOOGLE_RESPONSE_INVALID",
        category:
          "provider",
        status: 502,
      },
    );
  }
}

async function googleRequest(
  input: {
    readonly url: string;
    readonly method: string;
    readonly accessToken: string;
    readonly body?: unknown;
    readonly signal: AbortSignal;
  },
): Promise<GoogleApiResponse> {
  try {
    const headers:
      Record<string, string> = {
        Accept:
          "application/json",
        Authorization:
          `Bearer ${input.accessToken}`,
      };

    let body:
      string | undefined;

    if (
      input.body !== undefined
    ) {
      headers["Content-Type"] =
        "application/json";

      body =
        JSON.stringify(
          input.body,
        );
    }

    const response =
      await fetch(
        input.url,
        {
          method:
            input.method,
          headers,
          body,
          cache:
            "no-store",
          redirect:
            "error",
          signal:
            AbortSignal.any([
              input.signal,
              AbortSignal.timeout(
                REQUEST_TIMEOUT_MS,
              ),
            ]),
        },
      );

    const data =
      await readResponse(
        response,
      );

    if (!response.ok) {
      throw googleProviderError(
        response,
      );
    }

    return {
      data,
      status:
        response.status,
      requestId:
        response.headers.get(
          "x-guploader-uploadid",
        ) ??
        response.headers.get(
          "x-request-id",
        ),
      rateLimit:
        createRateLimit(
          response,
        ),
    };
  }
  catch (error) {
    if (
      error instanceof
      IntegrationRuntimeError
    ) {
      throw error;
    }

    throw new IntegrationRuntimeError(
      "J10 could not securely reach Google.",
      {
        code:
          "GOOGLE_NETWORK_ERROR",
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
        status: 502,
        retryable: true,
      },
    );
  }
}

function base64Lines(
  value: string,
): string {
  return Buffer
    .from(
      value,
      "utf8",
    )
    .toString(
      "base64",
    )
    .match(/.{1,76}/g)
    ?.join("\r\n") ??
    "";
}

function encodeSubject(
  value: string,
): string {
  return `=?UTF-8?B?${Buffer
    .from(
      value,
      "utf8",
    )
    .toString(
      "base64",
    )}?=`;
}

function safeHeader(
  value: string,
  label: string,
): string {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > 4_096 ||
    /[\r\n\u0000]/.test(
      normalized,
    )
  ) {
    throw new IntegrationRuntimeError(
      `${label} returned by Gmail was invalid.`,
      {
        code:
          "GMAIL_MESSAGE_METADATA_INVALID",
        category:
          "provider",
        status: 502,
      },
    );
  }

  return normalized;
}

function buildMimeMessage(
  input: {
    readonly to:
      readonly string[];
    readonly cc?:
      readonly string[];
    readonly bcc?:
      readonly string[];
    readonly subject:
      string;
    readonly body:
      string;
    readonly htmlBody?:
      string;
    readonly additionalHeaders?:
      Readonly<Record<string, string>>;
    readonly seed:
      string;
  },
): string {
  const headers: string[] = [
    `To: ${input.to.join(", ")}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (
    input.cc &&
    input.cc.length > 0
  ) {
    headers.push(
      `Cc: ${input.cc.join(", ")}`,
    );
  }

  if (
    input.bcc &&
    input.bcc.length > 0
  ) {
    headers.push(
      `Bcc: ${input.bcc.join(", ")}`,
    );
  }

  for (
    const [key, value] of
    Object.entries(
      input.additionalHeaders ??
      {},
    )
  ) {
    headers.push(
      `${key}: ${safeHeader(value, key)}`,
    );
  }

  if (!input.htmlBody) {
    headers.push(
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(
        input.body,
      ),
    );

    return headers.join(
      "\r\n",
    );
  }

  const boundary =
    `j10_${createHash("sha256")
      .update(
        input.seed,
        "utf8",
      )
      .digest("hex")
      .slice(0, 32)}`;

  headers.push(
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(
      input.body,
    ),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(
      input.htmlBody,
    ),
    `--${boundary}--`,
  );

  return headers.join(
    "\r\n",
  );
}

function encodeRawMessage(
  value: string,
): string {
  return Buffer
    .from(
      value,
      "utf8",
    )
    .toString(
      "base64url",
    );
}

function findGmailHeader(
  data: unknown,
  name: string,
): string | null {
  if (!isRecord(data)) {
    return null;
  }

  const payload =
    data.payload;

  if (!isRecord(payload)) {
    return null;
  }

  const headers =
    payload.headers;

  if (!Array.isArray(headers)) {
    return null;
  }

  for (const entry of headers) {
    if (
      isRecord(entry) &&
      typeof entry.name ===
        "string" &&
      typeof entry.value ===
        "string" &&
      entry.name.toLowerCase() ===
        name.toLowerCase()
    ) {
      return entry.value;
    }
  }

  return null;
}

function providerIdentifier(
  response:
    GoogleApiResponse,
): string | null {
  if (
    isRecord(response.data) &&
    typeof response.data.id ===
      "string"
  ) {
    return response.data.id;
  }

  return response.requestId;
}

async function executeGmailAction(
  invocation:
    IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const accessToken =
    await readAccessToken(
      invocation,
    );

  const input =
    requireRecord(
      invocation.input,
      "Gmail action input is invalid.",
    );

  if (
    invocation.capabilityId ===
    "gmail.message.send"
  ) {
    const to =
      requireStringArray(
        input.to,
        true,
      );

    const cc =
      requireStringArray(
        input.cc,
        false,
      );

    const bcc =
      requireStringArray(
        input.bcc,
        false,
      );

    const mime =
      buildMimeMessage({
        to,
        cc,
        bcc,
        subject:
          requireString(
            input,
            "subject",
            998,
          ),
        body:
          requireString(
            input,
            "body",
            2 * 1024 * 1024,
          ),
        htmlBody:
          optionalString(
            input,
            "htmlBody",
            2 * 1024 * 1024,
          ),
        seed:
          invocation.idempotencyKey,
      });

    const response =
      await googleRequest({
        url:
          `${GMAIL_API_BASE}/users/me/messages/send`,
        method:
          "POST",
        accessToken,
        signal:
          invocation.signal,
        body: {
          raw:
            encodeRawMessage(
              mime,
            ),
        },
      });

    return {
      success: true,
      responseStatus:
        response.status,
      providerRequestId:
        providerIdentifier(
          response,
        ),
      rateLimit:
        response.rateLimit,
      metadata: {
        providerId:
          "gmail",
        capabilityId:
          invocation.capabilityId,
        mode:
          "live",
        externalSideEffect:
          true,
        operation:
          "send_message",
        recipientCount:
          to.length +
          cc.length +
          bcc.length,
        providerMessageId:
          providerIdentifier(
            response,
          ),
      },
    };
  }

  if (
    invocation.capabilityId ===
    "gmail.message.reply"
  ) {
    const messageId =
      requireString(
        input,
        "messageId",
        256,
      );

    const metadataUrl =
      new URL(
        `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}`,
      );

    metadataUrl.searchParams.set(
      "format",
      "metadata",
    );

    for (
      const header of [
        "From",
        "Reply-To",
        "Subject",
        "Message-ID",
        "References",
      ]
    ) {
      metadataUrl.searchParams.append(
        "metadataHeaders",
        header,
      );
    }

    const original =
      await googleRequest({
        url:
          metadataUrl.toString(),
        method:
          "GET",
        accessToken,
        signal:
          invocation.signal,
      });

    const recipient =
      findGmailHeader(
        original.data,
        "Reply-To",
      ) ??
      findGmailHeader(
        original.data,
        "From",
      );

    if (!recipient) {
      throw new IntegrationRuntimeError(
        "Gmail did not return a reply address.",
        {
          code:
            "GMAIL_REPLY_ADDRESS_MISSING",
          category:
            "provider",
          status: 502,
        },
      );
    }

    const originalSubject =
      findGmailHeader(
        original.data,
        "Subject",
      ) ??
      "Message";

    const providerMessageId =
      findGmailHeader(
        original.data,
        "Message-ID",
      );

    const previousReferences =
      findGmailHeader(
        original.data,
        "References",
      );

    const additionalHeaders:
      Record<string, string> = {};

    if (providerMessageId) {
      additionalHeaders[
        "In-Reply-To"
      ] =
        providerMessageId;

      additionalHeaders.References =
        [
          previousReferences,
          providerMessageId,
        ]
          .filter(Boolean)
          .join(" ");
    }

    const mime =
      buildMimeMessage({
        to: [
          safeHeader(
            recipient,
            "Reply address",
          ),
        ],
        subject:
          /^re:/i.test(
            originalSubject,
          )
            ? originalSubject
            : `Re: ${originalSubject}`,
        body:
          requireString(
            input,
            "body",
            2 * 1024 * 1024,
          ),
        htmlBody:
          optionalString(
            input,
            "htmlBody",
            2 * 1024 * 1024,
          ),
        additionalHeaders,
        seed:
          invocation.idempotencyKey,
      });

    const threadId =
      isRecord(
        original.data,
      ) &&
      typeof original.data.threadId ===
        "string"
        ? original.data.threadId
        : undefined;

    const response =
      await googleRequest({
        url:
          `${GMAIL_API_BASE}/users/me/messages/send`,
        method:
          "POST",
        accessToken,
        signal:
          invocation.signal,
        body: {
          raw:
            encodeRawMessage(
              mime,
            ),
          ...(threadId
            ? {
                threadId,
              }
            : {}),
        },
      });

    return {
      success: true,
      responseStatus:
        response.status,
      providerRequestId:
        providerIdentifier(
          response,
        ),
      rateLimit:
        response.rateLimit,
      metadata: {
        providerId:
          "gmail",
        capabilityId:
          invocation.capabilityId,
        mode:
          "live",
        externalSideEffect:
          true,
        operation:
          "reply_message",
        providerMessageId:
          providerIdentifier(
            response,
          ),
        threadId:
          threadId ??
          null,
      },
    };
  }

  if (
    invocation.capabilityId ===
    "gmail.message.add_label"
  ) {
    const messageId =
      requireString(
        input,
        "messageId",
        256,
      );

    const labelIds =
      requireStringArray(
        input.labelIds,
        true,
      );

    const response =
      await googleRequest({
        url:
          `${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(messageId)}/modify`,
        method:
          "POST",
        accessToken,
        signal:
          invocation.signal,
        body: {
          addLabelIds:
            labelIds,
          removeLabelIds:
            [],
        },
      });

    return {
      success: true,
      responseStatus:
        response.status,
      providerRequestId:
        providerIdentifier(
          response,
        ),
      rateLimit:
        response.rateLimit,
      metadata: {
        providerId:
          "gmail",
        capabilityId:
          invocation.capabilityId,
        mode:
          "live",
        externalSideEffect:
          true,
        operation:
          "add_label",
        providerMessageId:
          messageId,
        labelCount:
          labelIds.length,
      },
    };
  }

  throw new IntegrationRuntimeError(
    "The Gmail live capability is not installed.",
    {
      code:
        "GMAIL_LIVE_CAPABILITY_NOT_INSTALLED",
      category:
        "configuration",
      status: 501,
    },
  );
}

function calendarEventBody(
  input: JsonRecord,
  includeRequiredFields: boolean,
): JsonRecord {
  const body:
    JsonRecord = {};

  const summary =
    includeRequiredFields
      ? requireString(
          input,
          "summary",
          1_024,
        )
      : optionalString(
          input,
          "summary",
          1_024,
        );

  const description =
    optionalString(
      input,
      "description",
      16_384,
    );

  const location =
    optionalString(
      input,
      "location",
      1_024,
    );

  const start =
    includeRequiredFields
      ? requireString(
          input,
          "start",
          128,
        )
      : optionalString(
          input,
          "start",
          128,
        );

  const end =
    includeRequiredFields
      ? requireString(
          input,
          "end",
          128,
        )
      : optionalString(
          input,
          "end",
          128,
        );

  const timeZone =
    optionalString(
      input,
      "timeZone",
      255,
    );

  if (summary !== undefined) {
    body.summary =
      summary;
  }

  if (description !== undefined) {
    body.description =
      description;
  }

  if (location !== undefined) {
    body.location =
      location;
  }

  if (start !== undefined) {
    body.start = {
      dateTime:
        start,
      ...(timeZone
        ? {
            timeZone,
          }
        : {}),
    };
  }

  if (end !== undefined) {
    body.end = {
      dateTime:
        end,
      ...(timeZone
        ? {
            timeZone,
          }
        : {}),
    };
  }

  if (
    input.attendees !== undefined
  ) {
    body.attendees =
      requireStringArray(
        input.attendees,
        false,
      ).map(
        (email) => ({
          email,
        }),
      );
  }

  return body;
}

function deterministicEventId(
  invocation:
    IntegrationRuntimeActionInvocation,
): string {
  return `j10${createHash("sha256")
    .update(
      [
        invocation.connection.id,
        invocation.capabilityId,
        invocation.idempotencyKey,
      ].join(":"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 37)}`;
}

function calendarUrl(
  calendarId: string,
  eventId?: string,
): URL {
  const suffix =
    eventId
      ? `/events/${encodeURIComponent(eventId)}`
      : "/events";

  return new URL(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}${suffix}`,
  );
}

async function executeCalendarAction(
  invocation:
    IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  const accessToken =
    await readAccessToken(
      invocation,
    );

  const input =
    requireRecord(
      invocation.input,
      "Google Calendar action input is invalid.",
    );

  const calendarId =
    optionalString(
      input,
      "calendarId",
      1_024,
    ) ??
    "primary";

  const sendUpdates =
    optionalString(
      input,
      "sendUpdates",
      32,
    ) ??
    "all";

  if (
    ![
      "all",
      "externalOnly",
      "none",
    ].includes(sendUpdates)
  ) {
    throw new IntegrationRuntimeError(
      "Google Calendar sendUpdates is invalid.",
      {
        code:
          "GOOGLE_CALENDAR_SEND_UPDATES_INVALID",
        category:
          "validation",
        status: 400,
      },
    );
  }

  if (
    invocation.capabilityId ===
    "google-calendar.event.create"
  ) {
    const eventId =
      deterministicEventId(
        invocation,
      );

    const url =
      calendarUrl(
        calendarId,
      );

    url.searchParams.set(
      "sendUpdates",
      sendUpdates,
    );

    const body =
      calendarEventBody(
        input,
        true,
      );

    body.id =
      eventId;

    let response:
      GoogleApiResponse;

    try {
      response =
        await googleRequest({
          url:
            url.toString(),
          method:
            "POST",
          accessToken,
          signal:
            invocation.signal,
          body,
        });
    }
    catch (error) {
      if (
        error instanceof
          IntegrationRuntimeError &&
        error.status === 409
      ) {
        response =
          await googleRequest({
            url:
              calendarUrl(
                calendarId,
                eventId,
              ).toString(),
            method:
              "GET",
            accessToken,
            signal:
              invocation.signal,
          });
      }
      else {
        throw error;
      }
    }

    return {
      success: true,
      responseStatus:
        response.status,
      providerRequestId:
        providerIdentifier(
          response,
        ) ??
        eventId,
      rateLimit:
        response.rateLimit,
      metadata: {
        providerId:
          "google-calendar",
        capabilityId:
          invocation.capabilityId,
        mode:
          "live",
        externalSideEffect:
          true,
        operation:
          "create_event",
        providerEventId:
          providerIdentifier(
            response,
          ) ??
          eventId,
      },
    };
  }

  if (
    invocation.capabilityId ===
    "google-calendar.event.update"
  ) {
    const eventId =
      requireString(
        input,
        "eventId",
        1_024,
      );

    const url =
      calendarUrl(
        calendarId,
        eventId,
      );

    url.searchParams.set(
      "sendUpdates",
      sendUpdates,
    );

    const response =
      await googleRequest({
        url:
          url.toString(),
        method:
          "PATCH",
        accessToken,
        signal:
          invocation.signal,
        body:
          calendarEventBody(
            input,
            false,
          ),
      });

    return {
      success: true,
      responseStatus:
        response.status,
      providerRequestId:
        providerIdentifier(
          response,
        ) ??
        eventId,
      rateLimit:
        response.rateLimit,
      metadata: {
        providerId:
          "google-calendar",
        capabilityId:
          invocation.capabilityId,
        mode:
          "live",
        externalSideEffect:
          true,
        operation:
          "update_event",
        providerEventId:
          providerIdentifier(
            response,
          ) ??
          eventId,
      },
    };
  }

  if (
    invocation.capabilityId ===
    "google-calendar.event.cancel"
  ) {
    const eventId =
      requireString(
        input,
        "eventId",
        1_024,
      );

    const url =
      calendarUrl(
        calendarId,
        eventId,
      );

    url.searchParams.set(
      "sendUpdates",
      sendUpdates,
    );

    try {
      const response =
        await googleRequest({
          url:
            url.toString(),
          method:
            "DELETE",
          accessToken,
          signal:
            invocation.signal,
        });

      return {
        success: true,
        responseStatus:
          response.status,
        providerRequestId:
          response.requestId ??
          eventId,
        rateLimit:
          response.rateLimit,
        metadata: {
          providerId:
            "google-calendar",
          capabilityId:
            invocation.capabilityId,
          mode:
            "live",
          externalSideEffect:
            true,
          operation:
            "cancel_event",
          providerEventId:
            eventId,
        },
      };
    }
    catch (error) {
      if (
        error instanceof
          IntegrationRuntimeError &&
        (
          error.status === 404 ||
          error.status === 410
        )
      ) {
        return {
          success: true,
          responseStatus:
            204,
          providerRequestId:
            eventId,
          rateLimit:
            null,
          metadata: {
            providerId:
              "google-calendar",
            capabilityId:
              invocation.capabilityId,
            mode:
              "live",
            externalSideEffect:
              false,
            operation:
              "cancel_event",
            providerEventId:
              eventId,
            alreadyCancelled:
              true,
          },
        };
      }

      throw error;
    }
  }

  throw new IntegrationRuntimeError(
    "The Google Calendar live capability is not installed.",
    {
      code:
        "GOOGLE_CALENDAR_LIVE_CAPABILITY_NOT_INSTALLED",
      category:
        "configuration",
      status: 501,
    },
  );
}

export async function executeGoogleLiveAction(
  invocation:
    IntegrationRuntimeActionInvocation,
): Promise<IntegrationRuntimeResult> {
  if (
    invocation.mode !==
    "live"
  ) {
    throw new IntegrationRuntimeError(
      "The Google live runtime only accepts live actions.",
      {
        code:
          "GOOGLE_LIVE_MODE_REQUIRED",
        category:
          "configuration",
        status: 409,
      },
    );
  }

  if (
    invocation.connection.providerId ===
    "gmail"
  ) {
    return executeGmailAction(
      invocation,
    );
  }

  if (
    invocation.connection.providerId ===
    "google-calendar"
  ) {
    return executeCalendarAction(
      invocation,
    );
  }

  throw new IntegrationRuntimeError(
    "The requested Google provider is not installed in the live runtime.",
    {
      code:
        "GOOGLE_LIVE_PROVIDER_NOT_INSTALLED",
      category:
        "configuration",
      status: 501,
    },
  );
}
'@

$utf8 =
    New-Object System.Text.UTF8Encoding($false)

[System.IO.File]::WriteAllText(
    [System.IO.Path]::GetFullPath(
        $runtimeFile
    ),
    $runtimeContent,
    $utf8
)

function Replace-RegexBlock {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Replacement,
        [string]$Label
    )

    $regex =
        [regex]::new(
            $Pattern,
            [System.Text.RegularExpressions.RegexOptions]::Singleline
        )

    $matches =
        $regex.Matches(
            $Text
        )

    if ($matches.Count -ne 1) {
        throw "$Label verification failed. Expected 1 match, found $($matches.Count)."
    }

    return $regex.Replace(
        $Text,
        [System.Text.RegularExpressions.MatchEvaluator]{
            param($match)
            return $Replacement
        },
        1
    )
}

function Replace-ExactCount {
    param(
        [string]$Text,
        [string]$Old,
        [string]$New,
        [int]$Expected,
        [string]$Label
    )

    $count =
        [regex]::Matches(
            $Text,
            [regex]::Escape(
                $Old
            )
        ).Count

    if ($count -ne $Expected) {
        throw "$Label verification failed. Expected $Expected matches, found $count."
    }

    return $Text.Replace(
        $Old,
        $New
    )
}

$gmailContent =
    [System.IO.File]::ReadAllText(
        (Resolve-Path -LiteralPath $gmailFile)
    ).Replace(
        "`r`n",
        "`n"
    )

$gmailImportMarker = @'
import {
  refreshGoogleOAuthAuthorization,
  revokeGoogleOAuthAuthorization,
} from "../google/oauth-runtime";
'@

$gmailImportReplacement = @'
import {
  executeGoogleLiveAction,
} from "../google/live-action-runtime";

import {
  refreshGoogleOAuthAuthorization,
  revokeGoogleOAuthAuthorization,
} from "../google/oauth-runtime";
'@

$gmailContent =
    Replace-ExactCount `
        -Text $gmailContent `
        -Old $gmailImportMarker `
        -New $gmailImportReplacement `
        -Expected 1 `
        -Label "Gmail live runtime import"

$gmailExecuteReplacement = @'
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

async function readProfileJson
'@

$gmailContent =
    Replace-RegexBlock `
        -Text $gmailContent `
        -Pattern 'async function executeGmailAction\([\s\S]*?\n\}\n\nasync function readProfileJson' `
        -Replacement $gmailExecuteReplacement `
        -Label "Gmail executeAction"

$gmailContent =
    Replace-ExactCount `
        -Text $gmailContent `
        -Old 'adapterVersion: "1.0.0",' `
        -New 'adapterVersion: "1.1.0",' `
        -Expected 1 `
        -Label "Gmail adapter version"

$gmailContent =
    Replace-ExactCount `
        -Text $gmailContent `
        -Old 'state: "development",' `
        -New 'state: "installed",' `
        -Expected 1 `
        -Label "Gmail adapter state"

$gmailOldModes = @'
modes: [
      "simulate",
      "sandbox",
    ],
'@

$gmailNewModes = @'
modes: [
      "simulate",
      "sandbox",
      "live",
    ],
'@

$gmailContent =
    Replace-ExactCount `
        -Text $gmailContent `
        -Old $gmailOldModes `
        -New $gmailNewModes `
        -Expected 1 `
        -Label "Gmail manifest modes"

$gmailOldCapabilityModes = @'
modes: [
          "simulate",
          "sandbox",
        ],
'@

$gmailNewCapabilityModes = @'
modes: [
          "simulate",
          "sandbox",
          "live",
        ],
'@

$gmailContent =
    Replace-ExactCount `
        -Text $gmailContent `
        -Old $gmailOldCapabilityModes `
        -New $gmailNewCapabilityModes `
        -Expected 3 `
        -Label "Gmail capability modes"

[System.IO.File]::WriteAllText(
    (Resolve-Path -LiteralPath $gmailFile),
    $gmailContent,
    $utf8
)

$calendarContent =
    [System.IO.File]::ReadAllText(
        (Resolve-Path -LiteralPath $calendarFile)
    ).Replace(
        "`r`n",
        "`n"
    )

$calendarImportMarker = @'
import {
  refreshGoogleOAuthAuthorization,
  revokeGoogleOAuthAuthorization,
} from "../google/oauth-runtime";
'@

$calendarImportReplacement = @'
import {
  executeGoogleLiveAction,
} from "../google/live-action-runtime";

import {
  refreshGoogleOAuthAuthorization,
  revokeGoogleOAuthAuthorization,
} from "../google/oauth-runtime";
'@

$calendarContent =
    Replace-ExactCount `
        -Text $calendarContent `
        -Old $calendarImportMarker `
        -New $calendarImportReplacement `
        -Expected 1 `
        -Label "Calendar live runtime import"

$calendarExecuteReplacement = @'
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

async function refreshCalendarAuthorization
'@

$calendarContent =
    Replace-RegexBlock `
        -Text $calendarContent `
        -Pattern 'async function executeCalendarAction\([\s\S]*?\n\}\n\nasync function refreshCalendarAuthorization' `
        -Replacement $calendarExecuteReplacement `
        -Label "Calendar executeAction"

$calendarContent =
    Replace-ExactCount `
        -Text $calendarContent `
        -Old 'adapterVersion:
        "1.0.0",' `
        -New 'adapterVersion:
        "1.1.0",' `
        -Expected 1 `
        -Label "Calendar adapter version"

$calendarContent =
    Replace-ExactCount `
        -Text $calendarContent `
        -Old 'state:
        "development",' `
        -New 'state:
        "installed",' `
        -Expected 1 `
        -Label "Calendar adapter state"

$calendarOldModes = @'
modes: [
        "simulate",
        "sandbox",
      ],
'@

$calendarNewModes = @'
modes: [
        "simulate",
        "sandbox",
        "live",
      ],
'@

$calendarContent =
    Replace-ExactCount `
        -Text $calendarContent `
        -Old $calendarOldModes `
        -New $calendarNewModes `
        -Expected 1 `
        -Label "Calendar manifest modes"

$calendarOldCapabilityModes = @'
modes: [
            "simulate",
            "sandbox",
          ],
'@

$calendarNewCapabilityModes = @'
modes: [
            "simulate",
            "sandbox",
            "live",
          ],
'@

$calendarContent =
    Replace-ExactCount `
        -Text $calendarContent `
        -Old $calendarOldCapabilityModes `
        -New $calendarNewCapabilityModes `
        -Expected 3 `
        -Label "Calendar capability modes"

[System.IO.File]::WriteAllText(
    (Resolve-Path -LiteralPath $calendarFile),
    $calendarContent,
    $utf8
)

Write-Output "Day 15I live Google provider adapters installed."

Get-Item `
    -LiteralPath `
        $runtimeFile, `
        $gmailFile, `
        $calendarFile |
Select-Object FullName, Length

npx eslint `
".\lib\integrations\providers\google\live-action-runtime.ts" `
".\lib\integrations\providers\gmail\adapter.ts" `
".\lib\integrations\providers\google-calendar\adapter.ts" `
".\lib\integrations\runtime-registry.ts"

if ($LASTEXITCODE -ne 0) {
    throw "Day 15I Batch 1 ESLint verification failed."
}

npm run build

if ($LASTEXITCODE -ne 0) {
    throw "Day 15I Batch 1 production build failed."
}

Write-Output "DAY 15I BATCH 1 LIVE GOOGLE PROVIDER ADAPTERS PASSED."