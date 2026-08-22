import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationConnection,
  IntegrationEnvironment,
  IntegrationProviderId,
} from "../../../types/integration";

import type {
  ExternalTriggerEvent,
} from "../../../types/external-trigger";

import type {
  IntegrationWebhookEndpoint,
  IntegrationWebhookEndpointStatus,
  IntegrationWebhookEvent,
  IntegrationWebhookProcessingStatus,
  IntegrationWebhookReceipt,
  IntegrationWebhookSignatureStatus,
  RecordIntegrationWebhookEventInput,
} from "../../../types/integration-webhook";

import {
  IntegrationWebhookError,
} from "./errors";

import {
  DEFAULT_INTEGRATION_WEBHOOK_MAX_ATTEMPTS,
  isIntegrationRetryDue,
} from "../retry-policy";

const WEBHOOK_ENDPOINT_SELECT = `
  id,
  integration_id,
  user_id,
  provider,
  environment,
  endpoint_key,
  status,
  max_payload_bytes,
  last_received_at,
  last_event_id,
  created_at,
  updated_at
`;

const WEBHOOK_EVENT_SELECT = `
  id,
  endpoint_id,
  integration_id,
  user_id,
  provider,
  request_id,
  event_type,
  external_event_id,
  replay_key,
  signature_status,
  processing_status,
  payload_sha256,
  payload,
  headers,
  occurred_at,
  received_at,
  normalized_event,
  adapted_at,
  processed_at,
  failure_code,
  failure_message,
  attempt_count,
  max_attempts,
  retryable,
  next_retry_at,
  last_attempted_at,
  last_error_at
`;

interface WebhookEndpointRow {
  id: string;
  integration_id: string;
  user_id: string;
  provider: string;
  environment: string;
  endpoint_key: string;
  status: string;
  max_payload_bytes: number;
  last_received_at: string | null;
  last_event_id: string | null;
  created_at: string;
  updated_at: string;
}

interface WebhookEventRow {
  id: string;
  endpoint_id: string;
  integration_id: string;
  user_id: string;
  provider: string;
  request_id: string;
  event_type: string;
  external_event_id: string | null;
  replay_key: string;
  signature_status: string;
  processing_status: string;
  payload_sha256: string;
  payload: Record<string, unknown> | null;
  headers: Record<string, string> | null;
  occurred_at: string;
  received_at: string;
  normalized_event: Record<string, unknown> | null;
  adapted_at: string | null;
  processed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  attempt_count: number;
  max_attempts: number;
  retryable: boolean;
  next_retry_at: string | null;
  last_attempted_at: string | null;
  last_error_at: string | null;
}

function databaseError(
  message: string,
  error: unknown,
) {
  const possibleError = error as {
    code?: string;
    message?: string;
  } | null;

  return new IntegrationWebhookError(
    message,
    possibleError?.code || "INTEGRATION_WEBHOOK_DATABASE_ERROR",
    500,
    false,
  );
}

