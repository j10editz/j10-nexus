import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationProviderId,
} from "../../types/integration";

import type {
  IntegrationActionClaimResult,
  IntegrationActionExecution,
  IntegrationActionExecutionStatus,
  IntegrationActionMode,
} from "../../types/integration-action";

import {
  isIntegrationProviderId,
} from "./registry";

import {
  DEFAULT_INTEGRATION_ACTION_MAX_ATTEMPTS,
  isIntegrationRetryDue,
} from "./retry-policy";

const ACTION_EXECUTION_SELECT = `
  id,
  user_id,
  integration_id,
  provider,
  capability_id,
  mode,
  idempotency_key,
  request_fingerprint,
  status,
  requires_approval,
  response_status,
  result_metadata,
  error_code,
  error_message,
  attempt_count,
  max_attempts,
  retryable,
  next_retry_at,
  last_attempted_at,
  last_error_at,
  started_at,
  completed_at,
  created_at,
  updated_at
`;

interface IntegrationActionExecutionRow {
  id: string;
  user_id: string;
  integration_id: string;
  provider: string;
  capability_id: string;
  mode: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: string;
  requires_approval: boolean;
  response_status: number | null;
  result_metadata: unknown;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  retryable: boolean;
  next_retry_at: string | null;
  last_attempted_at: string;
  last_error_at: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimIntegrationActionInput {
  readonly userId: string;
  readonly integrationId: string;
  readonly providerId: IntegrationProviderId;
  readonly capabilityId: string;
  readonly mode: IntegrationActionMode;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly requiresApproval: boolean;
}

export interface FinishIntegrationActionInput {
  readonly status: Exclude<
    IntegrationActionExecutionStatus,
    "executing"
  >;
  readonly responseStatus?: number | null;
  readonly resultMetadata?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly retryable?: boolean;
  readonly nextRetryAt?: string | null;
}

export class IntegrationActionDatabaseError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(
    message: string,
    code = "INTEGRATION_ACTION_DATABASE_ERROR",
    details?: unknown,
  ) {
    super(message);

    this.name =
      "IntegrationActionDatabaseError";

    this.code =
      code;

    this.details =
      details;
  }
}

function createDatabaseError(
  message: string,
  error: unknown,
): IntegrationActionDatabaseError {
  const possibleError =
    error as {
      code?: string;
      message?: string;
      details?: unknown;
    } | null;

  return new IntegrationActionDatabaseError(
    message,
    possibleError?.code ??
      "INTEGRATION_ACTION_DATABASE_ERROR",
    possibleError?.details ??
      possibleError?.message ??
      error,
  );
}

function normalizeMode(
  value: string,
): IntegrationActionMode {
  switch (value) {
    case "sandbox":
    case "live":
      return value;

    default:
      return "simulate";
  }
}

function normalizeStatus(
  value: string,
): IntegrationActionExecutionStatus {
  switch (value) {
    case "succeeded":
    case "failed":
    case "blocked":
      return value;

    default:
      return "executing";
  }
}

function normalizeMetadata(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as
    Readonly<Record<string, unknown>>;
}

