import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  processStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe-webhook";
import { createAdminSupabaseClient } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      const verification = verifyStripeWebhookSignature({
        rawBody,
        signatureHeader: signature,
        secret: webhookSecret,
      });

      if (!verification.valid) {
        return NextResponse.json(
          { error: verification.error || "Invalid Stripe signature." },
          { status: 400 }
        );
      }
    } else {
      const isDev =
        process.env.NODE_ENV !== "production" ||
        process.env.J10_AI_MODE === "development";
      if (!isDev) {
        return NextResponse.json(
          { error: "STRIPE_WEBHOOK_SECRET is not configured." },
          { status: 500 }
        );
      }
      console.warn(
        "Stripe webhook invoked without STRIPE_WEBHOOK_SECRET in development/test mode."
      );
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    if (!event || typeof event.type !== "string" || !event.data?.object) {
      return NextResponse.json(
        { error: "Malformed Stripe event object." },
        { status: 400 }
      );
    }

    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const supabase = createAdminSupabaseClient();
    const result = await processStripeWebhookEvent(supabase, event, payloadHash);

    if (!result.processed && result.error) {
      return NextResponse.json(
        {
          received: false,
          error: result.error,
          action: result.action,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      received: true,
      eventType: event.type,
      action: result.action,
      idempotent: result.idempotent || false,
      checkoutId: result.checkoutId,
      ledgerId: result.ledgerId,
      subscriptionId: result.subscriptionId,
    });
  } catch (error) {
    const sanitizedMessage =
      error instanceof Error ? error.message : "Stripe webhook internal processing error.";
    console.error("Stripe webhook processing error:", sanitizedMessage);

    return NextResponse.json(
      { error: "Stripe webhook internal processing error." },
      { status: 500 }
    );
  }
}
