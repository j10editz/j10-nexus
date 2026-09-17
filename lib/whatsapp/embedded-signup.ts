import "server-only";

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeIntegrationCredentials } from "@/lib/integrations/credentials";
import {
  createOrEnableIntegrationWebhookEndpoint,
  disableIntegrationWebhookEndpoint,
  getIntegrationWebhookEndpointByConnection,
} from "@/lib/integrations/webhooks/database";
import type { IntegrationConnection } from "@/types/integration";

export const DEFAULT_SESSION_TTL_SECONDS = 15 * 60; // 15 minutes
export const META_WHATSAPP_GRAPH_API_VERSION =
  process.env.META_WHATSAPP_GRAPH_API_VERSION?.trim() || "v21.0";
export const GRAPH_API_VERSION = META_WHATSAPP_GRAPH_API_VERSION;

export interface CreateWhatsAppSessionParams {
  workspaceId: string;
  userId: string;
  ttlSeconds?: number;
}

export interface WhatsAppSessionResult {
  sessionId: string;
  token: string;
  tokenHash: string;
  expiresAt: string;
}

/**
 * Generates a cryptographically random, single-use state token for CSRF protection.
 * Token is prefixed with 'was_' and hashed with SHA-256 before persistence.
 *
 * FAILS CLOSED: Throws immediately if insertion fails.
 * Never issues a state token that was not persisted.
 */
