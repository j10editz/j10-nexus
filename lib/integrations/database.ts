import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  IntegrationConnection,
  IntegrationConnectionStatus,
  IntegrationEnvironment,
  IntegrationProviderId,
} from "../../types/integration";

import { canTransitionIntegrationStatus } from "./connection-status";

import {
  getIntegrationProvider,
  isIntegrationProviderId,
} from "./registry";

export const INTEGRATION_DATABASE_SELECT = `
  id,
  user_id,
  provider,
  status,
  environment,
  account_label,
  credential_reference,
  external_account_id,
  external_account_label,
  granted_scopes,
  enabled_capabilities,
  public_configuration,
  connected_at,
  last_health_check_at,
  last_error_code,
  last_error_message,
  created_at,
  updated_at
`;

type PublicConfigurationValue =
  | string
  | number
  | boolean
  | null;

export interface IntegrationDatabaseRow {
  id: string;
  user_id: string;
  provider: string;
  status: string;
  environment: string;
  account_label: string | null;
  credential_reference: string | null;
  external_account_id: string | null;
  external_account_label: string | null;
  granted_scopes: unknown;
  enabled_capabilities: unknown;
  public_configuration: unknown;
  connected_at: string | null;
  last_health_check_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIntegrationConnectionInput {
  providerId: IntegrationProviderId;
  name?: string;
  environment?: IntegrationEnvironment;
  publicConfiguration?: Readonly<
    Record<string, PublicConfigurationValue>
  >;
  enabledCapabilities?: readonly string[];
}

export interface UpdateIntegrationStatusInput {
  status: IntegrationConnectionStatus;
  reason?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface UpdateIntegrationConfigurationInput {
  publicConfiguration: Readonly<
    Record<string, PublicConfigurationValue>
  >;
  enabledCapabilities?: readonly string[];
}

export interface IntegrationStatusHistoryEntry {
  id: string;
  integrationId: string;
  userId: string;
  previousStatus: IntegrationConnectionStatus | null;
  nextStatus: IntegrationConnectionStatus;
  reason: string | null;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export class IntegrationDatabaseError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(
    message: string,
    code = "INTEGRATION_DATABASE_ERROR",
    details?: unknown,
  ) {
    super(message);

    this.name = "IntegrationDatabaseError";
    this.code = code;
    this.details = details;
  }
}

function createDatabaseError(
  message: string,
  error: unknown,
): IntegrationDatabaseError {
  const possibleError = error as {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;

  return new IntegrationDatabaseError(
    message,
    possibleError?.code ?? "INTEGRATION_DATABASE_ERROR",
    possibleError?.details ??
      possibleError?.message ??
      error,
  );
}

function normalizeProviderId(
  provider: string,
): IntegrationProviderId | null {
  switch (provider) {
    case "email":
      return "gmail";

    case "google_calendar":
      return "google-calendar";

    case "whatsapp":
      return "whatsapp-business";

    default:
      return isIntegrationProviderId(provider)
        ? provider
        : null;
  }
}

function getProviderDatabaseAliases(
  providerId: IntegrationProviderId,
): readonly string[] {
  switch (providerId) {
    case "gmail":
      return ["gmail", "email"];

    case "google-calendar":
      return [
        "google-calendar",
        "google_calendar",
      ];

    case "whatsapp-business":
      return [
        "whatsapp-business",
        "whatsapp",
      ];

    default:
      return [providerId];
  }
}

function normalizeConnectionStatus(
  status: string,
): IntegrationConnectionStatus {
  const normalized = status
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  switch (normalized) {
    case "not_configured":
    case "pending":
    case "connected":
    case "degraded":
    case "disconnected":
    case "error":
    case "revoked":
    case "disabled":
      return normalized;

    default:
      return "error";
  }
}

function normalizeEnvironment(
  environment: string,
): IntegrationEnvironment {
  switch (environment) {
    case "sandbox":
    case "production":
      return environment;

    default:
      return "development";
  }
}

function normalizeStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string",
  );
}

function normalizePublicConfiguration(
  value: unknown,
): Readonly<
  Record<string, PublicConfigurationValue>
> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  const configuration: Record<
    string,
    PublicConfigurationValue
  > = {};

