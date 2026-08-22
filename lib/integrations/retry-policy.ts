import "server-only";

import type {
  IntegrationRetryDecision,
  IntegrationRetryDomain,
} from "../../types/integration-observability";

export const DEFAULT_INTEGRATION_ACTION_MAX_ATTEMPTS =
  3;

export const DEFAULT_INTEGRATION_WEBHOOK_MAX_ATTEMPTS =
  5;

const MAX_RETRY_DELAY_MS =
  60_000;

const PERMANENT_ERROR_CODES =
  new Set([
    "BLOCKED_INTEGRATION_ACTION_HEADER",
    "EXTERNAL_TRIGGER_PROVIDER_UNSUPPORTED",
    "EXTERNAL_TRIGGER_SIGNATURE_INVALID",
    "INTEGRATION_ACTION_ADAPTER_NOT_IMPLEMENTED",
    "INTEGRATION_ACTION_APPROVAL_REQUIRED",
    "INTEGRATION_ACTION_CAPABILITY_DISABLED",
    "INTEGRATION_ACTION_INPUT_REQUIRED",
    "INTEGRATION_ACTION_INPUT_TOO_LARGE",
    "INTEGRATION_CONNECTION_NOT_EXECUTABLE",
    "INTEGRATION_LIVE_ADAPTER_NOT_INSTALLED",
    "INVALID_INTEGRATION_ACTION_HEADERS",
    "INVALID_INTEGRATION_ACTION_HEADER_VALUE",
    "INVALID_INTEGRATION_ACTION_IDEMPOTENCY_KEY",
    "INVALID_INTEGRATION_ACTION_INPUT",
    "INVALID_INTEGRATION_ACTION_METHOD",
    "INVALID_INTEGRATION_ACTION_MODE",
    "INVALID_INTEGRATION_ACTION_NUMBER",
    "INVALID_INTEGRATION_ACTION_URL",
    "INVALID_INTEGRATION_ACTION_URL_PROTOCOL",
    "PLANNED_PROVIDER_SIMULATION_ONLY",
    "SANDBOX_BLOCKED_FOR_PRODUCTION_CONNECTION",
    "UNSUPPORTED_INTEGRATION_ACTION_CAPABILITY",
    "WEBHOOK_ENDPOINT_DISABLED",
    "WEBHOOK_ENDPOINT_NOT_FOUND",
    "WEBHOOK_METHOD_NOT_ALLOWED",
    "WEBHOOK_PAYLOAD_EMPTY",
    "WEBHOOK_PAYLOAD_JSON_INVALID",
    "WEBHOOK_PAYLOAD_TOO_LARGE",
  ]);

const TRANSIENT_ERROR_CODES =
  new Set([
    "EXTERNAL_TRIGGER_ADAPTER_FAILED",
    "EXTERNAL_TRIGGER_ADAPTER_STATE_INVALID",
    "INTEGRATION_ACTION_ADAPTER_FAILED",
    "INTEGRATION_ACTION_EXECUTION_FAILED",
    "INTEGRATION_ACTION_SANDBOX_FAILED",
    "INTEGRATION_ACTION_SANDBOX_REJECTED",
    "INTEGRATION_ACTION_SANDBOX_TIMEOUT",
    "INTEGRATION_AUTOMATION_ACTION_FAILED",
    "INTEGRATION_AUTOMATION_DISPATCH_FAILED",
    "INTEGRATION_WEBHOOK_DATABASE_ERROR",
    "INTEGRATION_WEBHOOK_INTERNAL_ERROR",
    "INTEGRATION_WEBHOOK_PROCESSING_FAILED",
  ]);

function normalizeAttemptLimit(
  value: number,
) {
  return Math.min(
    Math.max(
      Math.floor(value),
      1,
    ),
    10,
  );
}

function retryDelayMs(
  domain: IntegrationRetryDomain,
  attemptCount: number,
) {
  const baseDelay =
    domain === "action"
      ? 1_000
      : 2_000;

  return Math.min(
    baseDelay *
      2 ** Math.max(
        attemptCount - 1,
        0,
      ),
    MAX_RETRY_DELAY_MS,
  );
}

function isTransientHttpStatus(
  status: number | null | undefined,
) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (
      typeof status === "number" &&
      status >= 500 &&
      status <= 599
    )
  );
}

export function evaluateIntegrationRetry(args: {
  domain: IntegrationRetryDomain;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string | null | undefined;
  responseStatus?: number | null;
  now?: Date;
}): IntegrationRetryDecision {
  const attemptCount =
    Math.max(
      Math.floor(
        args.attemptCount,
      ),
      0,
    );

  const maxAttempts =
    normalizeAttemptLimit(
      args.maxAttempts,
    );

  const code =
    args.errorCode?.trim() ||
    "INTEGRATION_OPERATION_FAILED";

  const exhausted =
    attemptCount >= maxAttempts;

  const transient =
    !PERMANENT_ERROR_CODES.has(
      code,
    ) &&
    (
      TRANSIENT_ERROR_CODES.has(
        code,
      ) ||
      isTransientHttpStatus(
        args.responseStatus,
      )
    );

  if (exhausted) {
    return {
      retryable: false,
      exhausted: true,
      attemptCount,
      maxAttempts,
      delayMs: null,
      nextRetryAt: null,
      reasonCode:
        "INTEGRATION_RETRY_BUDGET_EXHAUSTED",
      reason:
        "The integration operation used its bounded retry budget.",
    };
  }

  if (!transient) {
    return {
      retryable: false,
      exhausted: false,
      attemptCount,
      maxAttempts,
      delayMs: null,
      nextRetryAt: null,
      reasonCode:
        "INTEGRATION_ERROR_NOT_RETRYABLE",
      reason:
        "The integration failure is permanent or requires configuration or human action.",
    };
  }

  const delayMs =
    retryDelayMs(
      args.domain,
      attemptCount,
    );

  const now =
    args.now ?? new Date();

  return {
    retryable: true,
    exhausted: false,
    attemptCount,
    maxAttempts,
    delayMs,
    nextRetryAt:
      new Date(
        now.getTime() +
          delayMs,
      ).toISOString(),
    reasonCode:
      "INTEGRATION_RETRY_SCHEDULED",
    reason:
      "A transient integration failure remains inside the bounded retry budget.",
  };
}

export function isIntegrationRetryDue(
  nextRetryAt: string | null,
  now = new Date(),
) {
  if (!nextRetryAt) {
    return true;
  }

  const timestamp =
    Date.parse(
      nextRetryAt,
    );

  return (
    Number.isFinite(
      timestamp,
    ) &&
    timestamp <=
      now.getTime()
  );
}