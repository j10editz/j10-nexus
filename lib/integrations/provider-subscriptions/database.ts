import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationEnvironment,
} from "@/types/integration";

import type {
  IntegrationProviderSubscriptionKind,
  IntegrationProviderSubscriptionMode,
  IntegrationProviderSubscriptionResult,
  IntegrationProviderSubscriptionState,
} from "@/types/integration-provider-subscription";

export type GoogleSubscriptionProvider =
  | "gmail"
  | "google-calendar";

export const PROVIDER_SUBSCRIPTION_SELECT = `
  id,
  user_id,
  integration_id,
  endpoint_id,
  provider,
  kind,
  mode,
  state,
  callback_url,
  external_channel_id,
  external_resource_id,
  external_history_id,
  expires_at,
  channel_token_sha256,
  provider_request_id,
  options,
  metadata,
  last_notification_at,
  stopped_at,
  last_error_code,
  last_error_message,
  created_at,
  updated_at
`;

interface ProviderSubscriptionRow {
  id: string;
  user_id: string;
  integration_id: string;
  endpoint_id: string;
  provider: string;
  kind: string;
  mode: string;
  state: string;
  callback_url: string;
  external_channel_id: string | null;
  external_resource_id: string | null;
  external_history_id: string | null;
  expires_at: string | null;
  channel_token_sha256: string | null;
  provider_request_id: string | null;
  options: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  last_notification_at: string | null;
  stopped_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationProviderSubscriptionRecord {
  id: string;
  userId: string;
  integrationId: string;
  endpointId: string;

  providerId:
    GoogleSubscriptionProvider;

  kind:
    IntegrationProviderSubscriptionKind;

  mode:
    IntegrationProviderSubscriptionMode;

  state:
    IntegrationProviderSubscriptionState;

  callbackUrl: string;

  externalChannelId:
    string | null;

  externalResourceId:
    string | null;

  externalHistoryId:
    string | null;

  expiresAt:
    string | null;

  channelTokenSha256:
    string | null;

  providerRequestId:
    string | null;

  options:
    Readonly<Record<string, unknown>>;

  metadata:
    Readonly<Record<string, unknown>>;

  lastNotificationAt:
    string | null;

  stoppedAt:
    string | null;

  lastErrorCode:
    string | null;

  lastErrorMessage:
    string | null;

  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderSubscriptionRecordInput {
  userId: string;
  integrationId: string;
  endpointId: string;

  providerId:
    GoogleSubscriptionProvider;

  environment:
    IntegrationEnvironment;

  result:
    IntegrationProviderSubscriptionResult;

  options:
    Readonly<Record<string, unknown>>;
}

export class ProviderSubscriptionDatabaseError
  extends Error {
  readonly code: string;

  constructor(
    message: string,
    code =
      "INTEGRATION_PROVIDER_SUBSCRIPTION_DATABASE_ERROR",
  ) {
    super(message);

    this.name =
      "ProviderSubscriptionDatabaseError";

    this.code =
      code;
  }
}

function databaseError(
  message: string,
  error: unknown,
): ProviderSubscriptionDatabaseError {
  const possibleError =
    error as {
      code?: string;
    } | null;

  return new ProviderSubscriptionDatabaseError(
    message,
    possibleError?.code ===
      "23505"
      ? "INTEGRATION_PROVIDER_SUBSCRIPTION_ALREADY_ACTIVE"
      : possibleError?.code ??
        "INTEGRATION_PROVIDER_SUBSCRIPTION_DATABASE_ERROR",
  );
}

function mapSubscriptionRow(
  row:
    ProviderSubscriptionRow,
): IntegrationProviderSubscriptionRecord {
  return {
    id:
      row.id,

    userId:
      row.user_id,

    integrationId:
      row.integration_id,

    endpointId:
      row.endpoint_id,

    providerId:
      row.provider as
        GoogleSubscriptionProvider,

    kind:
      row.kind as
        IntegrationProviderSubscriptionKind,

    mode:
      row.mode as
        IntegrationProviderSubscriptionMode,

    state:
      row.state as
        IntegrationProviderSubscriptionState,

    callbackUrl:
      row.callback_url,

    externalChannelId:
      row.external_channel_id,

    externalResourceId:
      row.external_resource_id,

    externalHistoryId:
      row.external_history_id,

    expiresAt:
      row.expires_at,

    channelTokenSha256:
      row.channel_token_sha256,

    providerRequestId:
      row.provider_request_id,

    options:
      row.options ?? {},

    metadata:
      row.metadata ?? {},

    lastNotificationAt:
      row.last_notification_at,

    stoppedAt:
      row.stopped_at,

    lastErrorCode:
      row.last_error_code,

    lastErrorMessage:
      row.last_error_message,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

export async function listProviderSubscriptions(
  supabase:
    SupabaseClient,

  userId:
    string,

  integrationId:
    string,
): Promise<
  IntegrationProviderSubscriptionRecord[]
> {
  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .select(
      PROVIDER_SUBSCRIPTION_SELECT,
    )
    .eq(
      "user_id",
      userId,
    )
    .eq(
      "integration_id",
      integrationId,
    )
    .order(
      "created_at",
      {
        ascending:
          false,
      },
    );

  if (error) {
    throw databaseError(
      "J10 could not load provider subscriptions.",
      error,
    );
  }

  return (
    (
      data ?? []
    ) as ProviderSubscriptionRow[]
  ).map(
    mapSubscriptionRow,
  );
}

export async function getProviderSubscriptionById(
  supabase:
    SupabaseClient,

  userId:
    string,

  integrationId:
    string,

  subscriptionId:
    string,
): Promise<
  IntegrationProviderSubscriptionRecord |
  null
> {
  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .select(
      PROVIDER_SUBSCRIPTION_SELECT,
    )
    .eq(
      "id",
      subscriptionId,
    )
    .eq(
      "user_id",
      userId,
    )
    .eq(
      "integration_id",
      integrationId,
    )
    .maybeSingle();

  if (error) {
    throw databaseError(
      "J10 could not load the provider subscription.",
      error,
    );
  }

  return data
    ? mapSubscriptionRow(
        data as ProviderSubscriptionRow,
      )
    : null;
}

export async function getActiveProviderSubscription(
  supabase:
    SupabaseClient,

  userId:
    string,

  integrationId:
    string,

  kind:
    IntegrationProviderSubscriptionKind,
): Promise<
  IntegrationProviderSubscriptionRecord |
  null
> {
  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .select(
      PROVIDER_SUBSCRIPTION_SELECT,
    )
    .eq(
      "user_id",
      userId,
    )
    .eq(
      "integration_id",
      integrationId,
    )
    .eq(
      "kind",
      kind,
    )
    .eq(
      "state",
      "active",
    )
    .maybeSingle();

  if (error) {
    throw databaseError(
      "J10 could not resolve the active provider subscription.",
      error,
    );
  }

  return data
    ? mapSubscriptionRow(
        data as ProviderSubscriptionRow,
      )
    : null;
}

export async function getActiveProviderSubscriptionByEndpoint(
  supabase:
    SupabaseClient,

  endpointId:
    string,

  providerId:
    GoogleSubscriptionProvider,
): Promise<
  IntegrationProviderSubscriptionRecord |
  null
> {
  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .select(
      PROVIDER_SUBSCRIPTION_SELECT,
    )
    .eq(
      "endpoint_id",
      endpointId,
    )
    .eq(
      "provider",
      providerId,
    )
    .eq(
      "state",
      "active",
    )
    .maybeSingle();

  if (error) {
    throw databaseError(
      "J10 could not resolve the notification subscription.",
      error,
    );
  }

  return data
    ? mapSubscriptionRow(
        data as ProviderSubscriptionRow,
      )
    : null;
}

export async function createProviderSubscriptionRecord(
  supabase:
    SupabaseClient,

  input:
    CreateProviderSubscriptionRecordInput,
): Promise<
  IntegrationProviderSubscriptionRecord
> {
  if (
    input.result.simulated ||
    input.result.state !==
      "active"
  ) {
    throw new ProviderSubscriptionDatabaseError(
      "Simulated provider subscriptions cannot be persisted.",
      "INTEGRATION_PROVIDER_SUBSCRIPTION_SIMULATION_NOT_PERSISTED",
    );
  }

  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .insert({
      user_id:
        input.userId,

      integration_id:
        input.integrationId,

      endpoint_id:
        input.endpointId,

      provider:
        input.providerId,

      kind:
        input.result.kind,

      mode:
        input.result.plan.mode,

      state:
        input.result.state,

      callback_url:
        input.result.plan
          .callbackUrl,

      external_channel_id:
        input.result
          .externalChannelId,

      external_resource_id:
        input.result
          .externalResourceId,

      external_history_id:
        input.result
          .externalHistoryId,

      expires_at:
        input.result.expiresAt,

      channel_token_sha256:
        input.result
          .channelTokenSha256,

      provider_request_id:
        input.result
          .providerRequestId,

      options:
        input.options,

      metadata: {
        ...input.result.metadata,

        environment:
          input.environment,

        adapterSchemaVersion:
          input.result.plan
            .schemaVersion,
      },

      last_error_code:
        null,

      last_error_message:
        null,

      created_at:
        now,

      updated_at:
        now,
    })
    .select(
      PROVIDER_SUBSCRIPTION_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw databaseError(
      "J10 could not persist the provider subscription.",
      error,
    );
  }

  return mapSubscriptionRow(
    data as ProviderSubscriptionRow,
  );
}

export async function markProviderSubscriptionStopped(
  supabase:
    SupabaseClient,

  subscription:
    IntegrationProviderSubscriptionRecord,
): Promise<
  IntegrationProviderSubscriptionRecord
> {
  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .update({
      state:
        "stopped",

      stopped_at:
        now,

      last_error_code:
        null,

      last_error_message:
        null,

      updated_at:
        now,
    })
    .eq(
      "id",
      subscription.id,
    )
    .eq(
      "user_id",
      subscription.userId,
    )
    .eq(
      "integration_id",
      subscription.integrationId,
    )
    .eq(
      "state",
      "active",
    )
    .select(
      PROVIDER_SUBSCRIPTION_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw databaseError(
      "J10 could not stop the provider subscription.",
      error,
    );
  }

  return mapSubscriptionRow(
    data as ProviderSubscriptionRow,
  );
}

export async function markProviderSubscriptionFailed(
  supabase:
    SupabaseClient,

  subscription:
    IntegrationProviderSubscriptionRecord,

  errorCode:
    string,

  errorMessage:
    string,
): Promise<
  IntegrationProviderSubscriptionRecord
> {
  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .update({
      state:
        "failed",

      last_error_code:
        errorCode.slice(
          0,
          160,
        ),

      last_error_message:
        errorMessage.slice(
          0,
          2_000,
        ),

      updated_at:
        now,
    })
    .eq(
      "id",
      subscription.id,
    )
    .eq(
      "user_id",
      subscription.userId,
    )
    .select(
      PROVIDER_SUBSCRIPTION_SELECT,
    )
    .single();

  if (
    error ||
    !data
  ) {
    throw databaseError(
      "J10 could not preserve the provider subscription failure.",
      error,
    );
  }

  return mapSubscriptionRow(
    data as ProviderSubscriptionRow,
  );
}

export async function markProviderSubscriptionNotification(
  supabase:
    SupabaseClient,

  subscription:
    IntegrationProviderSubscriptionRecord,

  externalHistoryId?:
    string | null,
): Promise<void> {
  const now =
    new Date().toISOString();

  const update: {
    last_notification_at:
      string;

    updated_at:
      string;

    external_history_id?:
      string;
  } = {
    last_notification_at:
      now,

    updated_at:
      now,
  };

  if (
    externalHistoryId?.trim()
  ) {
    update.external_history_id =
      externalHistoryId.trim();
  }

  const {
    error,
  } = await supabase
    .from(
      "integration_provider_subscriptions",
    )
    .update(
      update,
    )
    .eq(
      "id",
      subscription.id,
    )
    .eq(
      "state",
      "active",
    );

  if (error) {
    throw databaseError(
      "J10 could not update provider subscription activity.",
      error,
    );
  }
}