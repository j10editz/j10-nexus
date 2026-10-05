import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { replayDeadLetterEvent } from "./dlq";
import { writeIntegrationOperationLog } from "./observability";

export interface DlqSweepOptions {
  limit?: number;
  now?: string;
}

export interface DlqSweepResult {
  totalScanned: number;
  replayedCount: number;
  succeededCount: number;
  failedCount: number;
  exhaustedCount: number;
  events: Array<{
    id: string;
    provider: string;
    attempt: number;
    success: boolean;
    exhausted: boolean;
    error?: string;
  }>;
}

/**
 * Sweeps the dead-letter queue for retryable webhook events whose next retry window has elapsed.
 * Applies exponential backoff and caps retries at max_attempts.
 */
export async function sweepDeadLetterQueueOnce(
  supabase: SupabaseClient,
  options?: DlqSweepOptions
): Promise<DlqSweepResult> {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 25);
  const now = options?.now || new Date().toISOString();

  // Find retryable events ready for execution
  const { data: candidates, error } = await supabase
    .from("integration_webhook_events")
    .select("id, user_id, provider, event_type, attempt_count, max_attempts, retryable, next_retry_at")
    .eq("retryable", true)
    .eq("processing_status", "failed")
    .lte("next_retry_at", now)
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  if (error || !candidates || candidates.length === 0) {
    return {
      totalScanned: 0,
      replayedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      exhaustedCount: 0,
      events: [],
    };
  }

  const results: DlqSweepResult["events"] = [];
  let succeeded = 0;
  let failed = 0;
  let exhausted = 0;

  for (const candidate of candidates) {
    const currentAttempt = candidate.attempt_count || 0;
    const maxAttempts = candidate.max_attempts || 5;

    // If candidate has already hit or exceeded max attempts, mark exhausted
    if (currentAttempt >= maxAttempts) {
      await supabase
        .from("integration_webhook_events")
        .update({
          retryable: false,
          last_error_at: now,
          failure_message: `Auto-retry attempts exhausted (${currentAttempt}/${maxAttempts}). Moved to permanent dead-letter backlog.`,
        })
        .eq("id", candidate.id);

      await writeIntegrationOperationLog(supabase, {
        userId: candidate.user_id,
        integrationId: candidate.id,
        providerId: candidate.provider,
        source: "webhook",
        eventType: `dlq.exhausted.${candidate.event_type}`,
        severity: "error",
        status: "exhausted",
        correlationId: `dlq_exhaust_${candidate.id}`,
        webhookEventId: candidate.id,
        attempt: currentAttempt,
        maxAttempts,
        retryable: false,
        errorCode: "DLQ_ATTEMPTS_EXHAUSTED",
        message: `Webhook event retry exhausted after ${currentAttempt} attempts.`,
      });

      exhausted++;
      results.push({
        id: candidate.id,
        provider: candidate.provider,
        attempt: currentAttempt,
        success: false,
        exhausted: true,
        error: "Max retry attempts exceeded",
      });
      continue;
    }

    // Replay candidate event
    const replayOutcome = await replayDeadLetterEvent(
      supabase,
      candidate.user_id,
      candidate.id
    );

    const isSuccess = replayOutcome.success;
    const nextAttempt = replayOutcome.attemptCount;
    const isExhausted = !isSuccess && nextAttempt >= maxAttempts;

    if (isSuccess) {
      succeeded++;
    } else {
      failed++;
      if (isExhausted) {
        exhausted++;
      } else {
        // Schedule next exponential backoff retry window
        const delaySeconds = Math.min(2 ** nextAttempt * 2, 60);
        const nextRetryDate = new Date(Date.now() + delaySeconds * 1000).toISOString();

        await supabase
          .from("integration_webhook_events")
          .update({
            next_retry_at: nextRetryDate,
            retryable: true,
          })
          .eq("id", candidate.id);
      }
    }

    results.push({
      id: candidate.id,
      provider: candidate.provider,
      attempt: nextAttempt,
      success: isSuccess,
      exhausted: isExhausted,
      error: replayOutcome.error,
    });
  }

  return {
    totalScanned: candidates.length,
    replayedCount: candidates.length,
    succeededCount: succeeded,
    failedCount: failed,
    exhaustedCount: exhausted,
    events: results,
  };
}
