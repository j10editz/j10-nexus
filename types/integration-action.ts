import type {
  IntegrationEnvironment,
  IntegrationProviderId,
} from "./integration";

export const INTEGRATION_ACTION_SCHEMA_VERSION =
  "j10.integration-action.v1" as const;

export const INTEGRATION_ACTION_MODES = [
  "simulate",
  "sandbox",
  "live",
] as const;

export type IntegrationActionMode =
  (typeof INTEGRATION_ACTION_MODES)[number];

export const INTEGRATION_ACTION_EXECUTION_STATUSES = [
  "executing",
  "succeeded",
  "failed",
  "blocked",
] as const;

export type IntegrationActionExecutionStatus =
  (typeof INTEGRATION_ACTION_EXECUTION_STATUSES)[number];

export type IntegrationActionRisk =
  | "external_side_effect"
  | "high_risk";

export interface IntegrationActionPolicyDecision {
  readonly allowed: boolean;
  readonly requiresHumanApproval: boolean;
  readonly risk: IntegrationActionRisk;
  readonly code: string;
  readonly reason: string;
}

export interface IntegrationActionRequest {
  readonly capabilityId: string;
  readonly mode: IntegrationActionMode;
  readonly idempotencyKey: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface IntegrationActionPlan {
  readonly schemaVersion:
    typeof INTEGRATION_ACTION_SCHEMA_VERSION;

  readonly providerId: IntegrationProviderId;
  readonly capabilityId: string;
  readonly mode: IntegrationActionMode;
  readonly environment: IntegrationEnvironment;
  readonly adapter: string;
  readonly operation: string;
  readonly inputKeys: readonly string[];
  readonly target: string;
  readonly method: string;
}

export interface IntegrationActionAdapterResult {
  readonly success: boolean;
  readonly responseStatus: number | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface IntegrationActionExecution {
  readonly id: string;
  readonly userId: string;
  readonly integrationId: string;
  readonly providerId: IntegrationProviderId;
  readonly capabilityId: string;
  readonly mode: IntegrationActionMode;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly status: IntegrationActionExecutionStatus;
  readonly requiresApproval: boolean;
  readonly responseStatus: number | null;
  readonly resultMetadata: Readonly<Record<string, unknown>>;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly retryable: boolean;
  readonly nextRetryAt: string | null;
  readonly lastAttemptedAt: string;
  readonly lastErrorAt: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IntegrationActionClaimResult {
  readonly claimed: boolean;
  readonly execution: IntegrationActionExecution;
}