import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  IntegrationConnection,
} from "../../types/integration";

import {
  getIntegrationConnectionById,
  IntegrationDatabaseError,
} from "./database";

export async function recordIntegrationHealthCheck(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  checkedAt = new Date().toISOString(),
): Promise<IntegrationConnection> {
  const {
    error,
  } = await supabase
    .from("integrations")
    .update({
      last_health_check_at: checkedAt,
    })
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) {
    throw new IntegrationDatabaseError(
      "Could not record the integration health check.",
      error.code ?? "INTEGRATION_HEALTH_CHECK_WRITE_ERROR",
      error.details ?? error.message,
    );
  }

  const connection = await getIntegrationConnectionById(
    supabase,
    userId,
    connectionId,
  );

  if (!connection) {
    throw new IntegrationDatabaseError(
      "Integration connection was not found.",
      "INTEGRATION_NOT_FOUND",
    );
  }

  return connection;
}