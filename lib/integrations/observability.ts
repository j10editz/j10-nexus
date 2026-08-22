import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationLogSeverity,
  IntegrationLogSource,
  IntegrationLogStatus,
  IntegrationOperationLog,
  WriteIntegrationOperationLogInput,
} from "../../types/integration-observability";

const LOG_SELECT = `
  id,
  user_id,
  integration_id,
  provider,
  source,
  event_type,
  severity,
  status,
  correlation_id,
  action_execution_id,
  webhook_event_id,
  attempt,
  max_attempts,
  retryable,
  next_retry_at,
  error_code,
  message,
  metadata,
  created_at
`;

const MAX_METADATA_BYTES =
  30 * 1024;

const MAX_METADATA_DEPTH =
  6;

const MAX_ARRAY_ITEMS =
  50;

const MAX_STRING_LENGTH =
  1_000;

const SENSITIVE_KEYS =
  new Set([
    "authorization",
    "body",
    "cookie",
    "credential",
    "credentials",
    "password",
    "secret",
    "token",
    "accesstoken",
    "refreshtoken",
    "apikey",
    "headers",
    "rawbody",
    "rawinput",
    "rawpayload",
    "requestbody",
    "responsebody",
    "payload",
    "input",
  ]);

type LogRow = {
  id: string;
  user_id: string;
  integration_id: string;
  provider: string;
  source: string;
  event_type: string;
  severity: string;
  status: string;
  correlation_id: string;
  action_execution_id: string | null;
  webhook_event_id: string | null;
  attempt: number;
  max_attempts: number;
  retryable: boolean;
  next_retry_at: string | null;
  error_code: string | null;
  message: string;
  metadata: unknown;
  created_at: string;
};

function normalizedKey(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      "",
    );
}

function safeString(
  value: string,
) {
  return value
    .replace(
      /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
      "Bearer [REDACTED]",
    )
    .slice(
      0,
      MAX_STRING_LENGTH,
    );
}

function sanitizeValue(
  value: unknown,
  depth: number,
): unknown {
  if (
    depth >
    MAX_METADATA_DEPTH
  ) {
    return "[DEPTH_LIMIT]";
  }

  if (
    value === null ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    return safeString(
      value,
    );
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : null;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value
      .slice(
        0,
        MAX_ARRAY_ITEMS,
      )
      .map(
        (item) =>
          sanitizeValue(
            item,
            depth + 1,
          ),
      );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      ).map(
        ([key, item]) => [
          key.slice(
            0,
            120,
          ),
          SENSITIVE_KEYS.has(
            normalizedKey(
              key,
            ),
          )
            ? "[REDACTED]"
            : sanitizeValue(
                item,
                depth + 1,
              ),
        ],
      ),
    );
  }

  return String(
    value,
  ).slice(
    0,
    MAX_STRING_LENGTH,
  );
}

export function redactIntegrationLogMetadata(
  metadata:
    Readonly<
      Record<
        string,
        unknown
      >
    >,
): Readonly<
  Record<
    string,
    unknown
  >
> {
  const sanitized =
    sanitizeValue(
      metadata,
      0,
    ) as Record<
      string,
      unknown
    >;

  const serialized =
    JSON.stringify(
      sanitized,
    );

  if (
    Buffer.byteLength(
      serialized,
      "utf8",
    ) <= MAX_METADATA_BYTES
  ) {
    return sanitized;
  }

  return {
    metadataTruncated:
      true,
    originalBytes:
      Buffer.byteLength(
        serialized,
        "utf8",
      ),
  };
}

function mapLogRow(
  row: LogRow,
): IntegrationOperationLog {
  const metadata =
    row.metadata &&
    typeof row.metadata ===
      "object" &&
    !Array.isArray(
      row.metadata,
    )
      ? row.metadata as Record<
          string,
          unknown
        >
      : {};

  return {
    id: row.id,
    userId:
      row.user_id,
    integrationId:
      row.integration_id,
    providerId:
      row.provider,
    source:
      row.source as IntegrationLogSource,
    eventType:
      row.event_type,
    severity:
      row.severity as IntegrationLogSeverity,
    status:
      row.status as IntegrationLogStatus,
    correlationId:
      row.correlation_id,
    actionExecutionId:
      row.action_execution_id,
    webhookEventId:
      row.webhook_event_id,
    attempt:
      row.attempt,
    maxAttempts:
      row.max_attempts,
    retryable:
      row.retryable,
    nextRetryAt:
      row.next_retry_at,
    errorCode:
      row.error_code,
    message:
      row.message,
    metadata,
    createdAt:
      row.created_at,
  };
}

