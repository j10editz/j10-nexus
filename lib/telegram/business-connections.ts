import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TelegramBusinessConnectionRecord {
  id: string;
  workspace_id: string;
  business_connection_id: string;
  telegram_user_id: string;
  telegram_username?: string | null;
  user_chat_id: string;
  can_reply: boolean;
  is_enabled: boolean;
  rights: Record<string, any>;
  status: "active" | "degraded" | "disabled" | "disconnected";
  consent_version: string;
  last_verified_at: string;
  last_event_at?: string | null;
  disconnected_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertBusinessConnectionParams {
  workspaceId: string;
  businessConnectionId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  userChatId: string;
  canReply: boolean;
  isEnabled: boolean;
  rights?: Record<string, any>;
  consentVersion?: string;
}

/**
 * Upserts a Telegram Business Connection upon receiving a `business_connection` webhook event.
 * Treats the newest BusinessConnection update as authoritative.
 */
export async function upsertTelegramBusinessConnection(
  supabase: SupabaseClient,
  params: UpsertBusinessConnectionParams
): Promise<TelegramBusinessConnectionRecord> {
  const {
    workspaceId,
    businessConnectionId,
    telegramUserId,
    telegramUsername = null,
    userChatId,
    canReply,
    isEnabled,
    rights = {},
    consentVersion = "2026.1",
  } = params;

  const status = !isEnabled ? "disabled" : !canReply ? "degraded" : "active";
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("telegram_business_connections")
    .upsert(
      {
        workspace_id: workspaceId,
        business_connection_id: businessConnectionId,
        telegram_user_id: String(telegramUserId),
        telegram_username: telegramUsername,
        user_chat_id: String(userChatId),
        can_reply: canReply,
        is_enabled: isEnabled,
        rights,
        status,
        consent_version: consentVersion,
        last_verified_at: now,
        last_event_at: now,
        disconnected_at: !isEnabled ? now : null,
        updated_at: now,
      },
      {
        onConflict: "business_connection_id",
      }
    )
    .select("*")
    .single();

  if (error || !data) {
    console.error("[Telegram Business] Failed to upsert connection:", error);
    throw new Error(`Failed to upsert business connection: ${error?.message || "Unknown error"}`);
  }

  return data as TelegramBusinessConnectionRecord;
}

/**
 * Resolves a Telegram Business Connection by its unique `business_connection_id`.
 */
export async function getTelegramBusinessConnectionById(
  supabase: SupabaseClient,
  businessConnectionId: string
): Promise<TelegramBusinessConnectionRecord | null> {
  const { data, error } = await supabase
    .from("telegram_business_connections")
    .select("*")
    .eq("business_connection_id", businessConnectionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as TelegramBusinessConnectionRecord;
}

/**
 * Resolves the active business connection for a given workspace.
 */
export async function getActiveBusinessConnectionForWorkspace(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<TelegramBusinessConnectionRecord | null> {
  const { data, error } = await supabase
    .from("telegram_business_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "disconnected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as TelegramBusinessConnectionRecord;
}

/**
 * Verifies if an outbound automation or reply is permitted for this business connection.
 * Enforces `can_reply` and `is_enabled`.
 * Immediately halts outbound automation if rights were revoked or connection disabled.
 */
export async function verifyBusinessConnectionCanReply(
  supabase: SupabaseClient,
  businessConnectionId: string
): Promise<{ allowed: boolean; reason?: string; connection?: TelegramBusinessConnectionRecord }> {
  const conn = await getTelegramBusinessConnectionById(supabase, businessConnectionId);
  if (!conn) {
    return { allowed: false, reason: "Business connection record not found." };
  }

  if (!conn.is_enabled || conn.status === "disabled" || conn.status === "disconnected") {
    return { allowed: false, reason: "Business connection is disabled or disconnected.", connection: conn };
  }

  if (!conn.can_reply) {
    return {
      allowed: false,
      reason: "Telegram has not granted reply permissions (can_reply = false).",
      connection: conn,
    };
  }

  return { allowed: true, connection: conn };
}

/**
 * Updates connection state upon disconnection or revocation.
 */
export async function markBusinessConnectionDisconnected(
  supabase: SupabaseClient,
  businessConnectionId: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("telegram_business_connections")
    .update({
      is_enabled: false,
      can_reply: false,
      status: "disconnected",
      disconnected_at: now,
      updated_at: now,
    })
    .eq("business_connection_id", businessConnectionId);
}