export async function createWhatsAppConnectionSession(
  supabase: SupabaseClient,
  params: CreateWhatsAppSessionParams
): Promise<WhatsAppSessionResult> {
  const { workspaceId, userId, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS } = params;

  if (!workspaceId) {
    throw new Error("workspaceId is required to create a WhatsApp connection session.");
  }
  if (!userId) {
    throw new Error("userId is required to create a WhatsApp connection session.");
  }

  const randomPart = crypto.randomBytes(32).toString("base64url");
  const token = `was_${randomPart}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { data, error } = await supabase
    .from("whatsapp_connection_sessions")
    .insert({
      workspace_id: workspaceId,
      created_by_user_id: userId,
      state_token_hash: tokenHash,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[WhatsApp Session] Failed to persist session state token:", error?.message || "No data returned");
    throw new Error("Failed to persist WhatsApp connection session.");
  }

  return {
    sessionId: data.id,
    token,
    tokenHash,
    expiresAt,
  };
}

/**
 * Validates and atomically consumes the state session token via the privileged RPC.
 * Bound to both the workspace and the initiating user.
 *
 * FAILS CLOSED: RPC error, missing RPC, empty response, missing row, malformed response,
 * expired token, replayed token, workspace mismatch, or user mismatch must all reject.
 */
export async function validateAndConsumeWhatsAppSession(
  supabase: SupabaseClient,
  token: string,
  workspaceId: string,
  userId: string
): Promise<{ valid: boolean; sessionId?: string; error?: string }> {
  if (!token || typeof token !== "string" || !token.startsWith("was_")) {
    return { valid: false, error: "Invalid OAuth state token format." };
  }
  if (!workspaceId) {
    return { valid: false, error: "Workspace ID is required for session validation." };
  }
  if (!userId) {
    return { valid: false, error: "Initiating user ID is required for session validation." };
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const { data, error } = await supabase.rpc("consume_whatsapp_connection_session", {
      p_token_hash: tokenHash,
      p_workspace_id: workspaceId,
      p_user_id: userId,
    });

    if (error) {
      console.error("[WhatsApp Session RPC] RPC invocation failed:", error.message);
      return { valid: false, error: "Session validation failed." };
    }

    if (!Array.isArray(data) || data.length === 0) {
      return { valid: false, error: "Session token not found or invalid." };
    }

    const row = data[0];
    if (!row || typeof row !== "object") {
      return { valid: false, error: "Malformed session validation response." };
    }

    if (row.valid === true && row.session_id) {
      return { valid: true, sessionId: row.session_id };
    }

    return {
      valid: false,
      error: row.error_message || "Invalid or expired session token.",
    };
  } catch (err: any) {
    console.error("[WhatsApp Session] Session validation exception:", err?.message || err);
    return { valid: false, error: "Session validation failed." };
  }
}

/**
 * Masks phone numbers to protect privacy in UI displays.
 * e.g., +15556771423 -> +1 ••• ••• 1423
 */
export function maskPhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return "Not configured";
  const cleaned = rawPhone.replace(/[^\d+]/g, "");
  if (cleaned.length < 7) return cleaned;

  const last4 = cleaned.slice(-4);
  const prefix = cleaned.startsWith("+") ? cleaned.slice(0, 2) : "+1";
  return `${prefix} ••• ••• ${last4}`;
}

/**
 * Exchanges the short-lived authorization code server-side with Meta Graph API.
 * Uses META_APP_SECRET securely on the server.
 */
export async function exchangeMetaCodeForAccessToken(
  codeOrParams: string | { code: string; appId?: string; appSecret?: string },
  appId?: string,
  appSecret?: string
): Promise<{ accessToken: string; tokenType?: string }> {
  let cleanCode: string;
  let cleanAppId: string | undefined;
  let cleanAppSecret: string | undefined;

  if (typeof codeOrParams === "object" && codeOrParams !== null) {
    cleanCode = codeOrParams.code?.trim();
    cleanAppId = codeOrParams.appId?.trim();
    cleanAppSecret = codeOrParams.appSecret?.trim();
  } else {
    cleanCode = (codeOrParams || "")?.trim();
    cleanAppId = appId?.trim();
    cleanAppSecret = appSecret?.trim();
  }

  if (!cleanCode || !/^[A-Za-z0-9_.#=-]{10,4096}$/.test(cleanCode)) {
    throw new Error("Authorization code is missing or malformed.");
  }

  const resolvedAppId =
    cleanAppId ||
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() ||
    process.env.META_WHATSAPP_APP_ID?.trim() ||
    process.env.META_APP_ID?.trim();

  const resolvedAppSecret =
    cleanAppSecret ||
    process.env.META_WHATSAPP_APP_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim();

  if (!resolvedAppId || !resolvedAppSecret) {
    throw new Error("Meta App ID or App Secret is not configured.");
  }

  const tokenUrl = new URL(`https://graph.facebook.com/${META_WHATSAPP_GRAPH_API_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", resolvedAppId);
  tokenUrl.searchParams.set("client_secret", resolvedAppSecret);
  tokenUrl.searchParams.set("code", cleanCode);

  const res = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const errorMsg = body?.error?.message || "Failed to exchange Meta authorization code.";
    console.error("[Meta OAuth Token Exchange] Error:", errorMsg);
    throw new Error(`Meta code exchange failed: ${errorMsg}`);
  }

  return {
    accessToken: String(body.access_token).trim(),
    tokenType: body.token_type ? String(body.token_type) : "bearer",
  };
}

export interface VerifiedWhatsAppAccountDetails {
  wabaId: string;
  wabaName: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  codeVerificationStatus: string;
  qualityRating: string;
}

/**
 * Resolves and verifies the WABA ID and phone_number_id via Meta Graph API.
 * Ensures the phone number actually belongs to the authorized WABA.
 */