  for (
    const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )
  ) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      item === null
    ) {
      configuration[key] = item;
    }
  }

  return configuration;
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

  return value as Readonly<Record<string, unknown>>;
}

export function mapIntegrationDatabaseRow(
  row: IntegrationDatabaseRow,
): IntegrationConnection | null {
  const providerId =
    normalizeProviderId(row.provider);

  if (!providerId) {
    return null;
  }

  const provider =
    getIntegrationProvider(providerId);

  return {
    id: row.id,
    workspaceId: row.user_id,
    providerId,

    name:
      row.account_label?.trim() ||
      provider.name,

    status:
      normalizeConnectionStatus(
        row.status,
      ),

    environment:
      normalizeEnvironment(
        row.environment,
      ),

    credentialReference:
      row.credential_reference,

    externalAccountId:
      row.external_account_id,

    externalAccountLabel:
      row.external_account_label,

    grantedScopes:
      normalizeStringArray(
        row.granted_scopes,
      ),

    enabledCapabilities:
      normalizeStringArray(
        row.enabled_capabilities,
      ),

    publicConfiguration:
      normalizePublicConfiguration(
        row.public_configuration,
      ),

    lastConnectedAt:
      row.connected_at,

    lastHealthCheckAt:
      row.last_health_check_at,

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

function requireMappedConnection(
  row: IntegrationDatabaseRow,
): IntegrationConnection {
  const connection =
    mapIntegrationDatabaseRow(row);

  if (!connection) {
    throw new IntegrationDatabaseError(
      `Unsupported integration provider: ${row.provider}`,
      "UNSUPPORTED_INTEGRATION_PROVIDER",
    );
  }

  return connection;
}

function validateEnabledCapabilities(
  providerId: IntegrationProviderId,
  capabilityIds: readonly string[],
): void {
  const provider =
    getIntegrationProvider(providerId);

  const supportedCapabilities =
    new Set(
      provider.capabilities.map(
        (capability) =>
          capability.id,
      ),
    );

  const unsupportedCapability =
    capabilityIds.find(
      (capabilityId) =>
        !supportedCapabilities.has(
          capabilityId,
        ),
    );

  if (unsupportedCapability) {
    throw new IntegrationDatabaseError(
      `Unsupported capability for ${provider.name}: ${unsupportedCapability}`,
      "UNSUPPORTED_INTEGRATION_CAPABILITY",
    );
  }
}

export async function listIntegrationConnections(
  supabase: SupabaseClient,
  userId: string,
): Promise<IntegrationConnection[]> {
  const { data, error } =
    await supabase
      .from("integrations")
      .select(
        INTEGRATION_DATABASE_SELECT,
      )
      .eq("user_id", userId)
      .order("created_at", {
        ascending: true,
      });

  if (error) {
    throw createDatabaseError(
      "Could not load integration connections.",
      error,
    );
  }

  return (
    (data ?? []) as IntegrationDatabaseRow[]
  )
    .map(
      mapIntegrationDatabaseRow,
    )
    .filter(
      (
        connection,
      ): connection is IntegrationConnection =>
        connection !== null,
    );
}

export async function getIntegrationConnectionById(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<IntegrationConnection | null> {
  const { data, error } =
    await supabase
      .from("integrations")
      .select(
        INTEGRATION_DATABASE_SELECT,
      )
      .eq("id", connectionId)
      .eq("user_id", userId)
      .maybeSingle();

  if (error) {
    throw createDatabaseError(
      "Could not load the integration connection.",
      error,
    );
  }

  if (!data) {
    return null;
  }

  return requireMappedConnection(
    data as IntegrationDatabaseRow,
  );
}

export async function getIntegrationConnectionByProvider(
  supabase: SupabaseClient,
  userId: string,
  providerId: IntegrationProviderId,
): Promise<IntegrationConnection | null> {
  const aliases =
    getProviderDatabaseAliases(
      providerId,
    );

  const { data, error } =
    await supabase
      .from("integrations")
      .select(
        INTEGRATION_DATABASE_SELECT,
      )
      .eq("user_id", userId)
      .in(
        "provider",
        [...aliases],
      )
      .order("created_at", {
        ascending: true,
      });

  if (error) {
    throw createDatabaseError(
      "Could not load the integration connection.",
      error,
    );
  }

  const rows =
    (data ?? []) as IntegrationDatabaseRow[];

  if (rows.length === 0) {
    return null;
  }

  const preferredRow =
    rows.find(
      (row) =>
        row.provider === providerId,
    ) ?? rows[0];

  return requireMappedConnection(
    preferredRow,
  );
}

export async function createIntegrationConnection(
  supabase: SupabaseClient,
  userId: string,
  input: CreateIntegrationConnectionInput,
): Promise<IntegrationConnection> {
  const provider =
    getIntegrationProvider(
      input.providerId,
    );

  const existing =
    await getIntegrationConnectionByProvider(
      supabase,
      userId,
      input.providerId,
    );

  if (existing) {
    throw new IntegrationDatabaseError(
      `${provider.name} is already registered.`,
      "INTEGRATION_ALREADY_EXISTS",
    );
  }

  const enabledCapabilities =
    input.enabledCapabilities ?? [];

  validateEnabledCapabilities(
    input.providerId,
    enabledCapabilities,
  );

  const { data, error } =
    await supabase
      .from("integrations")
      .insert({
        user_id: userId,
        provider:
          input.providerId,
        status: "pending",

        environment:
          input.environment ??
          "development",

        account_label:
          input.name?.trim() ||
          provider.name,

        credential_reference:
          null,

        external_account_id:
          null,

        external_account_label:
          null,

        granted_scopes: [],

        enabled_capabilities: [
          ...enabledCapabilities,
        ],

        public_configuration:
          input.publicConfiguration ??
          {},

        metadata: {},

        connected_at:
          null,

        last_health_check_at:
          null,

        last_error_code:
          null,

        last_error_message:
          null,

        status_reason:
          "Integration registered.",

        status_metadata: {
          source:
            "integration_database",
        },
      })
      .select(
        INTEGRATION_DATABASE_SELECT,
      )
      .single();

  if (
    error ||
    !data
  ) {
    throw createDatabaseError(
      `Could not register ${provider.name}.`,
      error,
    );
  }

  return requireMappedConnection(
    data as IntegrationDatabaseRow,
  );
}

export async function updateIntegrationConnectionStatus(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  input: UpdateIntegrationStatusInput,
): Promise<IntegrationConnection> {
  const currentConnection =
    await getIntegrationConnectionById(
      supabase,
      userId,
      connectionId,
    );

  if (!currentConnection) {
    throw new IntegrationDatabaseError(
      "Integration connection was not found.",
      "INTEGRATION_NOT_FOUND",
    );
  }

  if (
    !canTransitionIntegrationStatus(
      currentConnection.status,
      input.status,
    )
  ) {
    throw new IntegrationDatabaseError(
      `Invalid integration status transition: ${currentConnection.status} -> ${input.status}`,
      "INVALID_INTEGRATION_STATUS_TRANSITION",
    );
  }

  const now =
    new Date().toISOString();

  const updatePayload:
    Record<string, unknown> = {
      status:
        input.status,

      status_reason:
        input.reason ??
        null,

      status_metadata:
        input.metadata ??
        {},

      last_error_code:
        input.errorCode ??
        null,

      last_error_message:
        input.errorMessage ??
        null,
    };

  if (
    input.status ===
    "connected"
  ) {
    updatePayload.connected_at =
      now;

    updatePayload.last_error_code =
      null;

    updatePayload.last_error_message =
      null;
  }

  if (
    input.status ===
    "revoked"
  ) {
    updatePayload.revoked_at =
      now;
  }

  if (
    input.status ===
    "disabled"
  ) {
    updatePayload.disabled_at =
      now;
  }

  if (
    input.status ===
    "pending"
  ) {
    updatePayload.revoked_at =
      null;

    updatePayload.disabled_at =
      null;

    updatePayload.last_error_code =
      null;

    updatePayload.last_error_message =
      null;
  }

  const { data, error } =
    await supabase
      .from("integrations")
      .update(
        updatePayload,
      )
      .eq("id", connectionId)
      .eq("user_id", userId)
      .select(
        INTEGRATION_DATABASE_SELECT,
      )
      .single();

  if (
    error ||
    !data
  ) {
    throw createDatabaseError(
      "Could not update integration status.",
      error,
    );
  }

  return requireMappedConnection(
    data as IntegrationDatabaseRow,
  );
}

export async function updateIntegrationConnectionConfiguration(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  input: UpdateIntegrationConfigurationInput,
): Promise<IntegrationConnection> {
  const currentConnection =
    await getIntegrationConnectionById(
      supabase,
      userId,
      connectionId,
    );

  if (!currentConnection) {
    throw new IntegrationDatabaseError(
      "Integration connection was not found.",
      "INTEGRATION_NOT_FOUND",
    );
  }

  const enabledCapabilities =
    input.enabledCapabilities ??
    currentConnection.enabledCapabilities;

  validateEnabledCapabilities(
    currentConnection.providerId,
    enabledCapabilities,
  );

  const { data, error } =
    await supabase
      .from("integrations")
      .update({
        public_configuration: {
          ...input.publicConfiguration,
        },
        enabled_capabilities: [
          ...enabledCapabilities,
        ],
        last_health_check_at: null,
      })
      .eq("id", connectionId)
      .eq("user_id", userId)
      .select(
        INTEGRATION_DATABASE_SELECT,
      )
      .single();

  if (error || !data) {
    throw createDatabaseError(
      "Could not update integration configuration.",
      error,
    );
  }

  return requireMappedConnection(
    data as IntegrationDatabaseRow,
  );
}

export async function deleteIntegrationConnection(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<void> {
  const { error } =
    await supabase
      .from("integrations")
      .delete()
      .eq("id", connectionId)
      .eq("user_id", userId);

  if (error) {
    throw createDatabaseError(
      "Could not delete the integration connection.",
      error,
    );
  }
}

export async function listIntegrationStatusHistory(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<IntegrationStatusHistoryEntry[]> {
  const { data, error } =
    await supabase
      .from(
        "integration_status_history",
      )
      .select(`
        id,
        integration_id,
        user_id,
        previous_status,
        next_status,
        reason,
        metadata,
        created_at
      `)
      .eq(
        "integration_id",
        connectionId,
      )
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw createDatabaseError(
      "Could not load integration status history.",
      error,
    );
  }

  return (
    (data ?? []) as Array<{
      id: string;
      integration_id: string;
      user_id: string;
      previous_status: string | null;
      next_status: string;
      reason: string | null;
      metadata: unknown;
      created_at: string;
    }>
  ).map(
    (row) => ({
      id:
        row.id,

      integrationId:
        row.integration_id,

      userId:
        row.user_id,

      previousStatus:
        row.previous_status
          ? normalizeConnectionStatus(
              row.previous_status,
            )
          : null,

      nextStatus:
        normalizeConnectionStatus(
          row.next_status,
        ),

      reason:
        row.reason,

      metadata:
        normalizeMetadata(
          row.metadata,
        ),

      createdAt:
        row.created_at,
    }),
  );
}
