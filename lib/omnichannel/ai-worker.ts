import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processOmnichannelSecretaryResponse } from "@/lib/omnichannel/secretary-engine";
import { processShopifyConciergeEvent } from "@/lib/omnichannel/shopify-concierge";

export interface ProcessOmnichannelJobsOptions {
  workerId?: string;
  limit?: number;
  leaseSeconds?: number;
}

export interface ProcessOmnichannelJobsResult {
  claimedCount: number;
  processedCount: number;
  successCount: number;
  failureCount: number;
  jobDetails: Array<{
    jobId: string;
    channel: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Omnichannel AI Background Worker
 * Claims and executes pending AI auto-response jobs across all integrated channels.
 */
export async function processOmnichannelAiJobsOnce(
  supabase: SupabaseClient,
  options: ProcessOmnichannelJobsOptions = {}
): Promise<ProcessOmnichannelJobsResult> {
  const workerId = options.workerId || randomUUID();
  const limit = Math.min(10, Math.max(1, options.limit ?? 5));
  const leaseSeconds = Math.max(30, options.leaseSeconds || 60);

  const nowIso = new Date().toISOString();
  const leaseExpiryIso = new Date(Date.now() + leaseSeconds * 1000).toISOString();

  let jobs: any[] = [];

  try {
    // 1. Atomically claim jobs
    const { data: candidates, error: findError } = await supabase
      .from("omnichannel_ai_jobs")
      .select("*")
      .or(`status.in.(pending,retryable),and(status.eq.processing,lease_expires_at.lt.${nowIso})`)
      .lte("next_attempt_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (candidates && candidates.length > 0) {
      for (const candidate of candidates) {
        const { data: locked } = await supabase
          .from("omnichannel_ai_jobs")
          .update({
            status: "processing",
            claim_token: workerId,
            lease_expires_at: leaseExpiryIso,
            attempts: (candidate.attempts || 0) + 1,
            updated_at: nowIso,
          })
          .eq("id", candidate.id)
          .select()
          .maybeSingle();

        if (locked) {
          jobs.push(locked);
        }
      }
    }
  } catch (err) {
    console.error("[Omnichannel AI Worker] Claim error:", err);
  }

  const result: ProcessOmnichannelJobsResult = {
    claimedCount: jobs.length,
    processedCount: 0,
    successCount: 0,
    failureCount: 0,
    jobDetails: [],
  };

  if (jobs.length === 0) {
    return result;
  }

  // 2. Process each claimed job
  for (const job of jobs) {
    result.processedCount++;
    try {
      if (job.channel === "shopify_event" || job.job_type === "shopify_concierge") {
        // Execute Shopify concierge
        const conciergeRes = await processShopifyConciergeEvent(supabase, {
          workspaceId: job.workspace_id,
          topic: job.payload?.topic || "orders/create",
          orderId: job.payload?.orderId,
          checkoutId: job.payload?.checkoutId,
          customerName: job.payload?.customerName,
          customerEmail: job.payload?.customerEmail,
          customerPhone: job.payload?.customerPhone,
          totalPrice: job.payload?.totalPrice,
          currency: job.payload?.currency,
        });

        await supabase
          .from("omnichannel_ai_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        result.successCount++;
        result.jobDetails.push({
          jobId: job.id,
          channel: "shopify_event",
          success: true,
        });
      } else {
        // Execute Omnichannel Secretary response
        const secretaryRes = await processOmnichannelSecretaryResponse(supabase, {
          workspaceId: job.workspace_id,
          channel: job.channel,
          threadId: job.thread_id,
          recipientIdentifier: job.recipient_identifier || job.payload?.from || "",
          inboundText: job.inbound_text || job.payload?.body || job.payload?.text || "",
          senderName: job.sender_name || job.payload?.senderName,
          inboundMessageId: job.inbound_message_id,
          integrationId: job.integration_id,
        });

        if (secretaryRes.success) {
          await supabase
            .from("omnichannel_ai_jobs")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          result.successCount++;
          result.jobDetails.push({
            jobId: job.id,
            channel: job.channel,
            success: true,
          });
        } else {
          throw new Error(secretaryRes.error || "Failed to process secretary response");
        }
      }
    } catch (err: any) {
      const isMaxAttempts = (job.attempts || 1) >= (job.max_attempts || 3);
      const nextDelaySeconds = Math.min(300, Math.pow(2, job.attempts || 1) * 5);
      const nextAttemptIso = new Date(Date.now() + nextDelaySeconds * 1000).toISOString();

      await supabase
        .from("omnichannel_ai_jobs")
        .update({
          status: isMaxAttempts ? "failed" : "retryable",
          last_error: err?.message || "Unknown execution error",
          next_attempt_at: nextAttemptIso,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      result.failureCount++;
      result.jobDetails.push({
        jobId: job.id,
        channel: job.channel,
        success: false,
        error: err?.message,
      });
    }
  }

  return result;
}
