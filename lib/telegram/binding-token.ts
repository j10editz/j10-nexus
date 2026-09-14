import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes
const TELEGRAM_START_PARAM_MAX_LENGTH = 64;

/**
 * Returns a dedicated cryptographic signing key.
 * Mandatory Correction 2: NEVER uses J10_INTEGRATION_ENCRYPTION_KEY directly for HMAC.
 * Uses J10_TELEGRAM_BINDING_SIGNING_KEY, or derives a domain-separated subkey via HKDF.
 */
export function getBindingSigningKey(): Buffer {
  const dedicatedKey = process.env.J10_TELEGRAM_BINDING_SIGNING_KEY?.trim();
  if (dedicatedKey) {
    return crypto.createHash("sha256").update(dedicatedKey).digest();
  }

  // Domain-separated HKDF derivation
  const masterKey = process.env.J10_INTEGRATION_ENCRYPTION_KEY?.trim() || "j10-default-master-key";
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(masterKey, "utf-8"),
      Buffer.from("j10-telegram-binding-salt", "utf-8"),
      Buffer.from("j10-telegram-binding-signing-v1", "utf-8"),
      32
    )
  );
}

export interface CreateBindingTokenParams {
  workspaceId: string;
  purpose?: string;
  createdByUserId?: string | null;
  ttlSeconds?: number;
}

export interface CreateBindingTokenResult {
  token: string;
  tokenHash: string;
  expiresAt: string;
  shareLink?: string;
}

/**
 * Generates an opaque, cryptographically random start parameter token (<= 64 chars).
 * Requirement 1 & 7: Does NOT embed workspaceId in token.
 * Stores ONLY the SHA-256 hash in telegram_binding_tokens via narrow server-side RPC.
 */
export async function createTelegramBindingToken(
  supabase: SupabaseClient,
  params: CreateBindingTokenParams
): Promise<CreateBindingTokenResult> {
  const { workspaceId, purpose = "lead_intake", createdByUserId = null, ttlSeconds = DEFAULT_TTL_SECONDS } = params;

  // Generate 32 bytes of secure random bytes -> base64url is 43 characters.
  // Prefix "b_" -> total length is exactly 45 characters (Strictly <= 64 characters).
  const randomPart = crypto.randomBytes(32).toString("base64url");
  const token = `b_${randomPart}`;

  if (token.length > TELEGRAM_START_PARAM_MAX_LENGTH) {
    throw new Error(`Generated token exceeds Telegram 64-char limit: ${token.length}`);
  }

  // Compute SHA-256 hash of the token for storage
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // Invoke narrow server-side RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc("create_telegram_binding_token", {
    p_workspace_id: workspaceId,
    p_token_hash: tokenHash,
    p_purpose: purpose,
    p_created_by_user_id: createdByUserId,
    p_ttl_seconds: ttlSeconds,
  });

  if (rpcError) {
    // Fallback to direct service-role insert if RPC is not yet registered in environment
    const { error: insertError } = await supabase
      .from("telegram_binding_tokens")
      .insert({
        workspace_id: workspaceId,
        token_hash: tokenHash,
        purpose,
        created_by_user_id: createdByUserId,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Failed to store telegram_binding_token:", insertError);
      throw new Error(`Database error saving binding token: ${insertError.message}`);
    }
  }

  return {
    token,
    tokenHash,
    expiresAt,
  };
}

export interface VerifyBindingResult {
  valid: boolean;
  workspaceId?: string;
  purpose?: string;
  createdByUserId?: string | null;
  error?: string;
}

/**
 * Atomically verifies and single-use consumes a Telegram binding token.
 * Requirement 1 & 7: Rejects used tokens, expired tokens, and tampered tokens.
 * Single-use atomic guarantee enforced via narrow server-side RPC consume_telegram_binding_token.
 */
export async function consumeTelegramBindingToken(
  supabase: SupabaseClient,
  rawToken: string
): Promise<VerifyBindingResult> {
  if (!rawToken || !rawToken.startsWith("b_") || rawToken.length > TELEGRAM_START_PARAM_MAX_LENGTH) {
    return { valid: false, error: "Invalid binding token format or length." };
  }

  // Disallow non-base64url characters in payload
  const body = rawToken.slice(2);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) {
    return { valid: false, error: "Invalid characters in binding token." };
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  // Invoke narrow server-side RPC consume_telegram_binding_token
  const { data: rpcData, error: rpcError } = await supabase.rpc("consume_telegram_binding_token", {
    p_token_hash: tokenHash,
  });

  if (!rpcError && rpcData) {
    if (rpcData.valid) {
      return {
        valid: true,
        workspaceId: rpcData.workspace_id,
        purpose: rpcData.purpose,
        createdByUserId: rpcData.created_by_user_id,
      };
    }
    return {
      valid: false,
      error: rpcData.error || "Token invalid, expired, or already used.",
    };
  }

  // Fallback to atomic direct update if RPC is missing
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("telegram_binding_tokens")
    .update({ used_at: now })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("workspace_id, purpose, created_by_user_id")
    .maybeSingle();

  if (error || !data) {
    return {
      valid: false,
      error: "Binding token is invalid, expired, or has already been used.",
    };
  }

  return {
    valid: true,
    workspaceId: data.workspace_id,
    purpose: data.purpose,
    createdByUserId: data.created_by_user_id,
  };
}

/**
 * Synchronous hash generator for tests and validation.
 */
export function hashBindingToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
