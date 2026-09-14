import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAndSendTelegramAIResponse } from "@/lib/ai/telegram-assistant";

export interface ProcessJobsOptions {
  workerId?: string;
  limit?: number;
  leaseSeconds?: number;
}

export interface ProcessJobsResult {
  claimedCount: number;
  processedCount: number;
  successCount: number;
  failureCount: number;
  jobDetails: Array<{
    jobId: string;
    success: boolean;
    error?: string;
  }>;
  skipped?: string;
}

/**
 * Claims and processes durable Telegram AI jobs from the database queue.
 * Guarantees crash recovery: any expired leases from failed/dead workers are reclaimed.
 * Enforces global worker-cycle advisory locks, max 3 jobs per invocation, atomic 120s leases,
 * active 30s heartbeats, post-Gemini & pre-send claim re-verification, and prevents duplicate sends.
 * Ambiguous Telegram delivery is safely classified as 'delivery_unknown' (no blind automatic duplicate dispatch).
 */
export async function processTelegramAiJobsOnce(
  supabase: SupabaseClient,
  options: ProcessJobsOptions = {}
): Promise<ProcessJobsResult> {
  const workerId = options.workerId || randomUUID();
  // Strict launch invariant: maximum 3 claimed jobs per invocation
  const limit = Math.min(3, Math.max(1, options.limit ?? 3));
  // Strict launch invariant: lease duration must be at least 120 seconds
  const leaseSeconds = Math.max(120, options.leaseSeconds || 120);

  // 1. Global worker-cycle database lock (overlap protection)
  let advisoryLockHeld = false;
  try {
    const { data: acquired } = await supabase.rpc("acquire_telegram_worker_lock", {
      p_worker_id: workerId,
      p_lease_seconds: 60,
    });
    if (acquired === false) {
      console.log("[Telegram AI Worker] Another worker cycle is actively running. Gracefully yielding cycle.");
      return {
        claimedCount: 0,
        processedCount: 0,
        successCount: 0,
        failureCount: 0,
        jobDetails: [],
        skipped: "worker_cycle_locked",
      };
    }
    advisoryLockHeld = true;
  } catch (lockErr) {
    // If advisory lock RPC is not available in environment, proceed with row-level SKIP LOCKED
    console.warn("[Telegram AI Worker] Advisory lock RPC unavailable; falling back to row-level locks:", lockErr);
  }

  try {
    // 2. Atomically claim jobs using FOR UPDATE SKIP LOCKED
    const { data: claimedJobs, error: claimError } = await supabase.rpc(
      "claim_telegram_ai_jobs",
      {
        p_worker_id: workerId,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      }
    );

    if (claimError) {
      console.error("[Telegram AI Worker] Failed to claim jobs:", claimError);
      throw new Error(`Failed to claim Telegram AI jobs: ${claimError.message}`);
    }

    const jobs = (claimedJobs as any[]) || [];
    const result: ProcessJobsResult = {
      claimedCount: jobs.length,
      processedCount: 0,
      successCount: 0,
      failureCount: 0,
      jobDetails: [],
    };

    if (jobs.length === 0) {
      return result;
    }

    // 3. Process each claimed job with active heartbeat & double-dispatch prevention
    for (const job of jobs) {
      result.processedCount++;
      let heartbeatTimer: NodeJS.Timeout | null = null;

      try {
        // Start active heartbeat renewal every 30 seconds
        heartbeatTimer = setInterval(async () => {
          try {
            const { data: renewed } = await supabase.rpc("renew_telegram_ai_job_lease", {
              p_job_id: job.job_id,
              p_claim_token: workerId,
              p_additional_seconds: 60,
            });
            if (renewed === false) {
              console.warn(`[Telegram AI Worker] Job ${job.job_id} lease renewal failed (stolen or expired).`);
            }
          } catch (hbErr) {
            console.error(`[Telegram AI Worker] Heartbeat error for job ${job.job_id}:`, hbErr);
          }
        }, 30000);

        // Re-verify thread state & permissions
        const { data: thread } = await supabase
          .from("inbox_threads")
          .select("id, metadata")
          .eq("id", job.thread_id)
          .maybeSingle();

        if (!thread) {
          throw new Error(`Thread ${job.thread_id} not found`);
        }

        // Check human takeover guard
        const metadata = (thread.metadata as any) || {};
        if (metadata.humanHandoff === true || metadata.aiBotEnabled === false) {
          console.log(`[Telegram AI Worker] Job ${job.job_id} suppressed: human handoff active`);
          await supabase.rpc("complete_telegram_ai_job", {
            p_job_id: job.job_id,
            p_claim_token: workerId,
            p_success: true,
            p_error: "suppressed_human_handoff",
          });
          result.successCount++;
          result.jobDetails.push({ jobId: job.job_id, success: true });
          continue;
        }

        // Pre-generation verification: ensure lease is still actively held by THIS claim_token
        const { data: preGenCheck } = await supabase
          .from("telegram_ai_jobs")
          .select("claim_token, status")
          .eq("id", job.job_id)
          .maybeSingle();

        if (!preGenCheck || preGenCheck.claim_token !== workerId || preGenCheck.status !== "processing") {
          throw new Error(`Job ${job.job_id} lease lost before AI generation. Aborting to prevent duplicate reply.`);
        }

        // Execute AI Receptionist Generation & Delivery with pre-send claim re-verification hook
        const dispatchResult = await generateAndSendTelegramAIResponse({
          supabase,
          workspaceId: job.workspace_id,
          threadId: job.thread_id,
          chatId: job.chat_id,
          messageText: job.message_text,
          senderName: job.sender_name,
          businessConnectionId: job.business_connection_id || undefined,
          onBeforeSend: async () => {
            // Atomic pre-send check: verify lease is STILL actively owned by workerId after Gemini returned
            const { data: preSendCheck } = await supabase
              .from("telegram_ai_jobs")
              .select("claim_token, status")
              .eq("id", job.job_id)
              .maybeSingle();

            if (!preSendCheck || preSendCheck.claim_token !== workerId || preSendCheck.status !== "processing") {
              console.error(`[Telegram AI Worker] Pre-send check FAILED for job ${job.job_id}: lease lost during AI generation. Halting send.`);
              return false;
            }
            return true;
          },
        });

        // Handle ambiguous delivery (e.g. timeout / network break / 5xx)
        if (dispatchResult.deliveryStatus === "delivery_unknown") {
          console.warn(`[Telegram AI Worker] Job ${job.job_id} delivery status is delivery_unknown. Halting automatic retry.`);
          await supabase.rpc("complete_telegram_ai_job", {
            p_job_id: job.job_id,
            p_claim_token: workerId,
            p_success: false,
            p_error: dispatchResult.error || "Ambiguous delivery: network timeout / provider 5xx",
            p_status: "delivery_unknown",
          });
          result.failureCount++;
          result.jobDetails.push({ jobId: job.job_id, success: false, error: "delivery_unknown" });
          continue;
        }

        // Handle failed dispatch
        if (dispatchResult.deliveryStatus === "failed") {
          throw new Error(dispatchResult.error || "Telegram outbound send failed");
        }

        // Complete job conditionally on claim_token
        const { data: completeData, error: completeErr } = await supabase.rpc("complete_telegram_ai_job", {
          p_job_id: job.job_id,
          p_claim_token: workerId,
          p_success: true,
        });

        if (completeErr || completeData?.completed === false) {
          throw new Error(`Failed to complete job ${job.job_id}: ${completeErr?.message || completeData?.error || "Token mismatch"}`);
        }

        result.successCount++;
        result.jobDetails.push({ jobId: job.job_id, success: true });
      } catch (jobErr) {
        const errMsg = jobErr instanceof Error ? jobErr.message : String(jobErr);
        console.error(`[Telegram AI Worker] Error processing job ${job.job_id}:`, errMsg);

        await supabase.rpc("complete_telegram_ai_job", {
          p_job_id: job.job_id,
          p_claim_token: workerId,
          p_success: false,
          p_error: errMsg,
        });

        result.failureCount++;
        result.jobDetails.push({ jobId: job.job_id, success: false, error: errMsg });
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      }
    }

    return result;
  } finally {
    if (advisoryLockHeld) {
      try {
        await supabase.rpc("release_telegram_worker_lock", { p_worker_id: workerId });
      } catch (unlockErr) {
        console.warn("[Telegram AI Worker] Advisory lock release warning:", unlockErr);
      }
    }
  }
}