export async function writeIntegrationOperationLog(
  supabase: SupabaseClient,
  input:
    WriteIntegrationOperationLogInput,
): Promise<void> {
  const attempt =
    Math.max(
      Math.floor(
        input.attempt ?? 1,
      ),
      0,
    );

  const maxAttempts =
    Math.min(
      Math.max(
        Math.floor(
          input.maxAttempts ??
            1,
        ),
        1,
      ),
      10,
    );

  const {
    error,
  } =
    await supabase
      .from(
        "integration_operation_logs",
      )
      .insert({
        user_id:
          input.userId,

        integration_id:
          input.integrationId,

        provider:
          input.providerId,

        source:
          input.source,

        event_type:
          input.eventType.slice(
            0,
            160,
          ),

        severity:
          input.severity,

        status:
          input.status,

        correlation_id:
          input.correlationId.slice(
            0,
            160,
          ),

        action_execution_id:
          input.actionExecutionId ??
          null,

        webhook_event_id:
          input.webhookEventId ??
          null,

        attempt:
          Math.min(
            attempt,
            maxAttempts,
          ),

        max_attempts:
          maxAttempts,

        retryable:
          input.retryable ??
          false,

        next_retry_at:
          input.nextRetryAt ??
          null,

        error_code:
          input.errorCode?.slice(
            0,
            160,
          ) ?? null,

        message:
          safeString(
            input.message,
          ).slice(
            0,
            2_000,
          ) ||
          "Integration operation log",

        metadata:
          redactIntegrationLogMetadata(
            input.metadata ??
              {},
          ),
      });

  if (error) {
    console.error(
      "J10 integration observability write error:",
      error,
    );
  }
}

export async function listIntegrationOperationLogs(
  supabase:
    SupabaseClient,

  userId:
    string,

  integrationId:
    string,

  options?: {
    limit?: number;
    severity?:
      IntegrationLogSeverity |
      null;
    source?:
      IntegrationLogSource |
      null;
    status?:
      IntegrationLogStatus |
      null;
  },
): Promise<
  IntegrationOperationLog[]
> {
  const limit =
    Math.min(
      Math.max(
        Math.floor(
          options?.limit ??
            50,
        ),
        1,
      ),
      100,
    );

  let query =
    supabase
      .from(
        "integration_operation_logs",
      )
      .select(
        LOG_SELECT,
      )
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "integration_id",
        integrationId,
      );

  if (
    options?.severity
  ) {
    query =
      query.eq(
        "severity",
        options.severity,
      );
  }

  if (
    options?.source
  ) {
    query =
      query.eq(
        "source",
        options.source,
      );
  }

  if (
    options?.status
  ) {
    query =
      query.eq(
        "status",
        options.status,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        "created_at",
        {
          ascending:
            false,
        },
      )
      .limit(
        limit,
      );

  if (error) {
    throw new Error(
      "J10 could not load integration operation logs.",
    );
  }

  return (
    (data ?? []) as LogRow[]
  ).map(
    mapLogRow,
  );
}

export function serializeIntegrationOperationLog(
  log:
    IntegrationOperationLog,
) {
  return {
    id:
      log.id,

    integrationId:
      log.integrationId,

    providerId:
      log.providerId,

    source:
      log.source,

    eventType:
      log.eventType,

    severity:
      log.severity,

    status:
      log.status,

    correlationId:
      log.correlationId,

    actionExecutionId:
      log.actionExecutionId,

    webhookEventId:
      log.webhookEventId,

    attempt:
      log.attempt,

    maxAttempts:
      log.maxAttempts,

    retryable:
      log.retryable,

    nextRetryAt:
      log.nextRetryAt,

    errorCode:
      log.errorCode,

    message:
      log.message,

    metadata:
      log.metadata,

    createdAt:
      log.createdAt,
  };
}