import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  processStripeSubscriptionEvent,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe-webhook";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

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
      // If no secret configured and running in development, allow testing
      const isDev = process.env.NODE_ENV !== "production" || process.env.J10_AI_MODE === "development";
      if (!isDev) {
        return NextResponse.json(
          { error: "STRIPE_WEBHOOK_SECRET is not configured." },
          { status: 500 }
        );
      }
      console.warn("Stripe webhook invoked without STRIPE_WEBHOOK_SECRET in development mode.");
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

    const supabase = getServiceSupabase();
    const result = await processStripeSubscriptionEvent(supabase, event);

    return NextResponse.json({
      received: true,
      eventType: event.type,
      action: result.action,
      subscriptionId: result.subscriptionId,
    });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe webhook internal processing error.",
      },
      { status: 500 }
    );
  }
}