function mapExecutionRow(
  row: IntegrationActionExecutionRow,
): IntegrationActionExecution {
  if (
    !isIntegrationProviderId(
      row.provider,
    )
  ) {
    throw new IntegrationActionDatabaseError(
      `Unsupported integration action provider: ${row.provider}`,
      "UNSUPPORTED_INTEGRATION_ACTION_PROVIDER",
    );
  }

  return {
    id:
      row.id,
    userId:
      row.user_id,
    integrationId:
      row.integration_id,
    providerId:
      row.provider,
    capabilityId:
      row.capability_id,
    mode:
      normalizeMode(row.mode),
    idempotencyKey:
      row.idempotency_key,
    requestFingerprint:
      row.request_fingerprint,
    status:
      normalizeStatus(row.status),
    requiresApproval:
      row.requires_approval,
    responseStatus:
      row.response_status,
    resultMetadata:
      normalizeMetadata(
        row.result_metadata,
      ),
    errorCode:
      row.error_code,
    errorMessage:
      row.error_message,
    attemptCount:
      row.attempt_count,
    maxAttempts:
      row.max_attempts,
    retryable:
      row.retryable,
    nextRetryAt:
      row.next_retry_at,
    lastAttemptedAt:
      row.last_attempted_at,
    lastErrorAt:
      row.last_error_at,
    startedAt:
      row.started_at,
    completedAt:
      row.completed_at,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

async function getExecutionByIdempotencyKey(
  supabase: SupabaseClient,
  userId: string,
  integrationId: string,
  idempotencyKey: string,
): Promise<IntegrationActionExecution | null> {
  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_action_executions",
    )
    .select(
      ACTION_EXECUTION_SELECT,
    )
    .eq("user_id", userId)
    .eq(
      "integration_id",
      integrationId,
    )
    .eq(
      "idempotency_key",
      idempotencyKey,
    )
    .maybeSingle();

  if (error) {
    throw createDatabaseError(
      "Could not load the existing integration action.",
      error,
    );
  }

  return data
    ? mapExecutionRow(
        data as
          IntegrationActionExecutionRow,
      )
    : null;
}

export async function claimIntegrationActionExecution(
  supabase: SupabaseClient,
  input: ClaimIntegrationActionInput,
): Promise<IntegrationActionClaimResult> {
  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_action_executions",
    )
    .insert({
      user_id:
        input.userId,
      integration_id:
        input.integrationId,
      provider:
        input.providerId,
      capability_id:
        input.capabilityId,
      mode:
        input.mode,
      idempotency_key:
        input.idempotencyKey,
      request_fingerprint:
        input.requestFingerprint,
      status:
        "executing",
      requires_approval:
        input.requiresApproval,
      response_status:
        null,
      result_metadata:
        {},
      error_code:
        null,
      error_message:
        null,
      attempt_count:
        1,
      max_attempts:
        DEFAULT_INTEGRATION_ACTION_MAX_ATTEMPTS,
      retryable:
        false,
      next_retry_at:
        null,
      last_attempted_at:
        now,
      last_error_at:
        null,
      started_at:
        now,
      completed_at:
        null,
      updated_at:
        now,
    })
    .select(
      ACTION_EXECUTION_SELECT,
    )
    .single();

  if (
    !error &&
    data
  ) {
    return {
      claimed: true,
      execution:
        mapExecutionRow(
          data as
            IntegrationActionExecutionRow,
        ),
    };
  }

  const possibleError =
    error as {
      code?: string;
    } | null;

  if (
    possibleError?.code !== "23505"
  ) {
    throw createDatabaseError(
      "Could not claim the integration action execution.",
      error,
    );
  }

  const existing =
    await getExecutionByIdempotencyKey(
      supabase,
      input.userId,
      input.integrationId,
      input.idempotencyKey,
    );

  if (!existing) {
    throw new IntegrationActionDatabaseError(
      "The integration action idempotency collision could not be resolved.",
      "INTEGRATION_ACTION_IDEMPOTENCY_COLLISION",
    );
  }

  if (
    existing.requestFingerprint !==
    input.requestFingerprint
  ) {
    throw new IntegrationActionDatabaseError(
      "The idempotency key was already used for a different integration action request.",
      "INTEGRATION_ACTION_IDEMPOTENCY_CONFLICT",
    );
  }

  return {
    claimed: false,
    execution:
      existing,
  };
}

export async function finishIntegrationActionExecution(
  supabase: SupabaseClient,
  userId: string,
  executionId: string,
  input: FinishIntegrationActionInput,
): Promise<IntegrationActionExecution> {
  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_action_executions",
    )
    .update({
      status:
        input.status,
      response_status:
        input.responseStatus ??
        null,
      result_metadata:
        input.resultMetadata ??
        {},
      error_code:
        input.errorCode ??
        null,
      error_message:
        input.errorMessage ??
        null,
      retryable:
        input.status ===
          "failed" &&
        (
          input.retryable ??
          false
        ),
      next_retry_at:
        input.status ===
          "failed"
          ? input.nextRetryAt ??
            null
          : null,
      last_attempted_at:
        now,
      last_error_at:
        input.status ===
          "failed"
          ? now
          : null,
      completed_at:
        now,
      updated_at:
        now,
    })
    .eq("id", executionId)
    .eq("user_id", userId)
    .eq("status", "executing")
    .select(
      ACTION_EXECUTION_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw createDatabaseError(
      "Could not finalize the integration action execution.",
      error,
    );
  }

  return mapExecutionRow(
    data as
      IntegrationActionExecutionRow,
  );
}

export async function resumeApprovedIntegrationActionExecution(
  supabase: SupabaseClient,
  userId: string,
  executionId: string,
): Promise<IntegrationActionExecution> {
  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_action_executions",
    )
    .update({
      status:
        "executing",
      response_status:
        null,
      error_code:
        null,
      error_message:
        null,
      retryable:
        false,
      next_retry_at:
        null,
      last_attempted_at:
        now,
      started_at:
        now,
      completed_at:
        null,
      updated_at:
        now,
    })
    .eq("id", executionId)
    .eq("user_id", userId)
    .eq("status", "blocked")
    .eq(
      "error_code",
      "INTEGRATION_ACTION_APPROVAL_REQUIRED",
    )
    .select(
      ACTION_EXECUTION_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw createDatabaseError(
      "Could not resume the approved integration action execution.",
      error,
    );
  }

  return mapExecutionRow(
    data as
      IntegrationActionExecutionRow,
  );
}

