import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { processTelegramAiJobsOnce } from "@/lib/telegram/ai-worker";

export const dynamic = "force-dynamic";

/**
 * Validates worker invocation against TELEGRAM_WORKER_SECRET using constant-time comparison.
 * Strictly rejects missing tokens, incorrect tokens, and normal browser/workspace sessions.
 * Never falls back to SUPABASE_SERVICE_ROLE_KEY, Telegram tokens, or Gemini keys.
 */
function verifyWorkerAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  const workerSecret = process.env.TELEGRAM_WORKER_SECRET?.trim();

  // If TELEGRAM_WORKER_SECRET is not configured or empty, reject immediately to prevent unauthorized runs
  if (!workerSecret) {
    return false;
  }

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

    const supabase = createWebhookServiceClient();
    const result = await processTelegramAiJobsOnce(supabase, {
      limit: 3, // Strict invariant: maximum 3 claimed jobs per invocation
      leaseSeconds: 120, // Strict invariant: lease duration of at least 120 seconds
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[Telegram AI Worker Route] Execution error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET: Supported for cron invokers.
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
