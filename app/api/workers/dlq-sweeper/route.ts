import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createWebhookServiceClient } from "@/lib/integrations/webhooks/service-client";
import { sweepDeadLetterQueueOnce } from "@/lib/integrations/dlq-sweeper";

export const dynamic = "force-dynamic";

/**
 * Validates worker invocation against CRON_SECRET / DLQ_WORKER_SECRET / WHATSAPP_WORKER_SECRET using constant-time comparison.
 */
function verifyWorkerAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  const workerSecret = (
    process.env.CRON_SECRET ||
    process.env.DLQ_WORKER_SECRET ||
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

export async function POST(request: Request) {
  try {
    if (!verifyWorkerAuth(request)) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing worker authentication token" },
        { status: 401 }
      );
    }

    const supabase = createWebhookServiceClient();
    const result = await sweepDeadLetterQueueOnce(supabase, { limit: 10 });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[DLQ Sweeper Worker Route] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