export async function getIntegrationActionExecutionById(
  supabase: SupabaseClient,
  userId: string,
  executionId: string,
): Promise<IntegrationActionExecution | null> {
  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_action_executions",
    )
    .select(
      ACTION_EXECUTION_SELECT,
    )
    .eq(
      "id",
      executionId,
    )
    .eq(
      "user_id",
      userId,
    )
    .maybeSingle();

  if (error) {
    throw createDatabaseError(
      "Could not load the integration action execution.",
      error,
    );
  }

  return data
    ? mapExecutionRow(
        data as
          IntegrationActionExecutionRow,
      )
    : null;
}

export async function beginIntegrationActionRetry(
  supabase: SupabaseClient,
  userId: string,
  executionId: string,
): Promise<IntegrationActionExecution> {
  const current =
    await getIntegrationActionExecutionById(
      supabase,
      userId,
      executionId,
    );

  if (!current) {
    throw new IntegrationActionDatabaseError(
      "The integration action execution was not found.",
      "INTEGRATION_ACTION_EXECUTION_NOT_FOUND",
    );
  }

  if (
    current.status !==
      "failed" ||
    !current.retryable
  ) {
    throw new IntegrationActionDatabaseError(
      "The integration action execution is not eligible for retry.",
      "INTEGRATION_ACTION_RETRY_NOT_ALLOWED",
    );
  }

  if (
    current.attemptCount >=
    current.maxAttempts
  ) {
    throw new IntegrationActionDatabaseError(
      "The integration action retry budget is exhausted.",
      "INTEGRATION_RETRY_BUDGET_EXHAUSTED",
    );
  }

  if (
    !isIntegrationRetryDue(
      current.nextRetryAt,
    )
  ) {
    throw new IntegrationActionDatabaseError(
      "The integration action retry is not due yet.",
      "INTEGRATION_ACTION_RETRY_NOT_DUE",
    );
  }

  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_action_executions",
    )
    .update({
      status:
        "executing",
      attempt_count:
        current.attemptCount +
        1,
      retryable:
        false,
      next_retry_at:
        null,
      response_status:
        null,
      result_metadata:
        {},
      error_code:
        null,
      error_message:
        null,
      started_at:
        now,
      completed_at:
        null,
      last_attempted_at:
        now,
      updated_at:
        now,
    })
    .eq(
      "id",
      executionId,
    )
    .eq(
      "user_id",
      userId,
    )
    .eq(
      "status",
      "failed",
    )
    .eq(
      "retryable",
      true,
    )
    .eq(
      "attempt_count",
      current.attemptCount,
    )
    .select(
      ACTION_EXECUTION_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw createDatabaseError(
      "Could not begin the integration action retry.",
      error,
    );
  }

  return mapExecutionRow(
    data as
      IntegrationActionExecutionRow,
  );
}
export async function listIntegrationActionExecutions(

  supabase: SupabaseClient,
  userId: string,
  integrationId: string,
  limit = 25,
): Promise<IntegrationActionExecution[]> {
  const safeLimit =
    Math.min(
      Math.max(
        Math.floor(limit),
        1,
      ),
      100,
    );

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_action_executions",
    )
    .select(
      ACTION_EXECUTION_SELECT,
    )
    .eq("user_id", userId)
    .eq(
      "integration_id",
      integrationId,
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(safeLimit);

  if (error) {
    throw createDatabaseError(
      "Could not load integration action history.",
      error,
    );
  }

  return (
    (data ?? []) as
      IntegrationActionExecutionRow[]
  ).map(
    mapExecutionRow,
  );
}

export function serializeIntegrationActionExecution(
  execution: IntegrationActionExecution,
) {
  return {
    id:
      execution.id,
    integrationId:
      execution.integrationId,
    providerId:
      execution.providerId,
    capabilityId:
      execution.capabilityId,
    mode:
      execution.mode,
    idempotencyKey:
      execution.idempotencyKey,
    status:
      execution.status,
    requiresApproval:
      execution.requiresApproval,
    responseStatus:
      execution.responseStatus,
    resultMetadata:
      execution.resultMetadata,
    errorCode:
      execution.errorCode,
    errorMessage:
      execution.errorMessage,
    attemptCount:
      execution.attemptCount,
    maxAttempts:
      execution.maxAttempts,
    retryable:
      execution.retryable,
    nextRetryAt:
      execution.nextRetryAt,
    lastAttemptedAt:
      execution.lastAttemptedAt,
    lastErrorAt:
      execution.lastErrorAt,
    startedAt:
      execution.startedAt,
    completedAt:
      execution.completedAt,
    createdAt:
      execution.createdAt,
    updatedAt:
      execution.updatedAt,
  };
}