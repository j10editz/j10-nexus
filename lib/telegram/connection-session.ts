import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_SESSION_TTL_SECONDS = 15 * 60; // 15 minutes
export const CURRENT_CONSENT_VERSION = "2026.1";

export interface CreateConnectionSessionParams {
  workspaceId: string;
  createdByUserId?: string | null;
  connectionMode?: "telegram_business" | "shared_bot" | "custom_bot";
  consentVersion?: string;
  ttlSeconds?: number;
  botUsername?: string;
}

export interface ConnectionSessionResult {
  sessionId: string;
  token: string;
  tokenHash: string;
  expiresAt: string;
  shareLink: string;
  consentVersion: string;
}

/**
 * Creates an opaque, cryptographically random Telegram connection session.
 * Stores only the SHA-256 hash in telegram_connection_sessions.
 * Generates a deep link formatted as: https://t.me/<bot_username>?start=tb_<random>
 * Token length is strictly <= 64 characters (Telegram start-parameter limit).
 */
export async function createTelegramConnectionSession(
  supabase: SupabaseClient,
  params: CreateConnectionSessionParams
): Promise<ConnectionSessionResult> {
  const {
    workspaceId,
    createdByUserId = null,
    connectionMode = "telegram_business",
    consentVersion = CURRENT_CONSENT_VERSION,
    ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
    botUsername = "j10_nexus_leads_bot",
  } = params;

  // 32 random bytes in base64url is 43 characters + 3 chars prefix ("tb_") = 46 chars (well <= 64 limit)
  const randomPart = crypto.randomBytes(32).toString("base64url");
  const token = `tb_${randomPart}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { data, error } = await supabase
    .from("telegram_connection_sessions")
    .insert({
      workspace_id: workspaceId,
      created_by_user_id: createdByUserId,
      token_hash: tokenHash,
      connection_mode: connectionMode,
      consent_version: consentVersion,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[Telegram Session] Failed to create session:", error);
    throw new Error(`Failed to create connection session: ${error?.message || "Unknown error"}`);
  }

  const shareLink = `https://t.me/${botUsername}?start=${token}`;

  return {
    sessionId: data.id,
    token,
    tokenHash,
    expiresAt,
    shareLink,
    consentVersion,
  };
}

/**
 * Validates and atomically consumes a session token via server-side RPC.
 * Binds the authenticated Telegram User ID to the pending session.
 */
export async function consumeTelegramBusinessSession(
  supabase: SupabaseClient,
  token: string,
  telegramUserId: string,
  telegramUsername?: string
): Promise<{
  valid: boolean;
  sessionId?: string;
  workspaceId?: string;
  consentVersion?: string;
  error?: string;
}> {
  if (!token || !token.startsWith("tb_")) {
    return { valid: false, error: "Invalid session token format" };
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const { data, error } = await supabase.rpc("consume_telegram_business_session", {
    p_token_hash: tokenHash,
    p_telegram_user_id: String(telegramUserId),
    p_telegram_username: telegramUsername || null,
  });

  if (error) {
    console.error("[Telegram Session] RPC error consuming session:", error);
    return { valid: false, error: error.message };
  }

  return (data as any) || { valid: false, error: "Unexpected response from session verification" };
}

/**
 * Finds the latest verified session for a Telegram User ID within its expiration window.
 * Used during the `business_connection` webhook event to identify the target workspace.
 */
export async function findVerifiedSessionByTelegramUserId(
  supabase: SupabaseClient,
  telegramUserId: string
): Promise<{
  status: "matched" | "ambiguous" | "not_found";
  sessionId?: string;
  workspaceId?: string;
  consentVersion?: string;
  error?: string;
}> {
  const { data, error } = await supabase
    .from("telegram_connection_sessions")
    .select("id, workspace_id, consent_version")
    .eq("telegram_user_id", String(telegramUserId))
    .eq("status", "verified")
    .gt("expires_at", new Date().toISOString());

  if (error || !data || data.length === 0) {
    return { status: "not_found", error: "No verified unexpired session found" };
  }

  // Detect cross-workspace ambiguity: never select latest automatically!
  const distinctWorkspaces = Array.from(new Set(data.map((s) => s.workspace_id)));
  if (distinctWorkspaces.length > 1) {
    return {
      status: "ambiguous",
      error: "Multiple pending sessions exist across different workspaces. Action required: specify target workspace.",
    };
  }

  const session = data[0];
  return {
    status: "matched",
    sessionId: session.id,
    workspaceId: session.workspace_id,
    consentVersion: session.consent_version,
  };
}

