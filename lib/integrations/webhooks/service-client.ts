import "server-only";

import {
  createClient,
} from "@supabase/supabase-js";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  IntegrationWebhookError,
} from "./errors";

let cachedWebhookServiceClient: SupabaseClient | null = null;

export function createWebhookServiceClient(): SupabaseClient {
  if (cachedWebhookServiceClient) {
    return cachedWebhookServiceClient;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const serviceKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    throw new IntegrationWebhookError(
      "J10 webhook service credentials are not configured.",
      "WEBHOOK_SERVICE_CREDENTIALS_MISSING",
      503,
      true,
    );
  }

  cachedWebhookServiceClient = createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          "X-Client-Info": "j10-nexus-webhook-foundation",
        },
      },
    },
  );

  return cachedWebhookServiceClient;
}