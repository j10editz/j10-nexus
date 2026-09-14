import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENT_CONSENT_VERSION } from "./connection-session";

export interface RecordConsentParams {
  workspaceId: string;
  userId: string;
  consentVersion?: string;
  aiProvider?: string;
  categoriesProcessed?: string[];
  retentionDays?: number;
  revocationMethod?: string;
}

export interface ConsentRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  consent_version: string;
  ai_provider: string;
  categories_processed: string[];
  retention_days: number;
  revocation_method: string;
  authorized_at: string;
  revoked_at?: string | null;
}

export interface DeletionIntentResult {
  intentId: string;
  token: string;
  expiresInSeconds: number;
  preview: {
    workspaceId: string;
    businessConnectionId: string;
    connectionsCount: number;
    messagesCount: number;
    threadsCount: number;
    jobsCount: number;
    sharedContactsPreserved: number;
  };
}

export interface ScopedDeletionResult {
  success: boolean;
  workspaceId: string;
  businessConnectionId: string;
  connectionsUpdated: number;
  jobsPurged: number;
  messagesDeleted: number;
  threadsDeleted: number;
  sharedContactsPreserved: number;
  auditEvent: string;
  deletedAt: string;
}

/**
 * Persists an immutable consent audit record for external AI processing of Telegram data.
 */
export async function recordTelegramConnectionConsent(
  supabase: SupabaseClient,
  params: RecordConsentParams
): Promise<ConsentRecord> {
  const {
    workspaceId,
    userId,
    consentVersion = CURRENT_CONSENT_VERSION,
    aiProvider = "google-gemini",
    categoriesProcessed = ["inbound_messages", "contact_metadata", "appointment_requests"],
    retentionDays = 90,
    revocationMethod = "dashboard_disconnect",
  } = params;

  const { data, error } = await supabase
    .from("telegram_connection_consents")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      consent_version: consentVersion,
      ai_provider: aiProvider,
      categories_processed: categoriesProcessed,
      retention_days: retentionDays,
      revocation_method: revocationMethod,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[Telegram Consent] Failed to record consent:", error);
    throw new Error(`Failed to record AI consent: ${error?.message || "Unknown error"}`);
  }

  return data as ConsentRecord;
}

/**
 * Retrieves the latest active consent for a workspace.
 */
export async function getActiveConsentForWorkspace(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ConsentRecord | null> {
  const { data, error } = await supabase
    .from("telegram_connection_consents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("authorized_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ConsentRecord;
}

/**
 * Previews affected records before disconnection and deletion.
 */
export async function previewTelegramBusinessDeletion(
  supabase: SupabaseClient,
  workspaceId: string,
  businessConnectionId: string
): Promise<{
  workspaceId: string;
  businessConnectionId: string;
  connectionsCount: number;
  messagesCount: number;
  threadsCount: number;
  jobsCount: number;
  sharedContactsPreserved: number;
}> {
  const { data, error } = await supabase.rpc("preview_telegram_business_deletion", {
    p_workspace_id: workspaceId,
    p_business_connection_id: businessConnectionId,
  });

  if (error) {
    console.error("[Telegram Disconnect] Failed to preview deletion:", error);
    throw new Error(`Failed to preview Telegram deletion: ${error.message}`);
  }

  const res = (data as any) || {};
  return {
    workspaceId: res.workspace_id || workspaceId,
    businessConnectionId: res.business_connection_id || businessConnectionId,
    connectionsCount: res.connections_count ?? 0,
    messagesCount: res.messages_count ?? 0,
    threadsCount: res.threads_count ?? 0,
    jobsCount: res.jobs_count ?? 0,
    sharedContactsPreserved: res.shared_contacts_preserved ?? 0,
  };
}

/**
 * Creates a cryptographically random, hashed, single-use deletion intent token.
 * Token expires in 10 minutes and is bound to requesting user, workspace, and connection.
 */
export async function createTelegramDeletionIntent(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    businessConnectionId: string;
    userId: string;
  }
): Promise<DeletionIntentResult> {
  const rawToken = `tdel_${crypto.randomBytes(32).toString("hex")}`;
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const { data, error } = await supabase.rpc("create_telegram_deletion_intent", {
    p_workspace_id: params.workspaceId,
    p_business_connection_id: params.businessConnectionId,
    p_token_hash: tokenHash,
    p_user_id: params.userId,
  });

  if (error || !data) {
    console.error("[Telegram Disconnect] Failed to create deletion intent:", error);
    throw new Error(`Failed to generate deletion intent: ${error?.message || "Unknown error"}`);
  }

  const preview = (data as any).preview || {};

  return {
    intentId: (data as any).intent_id,
    token: rawToken,
    expiresInSeconds: (data as any).expires_in_seconds || 600,
    preview: {
      workspaceId: preview.workspace_id || params.workspaceId,
      businessConnectionId: preview.business_connection_id || params.businessConnectionId,
      connectionsCount: preview.connections_count ?? 0,
      messagesCount: preview.messages_count ?? 0,
      threadsCount: preview.threads_count ?? 0,
      jobsCount: preview.jobs_count ?? 0,
      sharedContactsPreserved: preview.shared_contacts_preserved ?? 0,
    },
  };
}

/**
 * Executes hardened scoped deletion with single-use cryptographic token consumption.
 * Strictly scopes deletion to the specified business_connection_id.
 * Preserves shared bot DMs, custom bots, other business connections, and all CRM contacts.
 */
export async function executeTelegramScopedDeletion(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    businessConnectionId: string;
    token: string;
    deleteMessages: boolean;
  }
): Promise<ScopedDeletionResult> {
  if (!params.token || !params.token.startsWith("tdel_")) {
    throw new Error("Invalid deletion token format. A valid single-use cryptographic token is required.");
  }

  const tokenHash = crypto.createHash("sha256").update(params.token).digest("hex");

  const { data, error } = await supabase.rpc("execute_telegram_scoped_deletion", {
    p_workspace_id: params.workspaceId,
    p_business_connection_id: params.businessConnectionId,
    p_token_hash: tokenHash,
    p_delete_messages: params.deleteMessages,
  });

  if (error || !data) {
    console.error("[Telegram Disconnect] Failed to execute scoped deletion RPC:", error);
    throw new Error(`Deletion execution failed: ${error?.message || "Unknown error"}`);
  }

  const res = (data as any) || {};
  return {
    success: res.success ?? true,
    workspaceId: res.workspace_id || params.workspaceId,
    businessConnectionId: res.business_connection_id || params.businessConnectionId,
    connectionsUpdated: res.connections_updated ?? 0,
    jobsPurged: res.jobs_purged ?? 0,
    messagesDeleted: res.messages_deleted ?? 0,
    threadsDeleted: res.threads_deleted ?? 0,
    sharedContactsPreserved: res.shared_contacts_preserved ?? 0,
    auditEvent: res.audit_event || "telegram_scoped_data_deleted",
    deletedAt: res.deleted_at || new Date().toISOString(),
  };
}
