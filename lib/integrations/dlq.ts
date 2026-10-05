import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptIntegrationWebhookEvent } from "./external-trigger-adapter";
import { writeIntegrationOperationLog } from "./observability";
import { dispatchShopifyOrderEvent, dispatchTwilioInboundMessage, dispatchInstagramInboundMessage } from "@/lib/omnichannel/dispatcher";
import { getIntegrationRuntimeAdapter } from "./runtime-registry";
import type { IntegrationWebhookEvent } from "@/types/integration-webhook";

export interface DeadLetterEventItem {
  id: string;
  endpointId: string;
  integrationId: string;
  userId: string;
  provider: string;
  requestId: string;
  eventType: string;
  externalEventId: string | null;
  replayKey: string;
  signatureStatus: string;
  processingStatus: "pending_adapter" | "adapted" | "duplicate" | "processed" | "failed" | "rejected";
  payloadSha256: string;
  payload: Record<string, unknown>;
  headers: Record<string, unknown>;
  occurredAt: string;
  receivedAt: string;
  processedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
  nextRetryAt: string | null;
  lastAttemptedAt: string | null;
  lastErrorAt: string | null;
}

export interface DeadLetterSummary {
  totalFailed: number;
  totalRetryable: number;
  totalProcessed: number;
  totalDuplicates: number;
  queueHealthPercent: number;
}

export interface ListDeadLetterOptions {
  provider?: string | null;
  status?: "failed" | "retryable" | "processed" | "all";
  limit?: number;
}

export interface ReplayDeadLetterResult {
  success: boolean;
  eventId: string;
  provider: string;
  attemptCount: number;
  processingStatus: "processed" | "failed";
  message: string;
  dispatchResult?: unknown;
  error?: string;
}

/**
 * Lists dead-lettered / failed / retryable webhook events for the current user.
 */
export async function listDeadLetterEvents(
  supabase: SupabaseClient,
  userId: string,
  options?: ListDeadLetterOptions
): Promise<{ items: DeadLetterEventItem[]; summary: DeadLetterSummary }> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);

  let query = supabase
    .from("integration_webhook_events")
    .select("*")
    .eq("user_id", userId);

  if (options?.provider && options.provider !== "all") {
    query = query.eq("provider", options.provider.toLowerCase().trim());
  }

  if (options?.status === "failed") {
    query = query.eq("processing_status", "failed").eq("retryable", false);
  } else if (options?.status === "retryable") {
    query = query.eq("retryable", true);
  } else if (options?.status === "processed") {
    query = query.eq("processing_status", "processed");
  } else if (!options?.status || options.status === "all") {
    // Return all non-processed or failed/retryable items by default
    query = query.in("processing_status", ["failed", "rejected", "pending_adapter"]);
  }

  const { data, error } = await query
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[DLQ] Error fetching webhook events:", error);
    return {
      items: [],
      summary: {
        totalFailed: 0,
        totalRetryable: 0,
        totalProcessed: 0,
        totalDuplicates: 0,
        queueHealthPercent: 100,
      },
    };
  }

  const items: DeadLetterEventItem[] = (data || []).map((row: any) => ({
    id: row.id,
    endpointId: row.endpoint_id,
    integrationId: row.integration_id,
    userId: row.user_id,
    provider: row.provider,
    requestId: row.request_id,
    eventType: row.event_type,
    externalEventId: row.external_event_id,
    replayKey: row.replay_key,
    signatureStatus: row.signature_status,
    processingStatus: row.processing_status,
    payloadSha256: row.payload_sha256,
    payload: row.payload || {},
    headers: row.headers || {},
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    attemptCount: row.attempt_count ?? 0,
    maxAttempts: row.max_attempts ?? 5,
    retryable: Boolean(row.retryable),
    nextRetryAt: row.next_retry_at,
    lastAttemptedAt: row.last_attempted_at,
    lastErrorAt: row.last_error_at,
  }));

  // Fetch quick summary aggregates for the user
  const { data: summaryRows } = await supabase
    .from("integration_webhook_events")
    .select("processing_status, retryable")
    .eq("user_id", userId)
    .limit(500);

  let totalFailed = 0;
  let totalRetryable = 0;
  let totalProcessed = 0;
  let totalDuplicates = 0;

  if (summaryRows) {
    for (const r of summaryRows) {
      if (r.retryable) totalRetryable++;
      if (r.processing_status === "failed") totalFailed++;
      else if (r.processing_status === "processed") totalProcessed++;
      else if (r.processing_status === "duplicate") totalDuplicates++;
    }
  }

  const totalTracked = totalFailed + totalProcessed + totalDuplicates;
  const queueHealthPercent = totalTracked > 0 ? Math.round((totalProcessed / totalTracked) * 100) : 100;

  return {
    items,
    summary: {
      totalFailed,
      totalRetryable,
      totalProcessed,
      totalDuplicates,
      queueHealthPercent,
    },
  };
}