export async function verifyWabaAndPhoneNumber(
  tokenOrParams: string | { accessToken: string; wabaId: string; phoneNumberId: string },
  wabaIdArg?: string,
  phoneNumberIdArg?: string
): Promise<VerifiedWhatsAppAccountDetails> {
  let cleanToken: string;
  let cleanWabaId: string;
  let cleanPhoneId: string;

  if (typeof tokenOrParams === "object" && tokenOrParams !== null) {
    cleanToken = tokenOrParams.accessToken?.trim();
    cleanWabaId = tokenOrParams.wabaId?.trim();
    cleanPhoneId = tokenOrParams.phoneNumberId?.trim();
  } else {
    cleanToken = (tokenOrParams || "")?.trim();
    cleanWabaId = (wabaIdArg || "")?.trim();
    cleanPhoneId = (phoneNumberIdArg || "")?.trim();
  }

  if (!cleanWabaId || !/^[A-Za-z0-9_-]{3,50}$/.test(cleanWabaId)) {
    throw new Error("WhatsApp Business Account ID is invalid.");
  }
  if (!cleanPhoneId || !/^[A-Za-z0-9_-]{3,50}$/.test(cleanPhoneId)) {
    throw new Error("WhatsApp Phone Number ID is invalid.");
  }

  // 1. Fetch WABA details
  const wabaUrl = `https://graph.facebook.com/${META_WHATSAPP_GRAPH_API_VERSION}/${cleanWabaId}?fields=id,name,currency,timezone_id`;
  const wabaRes = await fetch(wabaUrl, {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const wabaData = await wabaRes.json().catch(() => null);

  if (!wabaRes.ok || !wabaData?.id) {
    throw new Error(`Could not verify WhatsApp Business Account: ${wabaData?.error?.message || "Not found"}`);
  }

  // 2. Fetch phone numbers belonging to this WABA
  const phonesUrl = `https://graph.facebook.com/${META_WHATSAPP_GRAPH_API_VERSION}/${cleanWabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`;
  const phonesRes = await fetch(phonesUrl, {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const phonesData = await phonesRes.json().catch(() => null);

  if (!phonesRes.ok || !Array.isArray(phonesData?.data)) {
    throw new Error("Failed to retrieve phone numbers for WhatsApp Business Account.");
  }

  const matchingPhone = phonesData.data.find((p: any) => p && String(p.id).trim() === cleanPhoneId);

  if (!matchingPhone) {
    throw new Error("The submitted phone number does not belong to the authorized WhatsApp Business Account.");
  }

  return {
    wabaId: cleanWabaId,
    wabaName: wabaData.name || "WhatsApp Business Account",
    phoneNumberId: cleanPhoneId,
    displayPhoneNumber: matchingPhone.display_phone_number || cleanPhoneId,
    verifiedName: matchingPhone.verified_name || wabaData.name || "Verified Business",
    codeVerificationStatus: matchingPhone.code_verification_status || "VERIFIED",
    qualityRating: matchingPhone.quality_rating || "GREEN",
  };
}

/**
 * Subscribes the WhatsApp Business Account to the J10 NEXUS application webhooks.
 */
export async function subscribeWabaToWebhook(
  accessToken: string,
  wabaId: string
): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/${META_WHATSAPP_GRAPH_API_VERSION}/${wabaId}/subscribed_apps`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    return res.ok && data?.success === true;
  } catch {
    return false;
  }
}

/**
 * Checks for cross-workspace ownership conflicts using an authorized admin client.
 * Rejects connection if another workspace already actively owns the phone number or WABA.
 */
export async function assertNoCrossWorkspaceConflict(
  supabase: SupabaseClient,
  workspaceId: string,
  phoneNumberId: string,
  wabaId: string
): Promise<void> {
  const { data: conflicts, error } = await supabase
    .from("integrations")
    .select("id, workspace_id, status, public_configuration, external_account_id")
    .eq("provider", "whatsapp-business")
    .eq("status", "connected")
    .neq("workspace_id", workspaceId);

  if (error) {
    console.error("[Cross-Workspace Conflict] Query error:", error.message);
    throw new Error("Could not verify integration availability across workspaces.");
  }

  if (conflicts && conflicts.length > 0) {
    for (const c of conflicts) {
      const cfg = (c.public_configuration || {}) as Record<string, any>;
      const existingPhoneId = cfg.phone_number_id || c.external_account_id;
      const existingWabaId = cfg.business_account_id || cfg.waba_id;

      if (existingPhoneId === phoneNumberId) {
        throw new Error("Cross-workspace conflict: this WhatsApp phone number is already actively connected to another workspace.");
      }
      if (existingWabaId === wabaId) {
        throw new Error("Cross-workspace conflict: this WhatsApp Business Account is already actively connected to another workspace.");
      }
    }
  }
}

export interface UpsertWhatsAppIntegrationParams {
  workspaceId: string;
  userId: string;
  verifiedDetails?: VerifiedWhatsAppAccountDetails;
  wabaId?: string;
  wabaName?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  codeVerificationStatus?: string;
  accessToken: string;
  appSecret: string;
  webhookSubscribed?: boolean;
}

/**
 * Creates or updates exactly one active WhatsApp integration per workspace.
 * Stores access token securely in the encrypted vault.
 * Configures the canonical webhook endpoint (/api/webhooks/whatsapp/[endpointKey]).
 *
 * Checks every database operation and throws if any mutation fails.
 * If webhookSubscribed is false, sets status to 'action_required' (never 'connected').
 */
export async function upsertWhatsAppIntegration(
  supabase: SupabaseClient,
  params: UpsertWhatsAppIntegrationParams
): Promise<{
  integrationId: string;
  endpointKey: string;
  webhookUrl: string;
  maskedPhone: string;
  isReconnect: boolean;
  status: "connected" | "action_required";
}> {
  const { workspaceId, userId, accessToken, appSecret, webhookSubscribed = false } = params;

  if (!workspaceId) throw new Error("workspaceId is required for upserting WhatsApp integration.");
  if (!userId) throw new Error("userId is required for upserting WhatsApp integration.");

  const verifiedDetails: VerifiedWhatsAppAccountDetails = params.verifiedDetails || {
    wabaId: params.wabaId || "",
    wabaName: params.wabaName || "WhatsApp Business Account",
    phoneNumberId: params.phoneNumberId || "",
    displayPhoneNumber: params.displayPhoneNumber || "",
    verifiedName: params.verifiedName || "Verified Business",
    qualityRating: params.qualityRating || "GREEN",
    codeVerificationStatus: params.codeVerificationStatus || "VERIFIED",
  };

  // 1. Check existing integration for this workspace
  const { data: existing, error: selectErr } = await supabase
    .from("integrations")
    .select("id, status, public_configuration, created_at")
    .eq("workspace_id", workspaceId)
    .eq("provider", "whatsapp-business")
    .maybeSingle();

  if (selectErr) {
    console.error("[Upsert WhatsApp] Query existing integration failed:", selectErr.message);
    throw new Error("Failed to check existing WhatsApp integration.");
  }

  const isReconnect = Boolean(existing);
  const nowIso = new Date().toISOString();

  // Webhook subscription check: Active requires verified WABA, verified phone, stored credentials,
  // canonical webhook endpoint enabled, and Meta WABA webhook subscription confirmed.
  // If webhook subscription failed, status must be degraded/action_required.
  const targetDbStatus: "connected" | "degraded" = webhookSubscribed ? "connected" : "degraded";
  const targetReturnStatus: "connected" | "action_required" = webhookSubscribed ? "connected" : "action_required";

  const publicConfig = {
    ...((existing?.public_configuration as Record<string, any>) || {}),
    business_account_id: verifiedDetails.wabaId,
    waba_id: verifiedDetails.wabaId,
    waba_name: verifiedDetails.wabaName,
    phone_number_id: verifiedDetails.phoneNumberId,
    display_phone_number: verifiedDetails.displayPhoneNumber,
    verified_name: verifiedDetails.verifiedName,
    code_verification_status: verifiedDetails.codeVerificationStatus,
    quality_rating: verifiedDetails.qualityRating,
    webhook_subscribed: webhookSubscribed,
    ai_receptionist_enabled: true,
    graph_api_version: META_WHATSAPP_GRAPH_API_VERSION,
    onboarding_method: "meta_embedded_signup",
    last_connected_at: nowIso,
  };

  let integrationId: string;

  if (existing) {
    integrationId = existing.id;
    const { error: updateErr } = await supabase
      .from("integrations")
      .update({
        status: targetDbStatus,
        account_label: verifiedDetails.wabaName,
        external_account_id: verifiedDetails.phoneNumberId,
        external_account_label: verifiedDetails.displayPhoneNumber,
        public_configuration: publicConfig,
        last_error_code: webhookSubscribed ? null : "WEBHOOK_SUBSCRIPTION_FAILED",
        last_error_message: webhookSubscribed ? null : "Meta webhook subscription could not be confirmed.",
        connected_at: webhookSubscribed ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("id", integrationId)
      .eq("workspace_id", workspaceId);

    if (updateErr) {
      console.error("[Upsert WhatsApp] Update failed:", updateErr.message);
      throw new Error("Failed to update WhatsApp integration in database.");
    }
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("integrations")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        provider: "whatsapp-business",
        status: targetDbStatus,
        environment: "production",
        account_label: verifiedDetails.wabaName,
        external_account_id: verifiedDetails.phoneNumberId,
        external_account_label: verifiedDetails.displayPhoneNumber,
        public_configuration: publicConfig,
        connected_at: webhookSubscribed ? nowIso : null,
        last_error_code: webhookSubscribed ? null : "WEBHOOK_SUBSCRIPTION_FAILED",
        last_error_message: webhookSubscribed ? null : "Meta webhook subscription could not be confirmed.",
      })
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      console.error("[Upsert WhatsApp] Insert failed:", insertErr?.message);
      throw new Error("Failed to create WhatsApp integration in database.");
    }
    integrationId = inserted.id;
  }

  // 2. Persist encrypted credentials in vault
  const verifyToken =
    process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() ||
    `wa_vt_${crypto.randomBytes(16).toString("hex")}`;

  try {
    await storeIntegrationCredentials(
      supabase,
      { workspaceId, actorUserId: userId },
      {
        connectionId: integrationId,
        values: {
          access_token: accessToken,
          app_secret: appSecret,
          webhook_verify_token: verifyToken,
        },
      }
    );
  } catch (credErr: any) {
    console.error("[Upsert WhatsApp] Credential storage failed:", credErr?.message);
    // Compensation: revert status to error / degraded if credential storage fails
    await supabase
      .from("integrations")
      .update({
        status: "error",
        last_error_code: "CREDENTIAL_STORAGE_FAILED",
        last_error_message: "Failed to store encrypted credentials.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId)
      .eq("workspace_id", workspaceId);
    throw new Error("Failed to store encrypted credentials securely.");
  }

  // 3. Create or enable canonical webhook endpoint
  const connectionObj: IntegrationConnection = {
    id: integrationId,
    workspaceId,
    userId,
    providerId: "whatsapp-business",
    status: targetDbStatus,
    environment: "production",
    name: verifiedDetails.wabaName,
    publicConfiguration: publicConfig,
    enabledCapabilities: [
      "whatsapp.message.received",
      "whatsapp.message.status_updated",
      "whatsapp.message.send",
    ],
    grantedScopes: [],
    credentialReference: null,
    externalAccountId: verifiedDetails.phoneNumberId,
    externalAccountLabel: verifiedDetails.displayPhoneNumber,
    lastConnectedAt: webhookSubscribed ? nowIso : null,
    lastHealthCheckAt: nowIso,
    lastErrorCode: webhookSubscribed ? null : "WEBHOOK_SUBSCRIPTION_FAILED",
    lastErrorMessage: webhookSubscribed ? null : "Meta webhook subscription could not be confirmed.",
    createdAt: existing?.created_at || nowIso,
    updatedAt: nowIso,
  };

  let endpoint;
  try {
    endpoint = await createOrEnableIntegrationWebhookEndpoint(
      supabase,
      connectionObj,
      262144
    );
    if (!endpoint?.endpointKey) {
      throw new Error("Endpoint creation returned no key.");
    }
  } catch (endpointErr: any) {
    console.error("[Upsert WhatsApp] Webhook endpoint creation failed:", endpointErr?.message);
    throw new Error("Failed to configure integration webhook endpoint.");
  }

  return {
    integrationId,
    endpointKey: endpoint.endpointKey,
    webhookUrl: `/api/webhooks/whatsapp/${endpoint.endpointKey}`,
    maskedPhone: maskPhoneNumber(verifiedDetails.displayPhoneNumber),
    isReconnect,
    status: targetReturnStatus,
  };
}

/**
 * Disconnects the WhatsApp integration for a workspace.
 * Disables the webhook and sets status to 'disconnected' without deleting historical data.
 */
export async function disconnectWhatsAppIntegration(
  supabase: SupabaseClient,
  workspaceId: string,
  reason = "User requested disconnect via dashboard"
): Promise<{ success: boolean; status: "disconnected" }> {
  if (!workspaceId) {
    throw new Error("workspaceId is required to disconnect WhatsApp integration.");
  }

  const { data: integration, error: selectErr } = await supabase
    .from("integrations")
    .select("id, public_configuration")
    .eq("workspace_id", workspaceId)
    .eq("provider", "whatsapp-business")
    .maybeSingle();

  if (selectErr) {
    console.error("[Disconnect WhatsApp] Error querying integration:", selectErr.message);
    throw new Error("Failed to verify integration before disconnecting.");
  }

  if (!integration) {
    return { success: true, status: "disconnected" };
  }

  const nowIso = new Date().toISOString();
  const publicConfig = {
    ...((integration.public_configuration as Record<string, any>) || {}),
    disconnected_at: nowIso,
    disconnect_reason: reason,
  };

  // 1. Update status to disconnected
  const { error: updateErr } = await supabase
    .from("integrations")
    .update({
      status: "disconnected",
      public_configuration: publicConfig,
      updated_at: nowIso,
    })
    .eq("id", integration.id)
    .eq("workspace_id", workspaceId);

  if (updateErr) {
    console.error("[Disconnect WhatsApp] Update failed:", updateErr.message);
    throw new Error("Failed to update integration disconnect status.");
  }

  // 2. Disable webhook endpoint
  try {
    await disableIntegrationWebhookEndpoint(supabase, workspaceId, integration.id);
  } catch (err: any) {
    console.error("[Disconnect WhatsApp] Endpoint disable warning:", err?.message);
  }

  return { success: true, status: "disconnected" };
}

/**
 * Returns sanitized WhatsApp connection status for the active workspace.
 * Never leaks access tokens, secrets, or internal keys.
 */
export async function getWhatsAppConnectionStatus(
  supabase: SupabaseClient,
  workspaceId: string
) {
  if (!workspaceId) {
    return {
      connected: false,
      status: "not_connected" as const,
      wabaName: null,
      maskedPhone: null,
      phoneNumberId: null,
      verifiedName: null,
      verificationStatus: null,
      qualityRating: null,
      aiReceptionistEnabled: false,
      webhookSubscribed: false,
      endpointKey: null,
      lastConnectedAt: null,
    };
  }

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("id, status, account_label, external_account_id, external_account_label, public_configuration, connected_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("provider", "whatsapp-business")
    .maybeSingle();

  if (error || !integration) {
    return {
      connected: false,
      status: "not_connected" as const,
      wabaName: null,
      maskedPhone: null,
      phoneNumberId: null,
      verifiedName: null,
      verificationStatus: null,
      qualityRating: null,
      aiReceptionistEnabled: false,
      webhookSubscribed: false,
      endpointKey: null,
      lastConnectedAt: null,
    };
  }

  const cfg = (integration.public_configuration || {}) as Record<string, any>;
  const endpoint = await getIntegrationWebhookEndpointByConnection(supabase, workspaceId, integration.id);

  const statusMap: Record<string, "active" | "connecting" | "action_required" | "disconnected" | "not_connected"> = {
    connected: "active",
    connecting: "connecting",
    action_required: "action_required",
    degraded: "action_required",
    disconnected: "disconnected",
    disabled: "disconnected",
    error: "action_required",
  };

  const isConnected = integration.status === "connected" && Boolean(cfg.webhook_subscribed);

  return {
    id: integration.id,
    connected: isConnected,
    status: isConnected ? "active" : (statusMap[integration.status] || "disconnected"),
    wabaName: cfg.waba_name || integration.account_label || "WhatsApp Business Account",
    maskedPhone: maskPhoneNumber(cfg.display_phone_number || integration.external_account_label),
    phoneNumberId: cfg.phone_number_id || integration.external_account_id,
    verifiedName: cfg.verified_name || "Verified Business",
    verificationStatus: cfg.code_verification_status || "VERIFIED",
    qualityRating: cfg.quality_rating || "GREEN",
    aiReceptionistEnabled: cfg.ai_receptionist_enabled !== false,
    webhookSubscribed: Boolean(cfg.webhook_subscribed),
    endpointKey: endpoint?.endpointKey || null,
    lastConnectedAt: cfg.last_connected_at || integration.connected_at,
  };
}
