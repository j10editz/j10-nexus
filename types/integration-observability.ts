export const INTEGRATION_LOG_SOURCES = [
  "action",
  "webhook",
  "system",
] as const;

export type IntegrationLogSource =
  (typeof INTEGRATION_LOG_SOURCES)[number];

export const INTEGRATION_LOG_SEVERITIES = [
  "debug",
  "info",
  "warning",
  "error",
] as const;

export type IntegrationLogSeverity =
  (typeof INTEGRATION_LOG_SEVERITIES)[number];

export const INTEGRATION_LOG_STATUSES = [
  "received",
  "started",
  "succeeded",
  "failed",
  "blocked",
  "duplicate",
  "retry_scheduled",
  "retrying",
  "exhausted",
] as const;

export type IntegrationLogStatus =
  (typeof INTEGRATION_LOG_STATUSES)[number];

export type IntegrationOperationLog = {
  readonly id: string;
  readonly userId: string;
  readonly integrationId: string;
  readonly providerId: string;
  readonly source: IntegrationLogSource;
  readonly eventType: string;
  readonly severity: IntegrationLogSeverity;
  readonly status: IntegrationLogStatus;
  readonly correlationId: string;
  readonly actionExecutionId: string | null;
  readonly webhookEventId: string | null;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly retryable: boolean;
  readonly nextRetryAt: string | null;
  readonly errorCode: string | null;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
};

export type WriteIntegrationOperationLogInput = {
  readonly userId: string;
  readonly integrationId: string;
  readonly providerId: string;
  readonly source: IntegrationLogSource;
  readonly eventType: string;
  readonly severity: IntegrationLogSeverity;
  readonly status: IntegrationLogStatus;
  readonly correlationId: string;
  readonly actionExecutionId?: string | null;
  readonly webhookEventId?: string | null;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly retryable?: boolean;
  readonly nextRetryAt?: string | null;
  readonly errorCode?: string | null;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type IntegrationRetryDomain =
  | "action"
  | "webhook";

export type IntegrationRetryDecision = {
  readonly retryable: boolean;
  readonly exhausted: boolean;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly delayMs: number | null;
  readonly nextRetryAt: string | null;
  readonly reasonCode: string;
  readonly reason: string;
};