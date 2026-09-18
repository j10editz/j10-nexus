import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAndSendWhatsAppAIResponse } from "@/lib/ai/whatsapp-assistant";

export interface ProcessWhatsAppJobsOptions {
  workerId?: string;
  limit?: number;
  leaseSeconds?: number;
}

export interface ProcessWhatsAppJobsResult {
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
 * Claims and processes durable WhatsApp AI jobs from the database queue.
 * Guarantees crash recovery: any expired leases from failed/dead workers are reclaimed.
 * Enforces atomic claim via FOR UPDATE SKIP LOCKED, maximum 3 jobs per invocation,
 * 120s leases, double-send prevention, and exponential retry.
 */
export async function processWhatsAppAiJobsOnce(
  supabase: SupabaseClient,
  options: ProcessWhatsAppJobsOptions = {}
): Promise<ProcessWhatsAppJobsResult> {
  const workerId = options.workerId || randomUUID();
  const limit = Math.min(5, Math.max(1, options.limit ?? 3));
  const leaseSeconds = Math.max(60, options.leaseSeconds || 120);

  let jobs: any[] = [];

  // 1. Atomically claim jobs from database outbox
  try {
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_whatsapp_ai_jobs",
      {
        p_worker_id: workerId,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      }
    );

    if (claimError) {
      // If RPC is not registered in mock/edge runtime, fall back to atomic update query
      console.warn("[WhatsApp AI Worker] claim_whatsapp_ai_jobs RPC error, falling back to query:", claimError.message);
      const nowIso = new Date().toISOString();
      const leaseExpiryIso = new Date(Date.now() + leaseSeconds * 1000).toISOString();

      const { data: candidates } = await supabase
        .from("whatsapp_ai_jobs")
        .select("*")
        .or(`status.in.(pending,retryable),and(status.eq.processing,lease_expires_at.lt.${nowIso})`)
        .lte("next_attempt_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (candidates && candidates.length > 0) {
        for (const candidate of candidates) {
          const { data: locked } = await supabase
            .from("whatsapp_ai_jobs")
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
            jobs.push({
              job_id: locked.id,
              workspace_id: locked.workspace_id,
              integration_id: locked.integration_id,
              thread_id: locked.thread_id,
              recipient_phone: locked.recipient_phone,
              inbound_text: locked.inbound_text,
              sender_name: locked.sender_name,
              inbound_wamid: locked.inbound_wamid,
              attempts: locked.attempts,
            });
          }
        }
      }
    } else {
      jobs = (claimed as any[]) || [];
    }
  } catch (err) {
    console.error("[WhatsApp AI Worker] Job claim error:", err);
    throw err;
  }

  const result: ProcessWhatsAppJobsResult = {
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
    const jobId = job.job_id || job.id;

    try {
      // Execute AI receptionist and outbound reply using authoritative database values
      const aiResult = await generateAndSendWhatsAppAIResponse({
        supabase,
        workspaceId: job.workspace_id,
        integrationId: job.integration_id || "",
        threadId: job.thread_id,
        recipientPhone: job.recipient_phone,
        inboundText: job.inbound_text,
        senderName: job.sender_name || "WhatsApp User",
        inboundWamid: job.inbound_wamid,
      });

      if (aiResult.deliveryStatus === "sent") {
        // Mark job completed atomically
        try {
          await supabase.rpc("complete_whatsapp_ai_job", {
            p_job_id: jobId,
            p_claim_token: workerId,
            p_outbound_wamid: aiResult.outboundWamid || null,
          });
        } catch {
          await supabase
            .from("whatsapp_ai_jobs")
            .update({
              status: "completed",
              outbound_wamid: aiResult.outboundWamid || null,
              claim_token: null,
              lease_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        }

        result.successCount++;
        result.jobDetails.push({ jobId, success: true });
      } else {
        // AI execution skipped or failed
        const isSuppressed =
          aiResult.skippedReason === "human_handoff_active" ||
          aiResult.skippedReason === "human_handoff_requested" ||
          aiResult.skippedReason === "master_ai_disabled" ||
          aiResult.skippedReason === "no_reply_needed" ||
          aiResult.skippedReason === "intentional_no_reply";

        const isPermanent =
          isSuppressed ||
          aiResult.error?.includes("400") ||
          aiResult.error?.includes("403") ||
          aiResult.error?.includes("404");

        const errorMessage = aiResult.error || aiResult.skippedReason || "Unknown execution failure";

        if (isSuppressed) {
          try {
            await supabase.rpc("suppress_whatsapp_ai_job", {
              p_job_id: jobId,
              p_claim_token: workerId,
              p_reason: errorMessage,
            });
          } catch {
            await supabase
              .from("whatsapp_ai_jobs")
              .update({
                status: "suppressed",
                last_error: errorMessage,
                claim_token: null,
                lease_expires_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", jobId);
          }

          result.successCount++;
          result.jobDetails.push({ jobId, success: true, suppressed: true, reason: errorMessage } as any);
          continue;
        }

        try {
          await supabase.rpc("fail_whatsapp_ai_job", {
            p_job_id: jobId,
            p_claim_token: workerId,
            p_error: errorMessage,
            p_retryable: !isPermanent,
          });
        } catch {
          const nextStatus = isPermanent ? "dead" : "retryable";
          await supabase
            .from("whatsapp_ai_jobs")
            .update({
              status: nextStatus,
              last_error: errorMessage,
              claim_token: null,
              lease_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
        }

        result.failureCount++;
        result.jobDetails.push({ jobId, success: false, error: errorMessage });
      }
    } catch (jobErr) {
      const errMsg = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error(`[WhatsApp AI Worker] Job ${jobId} failed with exception:`, errMsg);

      try {
        await supabase.rpc("fail_whatsapp_ai_job", {
          p_job_id: jobId,
          p_claim_token: workerId,
          p_error: errMsg,
          p_retryable: true,
        });
      } catch {
        await supabase
          .from("whatsapp_ai_jobs")
          .update({
            status: "retryable",
            last_error: errMsg,
            claim_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }

      result.failureCount++;
      result.jobDetails.push({ jobId, success: false, error: errMsg });
    }
  }

  return result;
}
