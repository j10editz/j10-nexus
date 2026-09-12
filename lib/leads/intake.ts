import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchAutomationEvent } from "@/lib/automation/event-trigger-engine";

export type LeadSource = "website_form" | "widget_form" | "webchat" | "manual" | "whatsapp";
export type LeadChannel = "whatsapp" | "whatsapp_group" | "sms" | "email" | "instagram" | "messenger" | "webchat" | "website" | "crm";
export type LeadConsent = { status: "granted" | "denied" | "revoked" | "not_provided"; communicationChannel: LeadChannel; purpose: "operational" | "marketing"; disclosureVersion: string; capturedAt?: string; captureSource: string };
export type LeadIntakeInput = { workspaceId: string; source: LeadSource; channel: LeadChannel; name: string; email?: string | null; phone?: string | null; message?: string | null; campaign?: string | null; attribution?: Record<string, unknown>; consents?: LeadConsent[]; sourceEventId?: string | null; idempotencyKey?: string | null; metadata?: Record<string, unknown> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeLeadIdentity(input: Pick<LeadIntakeInput, "email" | "phone">) {
  const email = input.email?.trim().toLowerCase() || null;
  const digits = (input.phone || "").replace(/\D/g, "");
  return { email: email && EMAIL.test(email) ? email : null, phone: digits.length >= 7 ? `+${digits}` : null };
}

export function deriveLeadIdempotencyKey(input: LeadIntakeInput) {
  if (input.idempotencyKey?.trim()) return input.idempotencyKey.trim().slice(0, 128);
  const identity = normalizeLeadIdentity(input);
  const material = JSON.stringify({ source: input.source, sourceEventId: input.sourceEventId || null, email: identity.email, phone: identity.phone, name: input.name.trim(), message: input.message?.trim() || "" });
  return `lead_${createHash("sha256").update(material).digest("hex").slice(0, 48)}`;
}

export async function recordCanonicalLeadIntake(supabase: SupabaseClient, input: LeadIntakeInput, origin: string) {
  const name = input.name.trim().slice(0, 160);
  const identity = normalizeLeadIdentity(input);
  if (!name || (!identity.email && !identity.phone)) throw new Error("A name and a valid email or phone are required.");
  const idempotencyKey = deriveLeadIdempotencyKey(input);
  const consents = (input.consents || []).map((consent) => ({ status: consent.status, communication_channel: consent.communicationChannel, purpose: consent.purpose, disclosure_version: consent.disclosureVersion, captured_at: consent.capturedAt || new Date().toISOString(), capture_source: consent.captureSource }));
  const { data, error } = await supabase.rpc("record_lead_intake", { p_workspace_id: input.workspaceId, p_source: input.source, p_channel: input.channel, p_idempotency_key: idempotencyKey, p_name: name, p_email: identity.email, p_phone: identity.phone, p_message: input.message?.trim().slice(0, 4000) || null, p_campaign: input.campaign?.trim().slice(0, 200) || null, p_attribution: input.attribution || {}, p_consents: consents, p_source_event_id: input.sourceEventId?.trim().slice(0, 256) || null, p_metadata: input.metadata || {} });
  if (error || !data?.success) throw new Error("J10 could not record this lead intake.");
  if (data.canonical_event_id) await dispatchLeadReceivedOutbox(supabase, input.workspaceId, String(data.intake_id), String(data.canonical_event_id), origin, typeof data.contact_id === "string" ? data.contact_id : null);
  return data;
}

export async function dispatchLeadReceivedOutbox(supabase: SupabaseClient, workspaceId: string, intakeId: string, eventId: string, origin: string, contactId: string | null = null) {
  const claimToken = randomUUID();
  const { data: claim, error: claimError } = await supabase.rpc("claim_lead_event_outbox", {
    p_workspace_id: workspaceId,
    p_intake_id: intakeId,
    p_claim_token: claimToken,
  });
  if (claimError) throw new Error("J10 could not claim this lead event for dispatch.");
  if (!claim?.claimed) return { success: true, claimed: false, deduplicated: true };
  const { data: workspace } = await supabase.from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();
  if (!workspace?.owner_user_id) {
    await supabase.rpc("complete_lead_event_outbox", { p_workspace_id: workspaceId, p_intake_id: intakeId, p_claim_token: claimToken, p_delivered: false, p_error: "workspace_owner_unavailable" });
    throw new Error("J10 could not resolve the workspace automation owner.");
  }
  try {
    const dispatch = await dispatchAutomationEvent({ supabase, userId: workspace.owner_user_id, origin, cookieHeader: "", triggerType: "lead.received", eventId: String(claim.canonical_event_id || eventId), dedupeKey: String(claim.canonical_event_id || eventId), payload: { intakeId, contactId: typeof claim.contact_id === "string" ? claim.contact_id : contactId, workspaceId, eventType: "lead.received" } });
    if (!dispatch.success) throw new Error("Automation dispatch failed.");
    const { data: completed } = await supabase.rpc("complete_lead_event_outbox", { p_workspace_id: workspaceId, p_intake_id: intakeId, p_claim_token: claimToken, p_delivered: true, p_error: null });
    if (!completed) throw new Error("J10 could not complete this lead event dispatch.");
    return dispatch;
  } catch (error) {
    await supabase.rpc("complete_lead_event_outbox", { p_workspace_id: workspaceId, p_intake_id: intakeId, p_claim_token: claimToken, p_delivered: false, p_error: "dispatch_failed" });
    throw error;
  }
}

export function newLeadRequestId() { return randomUUID(); }