function mapEndpointRow(
  row: WebhookEndpointRow,
): IntegrationWebhookEndpoint {
  return {
    id: row.id,
    integrationId: row.integration_id,
    userId: row.user_id,
    providerId: row.provider as IntegrationProviderId,
    environment: row.environment as IntegrationEnvironment,
    endpointKey: row.endpoint_key,
    status: row.status as IntegrationWebhookEndpointStatus,
    maxPayloadBytes: row.max_payload_bytes,
    lastReceivedAt: row.last_received_at,
    lastEventId: row.last_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(
  row: WebhookEventRow,
): IntegrationWebhookEvent {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    integrationId: row.integration_id,
    userId: row.user_id,
    providerId: row.provider as IntegrationProviderId,
    requestId: row.request_id,
    eventType: row.event_type,
    externalEventId: row.external_event_id,
    replayKey: row.replay_key,
    signatureStatus:
      row.signature_status as IntegrationWebhookSignatureStatus,
    processingStatus:
      row.processing_status as IntegrationWebhookProcessingStatus,
    payloadSha256: row.payload_sha256,
    payload: row.payload ?? {},
    headers: row.headers ?? {},
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    normalizedEvent: row.normalized_event
      ? row.normalized_event as unknown as ExternalTriggerEvent
      : null,
    adaptedAt: row.adapted_at,
    processedAt: row.processed_at,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    retryable: row.retryable,
    nextRetryAt: row.next_retry_at,
    lastAttemptedAt: row.last_attempted_at,
    lastErrorAt: row.last_error_at,
  };
}

export async function getIntegrationWebhookEndpointByConnection(
  supabase: SupabaseClient,
  userId: string,
  integrationId: string,
) {
  const { data, error } = await supabase
    .from("integration_webhook_endpoints")
    .select(WEBHOOK_ENDPOINT_SELECT)
    .eq("user_id", userId)
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (error) {
    throw databaseError(
      "J10 could not load the integration webhook endpoint.",
      error,
    );
  }

  return data
    ? mapEndpointRow(data as WebhookEndpointRow)
    : null;
}

export async function getIntegrationWebhookEndpointByKey(
  supabase: SupabaseClient,
  endpointKey: string,
) {
  const { data, error } = await supabase
    .from("integration_webhook_endpoints")
    .select(WEBHOOK_ENDPOINT_SELECT)
    .eq("endpoint_key", endpointKey)
    .maybeSingle();

  if (error) {
    throw databaseError(
      "J10 could not resolve the webhook endpoint.",
      error,
    );
  }

  return data
    ? mapEndpointRow(data as WebhookEndpointRow)
    : null;
}

export async function createOrEnableIntegrationWebhookEndpoint(
  supabase: SupabaseClient,
  connection: IntegrationConnection,
  maxPayloadBytes: number,
) {
  const existing = await getIntegrationWebhookEndpointByConnection(
    supabase,
    connection.workspaceId,
    connection.id,
  );

  if (existing) {
    const { data, error } = await supabase
      .from("integration_webhook_endpoints")
      .update({
        status: "active",
        max_payload_bytes: maxPayloadBytes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", connection.workspaceId)
      .select(WEBHOOK_ENDPOINT_SELECT)
      .single();

    if (error) {
      throw databaseError(
        "J10 could not enable the integration webhook endpoint.",
        error,
      );
    }

    return mapEndpointRow(data as WebhookEndpointRow);
  }

  const { data, error } = await supabase
    .from("integration_webhook_endpoints")
    .insert({
      integration_id: connection.id,
      user_id: connection.workspaceId,
      provider: connection.providerId,
      environment: connection.environment,
      status: "active",
      max_payload_bytes: maxPayloadBytes,
    })
    .select(WEBHOOK_ENDPOINT_SELECT)
    .single();

  if (error) {
    throw databaseError(
      "J10 could not create the integration webhook endpoint.",
      error,
    );
  }

  return mapEndpointRow(data as WebhookEndpointRow);
}

export async function disableIntegrationWebhookEndpoint(
  supabase: SupabaseClient,
  userId: string,
  integrationId: string,
) {
  const { data, error } = await supabase
    .from("integration_webhook_endpoints")
    .update({
      status: "disabled",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("integration_id", integrationId)
    .select(WEBHOOK_ENDPOINT_SELECT)
    .maybeSingle();

  if (error) {
    throw databaseError(
      "J10 could not disable the integration webhook endpoint.",
      error,
    );
  }

  return data
    ? mapEndpointRow(data as WebhookEndpointRow)
    : null;
}

export async function recordIntegrationWebhookEvent(
  supabase: SupabaseClient,
  input: RecordIntegrationWebhookEventInput,
): Promise<IntegrationWebhookReceipt> {
  const { data, error } = await supabase
    .from("integration_webhook_events")
    .insert({
      endpoint_id: input.endpoint.id,
      integration_id: input.endpoint.integrationId,
      user_id: input.endpoint.userId,
      provider: input.endpoint.providerId,
      request_id: input.requestId,
      event_type: input.eventType,
      external_event_id: input.externalEventId,
      replay_key: input.replayKey,
      signature_status: input.signatureStatus,
      processing_status: "pending_adapter",
      payload_sha256: input.payloadSha256,
      payload: input.payload,
      headers: input.headers,
      attempt_count:
        0,
      max_attempts:
        DEFAULT_INTEGRATION_WEBHOOK_MAX_ATTEMPTS,
      retryable:
        false,
      next_retry_at:
        null,
      last_attempted_at:
        null,
      last_error_at:
        null,
      occurred_at:
        input.occurredAt,
    })
    .select(WEBHOOK_EVENT_SELECT)
    .single();

  if (error) {
    const possibleError = error as {
      code?: string;
    };

    if (possibleError.code === "23505") {
      const { data: duplicate, error: duplicateError } =
        await supabase
          .from("integration_webhook_events")
          .select(WEBHOOK_EVENT_SELECT)
          .eq("endpoint_id", input.endpoint.id)
          .eq("replay_key", input.replayKey)
          .single();

      if (duplicateError) {
        throw databaseError(
          "J10 detected a replay but could not load the preserved receipt.",
          duplicateError,
        );
      }

      return {
        event: mapEventRow(duplicate as WebhookEventRow),
        duplicate: true,
      };
    }

    throw databaseError(
      "J10 could not persist the webhook event.",
      error,
    );
  }

  const event = mapEventRow(data as WebhookEventRow);

  const { error: endpointError } = await supabase
    .from("integration_webhook_endpoints")
    .update({
      last_received_at: event.receivedAt,
      last_event_id: event.id,
      updated_at: event.receivedAt,
    })
    .eq("id", input.endpoint.id);

  if (endpointError) {
    console.error(
      "J10 webhook endpoint activity update error:",
      endpointError,
    );
  }

  return {
    event,
    duplicate: false,
  };
}

export async function beginIntegrationWebhookEventAttempt(
  supabase: SupabaseClient,
  event: IntegrationWebhookEvent,
): Promise<IntegrationWebhookEvent> {
  const retrying =
    event.processingStatus ===
      "failed";

  if (
    event.processingStatus !==
      "pending_adapter" &&
    !retrying
  ) {
    throw new IntegrationWebhookError(
      "The webhook event is not eligible for processing.",
      "INTEGRATION_WEBHOOK_ATTEMPT_NOT_ALLOWED",
      409,
      false,
    );
  }

  if (
    retrying &&
    !event.retryable
  ) {
    throw new IntegrationWebhookError(
      "The webhook event failure is not retryable.",
      "INTEGRATION_WEBHOOK_RETRY_NOT_ALLOWED",
      409,
      false,
    );
  }

  if (
    event.attemptCount >=
    event.maxAttempts
  ) {
    throw new IntegrationWebhookError(
      "The webhook retry budget is exhausted.",
      "INTEGRATION_RETRY_BUDGET_EXHAUSTED",
      409,
      false,
    );
  }

  if (
    retrying &&
    !isIntegrationRetryDue(
      event.nextRetryAt,
    )
  ) {
    throw new IntegrationWebhookError(
      "The webhook retry is not due yet.",
      "INTEGRATION_WEBHOOK_RETRY_NOT_DUE",
      409,
      false,
    );
  }

  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_webhook_events",
    )
    .update({
      processing_status:
        "pending_adapter",
      attempt_count:
        event.attemptCount +
        1,
      retryable:
        false,
      next_retry_at:
        null,
      last_attempted_at:
        now,
      normalized_event:
        null,
      adapted_at:
        null,
      processed_at:
        null,
      failure_code:
        null,
      failure_message:
        null,
    })
    .eq(
      "id",
      event.id,
    )
    .eq(
      "endpoint_id",
      event.endpointId,
    )
    .eq(
      "integration_id",
      event.integrationId,
    )
    .eq(
      "user_id",
      event.userId,
    )
    .eq(
      "attempt_count",
      event.attemptCount,
    )
    .select(
      WEBHOOK_EVENT_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw databaseError(
      "J10 could not begin the webhook processing attempt.",
      error,
    );
  }

  return mapEventRow(
    data as WebhookEventRow,
  );
}
export async function markIntegrationWebhookEventAdapted(

  supabase: SupabaseClient,
  event: IntegrationWebhookEvent,
  normalizedEvent: ExternalTriggerEvent,
) {
  const adaptedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("integration_webhook_events")
    .update({
      processing_status: "adapted",
      normalized_event: normalizedEvent,
      adapted_at:
        adaptedAt,
      retryable:
        false,
      next_retry_at:
        null,
      failure_code:
        null,
      failure_message:
        null,
    })
    .eq("id", event.id)
    .eq("endpoint_id", event.endpointId)
    .eq("integration_id", event.integrationId)
    .eq("user_id", event.userId)
    .select(WEBHOOK_EVENT_SELECT)
    .single();

  if (error) {
    throw databaseError(
      "J10 could not persist the adapted external trigger.",
      error,
    );
  }

  return mapEventRow(data as WebhookEventRow);
}

export async function markIntegrationWebhookEventProcessed(
  supabase: SupabaseClient,
  event: IntegrationWebhookEvent,
): Promise<IntegrationWebhookEvent> {
  const processedAt =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_webhook_events",
    )
    .update({
      processing_status:
        "processed",
      processed_at:
        processedAt,
      retryable:
        false,
      next_retry_at:
        null,
      failure_code:
        null,
      failure_message:
        null,
    })
    .eq(
      "id",
      event.id,
    )
    .eq(
      "endpoint_id",
      event.endpointId,
    )
    .eq(
      "integration_id",
      event.integrationId,
    )
    .eq(
      "user_id",
      event.userId,
    )
    .in(
      "processing_status",
      [
        "adapted",
        "processed",
      ],
    )
    .select(
      WEBHOOK_EVENT_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw databaseError(
      "J10 could not persist the processed webhook event.",
      error,
    );
  }

  return mapEventRow(
    data as WebhookEventRow,
  );
}
export async function markIntegrationWebhookEventAdapterFailed(
  supabase: SupabaseClient,
  event: IntegrationWebhookEvent,
  failureCode: string,
  failureMessage: string,
  retry?: {
    retryable: boolean;
    nextRetryAt: string | null;
  },
) {
  const now =
    new Date().toISOString();

  const retryable =
    retry?.retryable ===
      true &&
    event.attemptCount <
      event.maxAttempts;

  const { data, error } = await supabase
    .from("integration_webhook_events")
    .update({
      processing_status: "failed",
      normalized_event: null,
      adapted_at: null,
      failure_code:
        failureCode.slice(
          0,
          120,
        ),
      failure_message:
        failureMessage.slice(
          0,
          1000,
        ),
      retryable,
      next_retry_at:
        retryable
          ? retry?.nextRetryAt ??
            null
          : null,
      last_error_at:
        now,
      processed_at:
        now,
    })
    .eq("id", event.id)
    .eq("endpoint_id", event.endpointId)
    .eq("integration_id", event.integrationId)
    .eq("user_id", event.userId)
    .select(WEBHOOK_EVENT_SELECT)
    .single();

  if (error) {
    throw databaseError(
      "J10 could not record the external trigger adapter failure.",
      error,
    );
  }

  return mapEventRow(data as WebhookEventRow);
}