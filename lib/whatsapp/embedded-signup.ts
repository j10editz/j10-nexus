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
  process.env.META_WHATSAPP_GRAPH_API_VERSION?.trim() || "v26.0";
export const GRAPH_API_VERSION = META_WHATSAPP_GRAPH_API_VERSION;
export const META_WHATSAPP_CALLBACK_URL =
  process.env.META_WHATSAPP_CALLBACK_URL?.trim() ||
  "https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta";

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
    console.error("[WhatsApp Session] persist_failed stage: create_session code:", error?.code || "DB_ERROR");
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
      console.error("[WhatsApp Session RPC] rpc_failed stage: consume_session code:", error.code || "RPC_ERROR");
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
    console.error("[WhatsApp Session] validation_exception stage: validate_session code:", err?.code || "UNEXPECTED_ERROR");
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
    console.error("[Meta OAuth Token Exchange] exchange_failed stage: token_exchange code:", body?.error?.code || "OAUTH_EXCHANGE_ERROR");
    throw new Error("Meta code exchange failed.");
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
    console.error("[Meta WABA Verification] fetch_failed stage: verify_waba code:", wabaData?.error?.code || "WABA_VERIFY_ERROR");
    throw new Error("Could not verify WhatsApp Business Account.");
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
    console.error("[Meta Phone Verification] fetch_failed stage: verify_phones code:", phonesData?.error?.code || "PHONE_VERIFY_ERROR");
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
 * Rejects connection if another workspace already actively/reservedly owns the phone number or WABA.
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
    .in("status", ["pending", "connected", "degraded"])
    .neq("workspace_id", workspaceId);

  if (error) {
    console.error("[Cross-Workspace Conflict] query_failed stage: conflict_check code:", error.code || "DB_ERROR");
    throw new Error("Could not verify integration availability across workspaces.");
  }

  if (conflicts && conflicts.length > 0) {
    for (const c of conflicts) {
      const cfg = (c.public_configuration || {}) as Record<string, any>;
      const existingPhoneId = c.external_account_id || cfg.phone_number_id;
      const existingWabaId = cfg.waba_id || cfg.business_account_id;

      if (existingPhoneId && existingPhoneId === phoneNumberId) {
        throw new Error("Cross-workspace conflict: this WhatsApp phone number is already registered to another workspace.");
      }
      if (existingWabaId && existingWabaId === wabaId) {
        throw new Error("Cross-workspace conflict: this WhatsApp Business Account is already registered to another workspace.");
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
 * Creates or updates exactly one active WhatsApp integration per workspace using a safe Two-Phase Activation.
 *
 * Phase A: Insert/update the integration in a non-active state: status = "pending" or "degraded", webhook_subscribed = false, connected_at = null
 * Phase B: Successfully store encrypted credentials.
 * Phase C: Successfully create/enable the canonical webhook endpoint.
 * Phase D: Confirm Meta subscribed_apps succeeded.
 * Phase E: Only after B, C, and D succeed: status = "connected", webhook_subscribed = true, connected_at = now()
 *
 * If B, C, or D fails:
 * - Never leaves status connected.
 * - Sets status degraded/error with a sanitized error code.
 * - Disables any endpoint created during the failed attempt.
 * - Checks compensation mutation result.
 */
export async function upsertWhatsAppIntegration(
  supabase: SupabaseClient,
  params: UpsertWhatsAppIntegrationParams
): Promise<{
  integrationId: string;
  endpointKey: string;
  webhookUrl: string;
  callbackUrl: string;
  maskedPhone: string;
  isReconnect: boolean;
  status: "connected" | "action_required";
}> {
  const { workspaceId, userId, accessToken, appSecret } = params;

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
    console.error("[Upsert WhatsApp] query_failed stage: check_existing code:", selectErr.code || "DB_ERROR");
    throw new Error("Failed to check existing WhatsApp integration.");
  }

  const isReconnect = Boolean(existing);
  const nowIso = new Date().toISOString();

  // Phase A: Insert or update integration in a non-active state:
  // status = "pending" or "degraded", webhook_subscribed = false, connected_at = null
  const initialStatus = isReconnect ? "degraded" : "pending";

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
    webhook_subscribed: false,
    ai_receptionist_enabled: true,
    graph_api_version: META_WHATSAPP_GRAPH_API_VERSION,
    onboarding_method: "meta_embedded_signup",
    last_connected_at: null,
  };

  let integrationId: string;

  if (existing) {
    integrationId = existing.id;
    const { data: updated, error: updateErr } = await supabase
      .from("integrations")
      .update({
        status: initialStatus,
        account_label: verifiedDetails.wabaName,
        external_account_id: verifiedDetails.phoneNumberId,
        external_account_label: verifiedDetails.displayPhoneNumber,
        public_configuration: publicConfig,
        connected_at: null,
        last_error_code: null,
        last_error_message: null,
        updated_at: nowIso,
      })
      .eq("id", integrationId)
      .eq("workspace_id", workspaceId)
      .select("id, status")
      .maybeSingle();

    if (updateErr || !updated || updated.id !== integrationId || updated.status !== initialStatus) {
      console.error("[Upsert WhatsApp] update_failed stage: initial_upsert code:", updateErr?.code || "DB_ERROR");
      throw new Error("Failed to update WhatsApp integration in database.");
    }
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("integrations")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        provider: "whatsapp-business",
        status: initialStatus,
        environment: "production",
        account_label: verifiedDetails.wabaName,
        external_account_id: verifiedDetails.phoneNumberId,
        external_account_label: verifiedDetails.displayPhoneNumber,
        public_configuration: publicConfig,
        connected_at: null,
        last_error_code: null,
        last_error_message: null,
      })
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      console.error("[Upsert WhatsApp] insert_failed stage: initial_upsert code:", insertErr?.code || "DB_ERROR");
      throw new Error("Failed to create WhatsApp integration in database.");
    }
    integrationId = inserted.id;
  }

  // Phase B: Successfully store encrypted credentials
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
    console.error("[Upsert WhatsApp] cred_store_failed stage: vault_store code:", credErr?.code || "CRED_ERROR");
    // Compensation: revert status to degraded, never leave connected
    const { data: compRow, error: compErr } = await supabase
      .from("integrations")
      .update({
        status: "degraded",
        last_error_code: "CREDENTIAL_STORAGE_FAILED",
        last_error_message: "Credential storage failed.",
        connected_at: null,
        public_configuration: { ...publicConfig, webhook_subscribed: false },
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId)
      .eq("workspace_id", workspaceId)
      .select("id, status")
      .maybeSingle();

    if (compErr || !compRow || compRow.id !== integrationId || compRow.status !== "degraded") {
      console.error("[Upsert WhatsApp] compensation_failed stage: cred_error_compensation code: COMPENSATION_REQUIRED");
      throw new Error("COMPENSATION_REQUIRED: Credential storage failed and compensation could not be recorded.");
    }
    throw new Error("Failed to store encrypted credentials securely.");
  }

  // Phase C: Successfully create/enable the canonical webhook endpoint
  const connectionObj: IntegrationConnection = {
    id: integrationId,
    workspaceId,
    userId,
    providerId: "whatsapp-business",
    status: initialStatus,
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
    lastConnectedAt: null,
    lastHealthCheckAt: nowIso,
    lastErrorCode: null,
    lastErrorMessage: null,
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
    if (!endpoint?.endpointKey || endpoint.status !== "active") {
      throw new Error("Endpoint creation returned invalid status.");
    }
  } catch (endpointErr: any) {
    console.error("[Upsert WhatsApp] endpoint_failed stage: create_endpoint code:", endpointErr?.code || "ENDPOINT_ERROR");
    let cleanupConfirmed = false;
    try {
      const disableRes = await disableIntegrationWebhookEndpoint(supabase, workspaceId, integrationId);
      cleanupConfirmed = Boolean(disableRes && disableRes.status === "disabled");
    } catch (cleanupErr: any) {
      console.error("[Upsert WhatsApp] endpoint_cleanup_failed stage: endpoint_cleanup code:", cleanupErr?.code || "CLEANUP_ERROR");
    }

    const { data: compRow, error: compErr } = await supabase
      .from("integrations")
      .update({
        status: "degraded",
        last_error_code: cleanupConfirmed ? "ENDPOINT_CREATION_FAILED" : "COMPENSATION_REQUIRED",
        last_error_message: cleanupConfirmed
          ? "Webhook endpoint configuration failed."
          : "Webhook endpoint configuration failed and cleanup could not be confirmed.",
        connected_at: null,
        public_configuration: { ...publicConfig, webhook_subscribed: false },
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId)
      .eq("workspace_id", workspaceId)
      .select("id, status")
      .maybeSingle();

    if (compErr || !cleanupConfirmed || !compRow || compRow.id !== integrationId || compRow.status !== "degraded") {
      console.error("[Upsert WhatsApp] compensation_failed stage: endpoint_error_compensation code: COMPENSATION_REQUIRED");
      throw new Error("COMPENSATION_REQUIRED: Webhook endpoint configuration failed and cleanup could not be verified.");
    }
    throw new Error("Failed to configure integration webhook endpoint.");
  }

  // Phase D: Confirm Meta subscribed_apps succeeded
  const isSubscribed = await subscribeWabaToWebhook(accessToken, verifiedDetails.wabaId);

  if (!isSubscribed) {
    console.error("[Upsert WhatsApp] subscription_unconfirmed stage: meta_subscription code: WEBHOOK_SUBSCRIPTION_FAILED");
    let cleanupConfirmed = false;
    try {
      const disableRes = await disableIntegrationWebhookEndpoint(supabase, workspaceId, integrationId);
      cleanupConfirmed = Boolean(disableRes && disableRes.status === "disabled");
    } catch (disableErr: any) {
      console.error("[Upsert WhatsApp] endpoint_disable_failed stage: disable_endpoint code:", disableErr?.code || "CLEANUP_ERROR");
    }

    const { data: compRow, error: compErr } = await supabase
      .from("integrations")
      .update({
        status: "degraded",
        last_error_code: cleanupConfirmed ? "WEBHOOK_SUBSCRIPTION_FAILED" : "COMPENSATION_REQUIRED",
        last_error_message: cleanupConfirmed
          ? "Meta webhook subscription could not be confirmed."
          : "Meta webhook subscription failed and endpoint cleanup could not be confirmed.",
        connected_at: null,
        public_configuration: {
          ...publicConfig,
          webhook_subscribed: false,
          last_connected_at: null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId)
      .eq("workspace_id", workspaceId)
      .select("id, status")
      .maybeSingle();

    if (compErr || !cleanupConfirmed || !compRow || compRow.id !== integrationId || compRow.status !== "degraded") {
      console.error("[Upsert WhatsApp] compensation_failed stage: subscription_error_compensation code: COMPENSATION_REQUIRED");
      throw new Error("COMPENSATION_REQUIRED: Meta webhook subscription failed and cleanup could not be verified.");
    }

    return {
      integrationId,
      endpointKey: endpoint.endpointKey,
      webhookUrl: `/api/webhooks/whatsapp/${endpoint.endpointKey}`,
      callbackUrl: META_WHATSAPP_CALLBACK_URL,
      maskedPhone: maskPhoneNumber(verifiedDetails.displayPhoneNumber),
      isReconnect,
      status: "action_required",
    };
  }

  // Phase E: Only after B, C, and D succeed:
  // status = "connected", webhook_subscribed = true, connected_at = now()
  const activateIso = new Date().toISOString();
  const { data: activatedRow, error: activateErr } = await supabase
    .from("integrations")
    .update({
      status: "connected",
      connected_at: activateIso,
      last_error_code: null,
      last_error_message: null,
      public_configuration: {
        ...publicConfig,
        webhook_subscribed: true,
        last_connected_at: activateIso,
      },
      updated_at: activateIso,
    })
    .eq("id", integrationId)
    .eq("workspace_id", workspaceId)
    .select("id, status")
    .maybeSingle();

  if (activateErr || !activatedRow || activatedRow.id !== integrationId || activatedRow.status !== "connected") {
    console.error("[Upsert WhatsApp] activation_failed stage: final_activate code:", activateErr?.code || "DB_ERROR");
    let cleanupConfirmed = false;
    try {
      const disableRes = await disableIntegrationWebhookEndpoint(supabase, workspaceId, integrationId);
      cleanupConfirmed = Boolean(disableRes && disableRes.status === "disabled");
    } catch (err: any) {
      console.error("[Upsert WhatsApp] endpoint_disable_failed stage: activation_revert code: CLEANUP_ERROR");
    }

    const { data: compRow, error: compErr } = await supabase
      .from("integrations")
      .update({
        status: "degraded",
        last_error_code: cleanupConfirmed ? "ACTIVATION_UPDATE_FAILED" : "COMPENSATION_REQUIRED",
        last_error_message: cleanupConfirmed
          ? "Failed to set connected status."
          : "Activation update failed and endpoint cleanup could not be confirmed.",
        connected_at: null,
        public_configuration: { ...publicConfig, webhook_subscribed: false },
        updated_at: new Date().toISOString(),
      })
      .eq("id", integrationId)
      .eq("workspace_id", workspaceId)
      .select("id, status")
      .maybeSingle();

    if (compErr || !cleanupConfirmed || !compRow || compRow.id !== integrationId || compRow.status !== "degraded") {
      console.error("[Upsert WhatsApp] compensation_failed stage: activation_revert code: COMPENSATION_REQUIRED");
      throw new Error("COMPENSATION_REQUIRED: Integration activation failed and cleanup could not be verified.");
    }

    throw new Error("Failed to activate WhatsApp integration.");
  }

  return {
    integrationId,
    endpointKey: endpoint.endpointKey,
    webhookUrl: `/api/webhooks/whatsapp/${endpoint.endpointKey}`,
    callbackUrl: META_WHATSAPP_CALLBACK_URL,
    maskedPhone: maskPhoneNumber(verifiedDetails.displayPhoneNumber),
    isReconnect,
    status: "connected",
  };
}

/**
 * Disconnects the WhatsApp integration for a workspace safely.
 *
 * Safe Order:
 * A. Disable the webhook endpoint.
 * B. Confirm disable succeeded.
 * C. Update the integration to disconnected.
 * D. Return success only after both operations succeed.
 */
export async function disconnectWhatsAppIntegration(
  supabase: SupabaseClient,
  workspaceId: string,
  reason: string = "user_initiated"
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
    console.error("[Disconnect WhatsApp] query_failed stage: select_integration code:", selectErr.code || "DB_ERROR");
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
    webhook_subscribed: false,
  };

  // Safe Order:
  // A. Disable the webhook endpoint
  let disableRes;
  try {
    disableRes = await disableIntegrationWebhookEndpoint(supabase, workspaceId, integration.id);
  } catch (err: any) {
    console.error("[Disconnect WhatsApp] endpoint_disable_failed stage: disable_endpoint code:", err?.code || "ENDPOINT_ERROR");
    throw new Error("Failed to disable webhook endpoint. Please retry disconnecting.");
  }

  // B. Confirm disable succeeded
  if (!disableRes || disableRes.status !== "disabled") {
    console.error("[Disconnect WhatsApp] endpoint_disable_unconfirmed stage: check_endpoint_status code: ENDPOINT_NOT_DISABLED");
    throw new Error("Failed to disable webhook endpoint. Please retry disconnecting.");
  }

  // C. Update the integration to disconnected
  const { data: disconnectedRow, error: updateErr } = await supabase
    .from("integrations")
    .update({
      status: "disconnected",
      public_configuration: publicConfig,
      connected_at: null,
      updated_at: nowIso,
    })
    .eq("id", integration.id)
    .eq("workspace_id", workspaceId)
    .select("id, status")
    .maybeSingle();

  if (
    updateErr ||
    !disconnectedRow ||
    disconnectedRow.id !== integration.id ||
    disconnectedRow.status !== "disconnected"
  ) {
    console.error("[Disconnect WhatsApp] update_failed stage: update_disconnected code:", updateErr?.code || "DB_ERROR");
    // Processing is safely disabled via endpoint, but DB update failed
    throw new Error("Webhook processing disabled, but failed to update status. Action required.");
  }

  // D. Return success only after both operations succeed
  return { success: true, status: "disconnected" };
}

/**
 * Returns sanitized WhatsApp connection status for the active workspace.
 * Never leaks access tokens, secrets, or internal keys.
 * Distinguishes no integration from database query failure (throws on query error).
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
      callbackUrl: META_WHATSAPP_CALLBACK_URL,
      lastConnectedAt: null,
    };
  }

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("id, status, account_label, external_account_id, external_account_label, public_configuration, connected_at, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("provider", "whatsapp-business")
    .maybeSingle();

  if (error) {
    console.error("[WhatsApp Status] query_failed stage: get_status code:", error.code || "DB_ERROR");
    throw new Error("Failed to load WhatsApp integration status.");
  }

  if (!integration) {
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
      callbackUrl: META_WHATSAPP_CALLBACK_URL,
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
    callbackUrl: META_WHATSAPP_CALLBACK_URL,
    lastConnectedAt: cfg.last_connected_at || integration.connected_at,
  };
}
