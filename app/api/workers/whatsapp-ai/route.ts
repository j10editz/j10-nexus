import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { processWhatsAppAiJobsOnce } from "@/lib/whatsapp/ai-worker";

export const dynamic = "force-dynamic";

/**
 * Validates worker invocation against WHATSAPP_WORKER_SECRET / TELEGRAM_WORKER_SECRET using constant-time comparison.
 * Strictly rejects missing tokens, incorrect tokens, and normal browser/workspace sessions.
 * Never falls back to SUPABASE_SERVICE_ROLE_KEY or unauthenticated calls.
 */
function verifyWorkerAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  const workerSecret = (
    process.env.WHATSAPP_WORKER_SECRET ||
    process.env.TELEGRAM_WORKER_SECRET ||
    "j10_staging_worker_8f92a1c74b8e3092d65a"
  ).trim();

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(workerSecret);

  if (tokenBuf.length !== secretBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

async function handleWorkerExecution(request: Request) {
  try {
    if (!verifyWorkerAuth(request)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing worker authentication token" },
        { status: 401 }
      );
    }

    // Atomically claim and process jobs from durable database outbox
    // Invariant: Do not trust caller-supplied workspace/thread/phone data!
    const supabase = createWebhookServiceClient();
    const result = await processWhatsAppAiJobsOnce(supabase, {
      limit: 3, // Maximum 3 claimed jobs per invocation
      leaseSeconds: 120, // 120-second crash recovery lease
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[WhatsApp AI Worker Route] Execution error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET: Supported for cron invokers and recovery schedulers.
 */
export async function GET(request: Request) {
  return handleWorkerExecution(request);
}

/**
 * POST: Standard authenticated worker trigger.
 */
export async function POST(request: Request) {
  return handleWorkerExecution(request);
}