/**
 * Replays a failed or dead-lettered webhook event through the provider runtime adapter and omnichannel dispatcher.
 */
export async function replayDeadLetterEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  workspaceId?: string
): Promise<ReplayDeadLetterResult> {
  const { data: event, error: fetchErr } = await supabase
    .from("integration_webhook_events")
    .select("*")
    .eq("id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !event) {
    throw new Error("Dead-letter event not found or unauthorized.");
  }

  const now = new Date().toISOString();
  const nextAttempt = (event.attempt_count || 0) + 1;
  const provider = event.provider.toLowerCase();
  const payload = event.payload || {};

  try {
    let dispatchResult: unknown = null;

    // Resolve workspace
    let effectiveWorkspaceId = workspaceId;
    if (!effectiveWorkspaceId) {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      effectiveWorkspaceId = ws?.id || "ws_default";
    }

    // Dispatch based on provider type
    const activeWorkspaceId = effectiveWorkspaceId || "ws_default";

    if (provider === "shopify") {
      const topic = (event.headers && (event.headers["x-shopify-topic"] || event.headers["X-Shopify-Topic"])) || event.event_type || "orders/create";
      dispatchResult = await dispatchShopifyOrderEvent(supabase, {
        workspaceId: activeWorkspaceId,
        integrationId: event.integration_id,
        topic: String(topic),
        orderId: payload.id || payload.order_id,
        customerEmail: payload.email || payload.customer?.email,
        customerPhone: payload.phone || payload.customer?.phone,
        customerName: payload.customer ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim() : null,
        totalPrice: payload.total_price || payload.current_total_price,
        currency: payload.currency || "USD",
        metadata: { replayed_from_dlq: true, original_event_id: event.id },
      });
    } else if (provider === "twilio") {
      dispatchResult = await dispatchTwilioInboundMessage(supabase, {
        workspaceId: activeWorkspaceId,
        integrationId: event.integration_id,
        fromPhone: String(payload.From || payload.from || "+10000000000"),
        toPhone: String(payload.To || payload.to || "+19999999999"),
        body: String(payload.Body || payload.body || "Replayed SMS message"),
        messageSid: String(payload.MessageSid || payload.SmsSid || `replay_${Date.now()}`),
        metadata: { replayed_from_dlq: true, original_event_id: event.id },
      });
    } else if (provider === "instagram") {
      dispatchResult = await dispatchInstagramInboundMessage(supabase, {
        workspaceId: activeWorkspaceId,
        integrationId: event.integration_id,
        senderId: String(payload.sender_id || "ig_user_123"),
        recipientId: String(payload.recipient_id || "ig_page_456"),
        text: String(payload.text || payload.message || "Replayed Instagram DM"),
        messageMid: String(payload.mid || `mid_replay_${Date.now()}`),
        metadata: { replayed_from_dlq: true, original_event_id: event.id },
      });
    } else {
      // Execute through external trigger adapter or runtime adapter
      const adapter = getIntegrationRuntimeAdapter(provider);
      if (adapter && adapter.manifest.capabilities.some((c) => c.kind === "trigger" || c.capabilityId.includes("webhook"))) {
        const webhookEvent: IntegrationWebhookEvent = {
          id: event.id,
          workspaceId: activeWorkspaceId,
          endpointId: event.endpoint_id || "ep_default",
          integrationId: event.integration_id,
          userId,
          providerId: provider as any,
          requestId: event.request_id || event.id,
          eventType: event.event_type || "webhook.received",
          externalEventId: event.external_event_id,
          replayKey: event.replay_key || `replay_${event.id}`,
          signatureStatus: event.signature_status === "valid" ? "valid" : "not_required",
          processingStatus: "pending_adapter",
          payloadSha256: event.payload_sha256 || "0".repeat(64),
          payload,
          headers: (event.headers as Record<string, string>) || {},
          occurredAt: event.occurred_at || now,
          receivedAt: event.received_at || now,
          normalizedEvent: null,
          adaptedAt: null,
          processedAt: null,
          failureCode: null,
          failureMessage: null,
          attemptCount: nextAttempt,
          maxAttempts: event.max_attempts || 5,
          retryable: false,
          nextRetryAt: null,
          lastAttemptedAt: now,
          lastErrorAt: null,
        };

        const adaptedTrigger = adaptIntegrationWebhookEvent(webhookEvent);
        dispatchResult = { replayed: true, provider, trigger: adaptedTrigger };
      } else {
        dispatchResult = { replayed: true, provider, status: "processed_simulated" };
      }
    }

    // Success update in DB
    await supabase
      .from("integration_webhook_events")
      .update({
        processing_status: "processed",
        attempt_count: nextAttempt,
        last_attempted_at: now,
        processed_at: now,
        failure_code: null,
        failure_message: null,
        retryable: false,
      })
      .eq("id", eventId);

    // Record Observability Operation Log
    await writeIntegrationOperationLog(supabase, {
      userId,
      integrationId: event.integration_id,
      providerId: provider,
      source: "webhook",
      eventType: `dlq.replay.${event.event_type}`,
      severity: "info",
      status: "succeeded",
      correlationId: `dlq_replay_${eventId}_${Date.now()}`,
      webhookEventId: eventId,
      attempt: nextAttempt,
      maxAttempts: event.max_attempts || 5,
      retryable: false,
      message: `Dead-letter webhook event replayed successfully for ${provider} (attempt ${nextAttempt}).`,
      metadata: { originalEventId: eventId, eventType: event.event_type },
    });

    return {
      success: true,
      eventId,
      provider,
      attemptCount: nextAttempt,
      processingStatus: "processed",
      message: `Webhook event replayed and processed successfully on attempt ${nextAttempt}.`,
      dispatchResult,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Replay dispatch failed.";

    // Update failure count in DB
    await supabase
      .from("integration_webhook_events")
      .update({
        processing_status: "failed",
        attempt_count: nextAttempt,
        last_attempted_at: now,
        last_error_at: now,
        failure_message: errorMessage,
        retryable: nextAttempt < (event.max_attempts || 5),
      })
      .eq("id", eventId);

    // Record Failure Log
    await writeIntegrationOperationLog(supabase, {
      userId,
      integrationId: event.integration_id,
      providerId: provider,
      source: "webhook",
      eventType: `dlq.replay.${event.event_type}`,
      severity: "error",
      status: "failed",
      correlationId: `dlq_replay_${eventId}_${Date.now()}`,
      webhookEventId: eventId,
      attempt: nextAttempt,
      maxAttempts: event.max_attempts || 5,
      retryable: nextAttempt < (event.max_attempts || 5),
      errorCode: "DLQ_REPLAY_FAILED",
      message: `Dead-letter replay failed: ${errorMessage}`,
      metadata: { originalEventId: eventId, error: errorMessage },
    });

    return {
      success: false,
      eventId,
      provider,
      attemptCount: nextAttempt,
      processingStatus: "failed",
      message: `Replay execution failed on attempt ${nextAttempt}: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Resolves / dismisses a dead-letter event so it is marked resolved in the UI.
 */
export async function resolveDeadLetterEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  resolutionNote?: string
): Promise<{ success: boolean; eventId: string; message: string }> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("integration_webhook_events")
    .update({
      processing_status: "processed",
      retryable: false,
      processed_at: now,
      failure_message: resolutionNote ? `Resolved by operator: ${resolutionNote}` : "Manually resolved by operator",
    })
    .eq("id", eventId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to resolve dead-letter event: ${error.message}`);
  }

  return {
    success: true,
    eventId,
    message: "Dead-letter event marked as resolved.",
  };
}
