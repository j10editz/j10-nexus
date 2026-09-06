import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  processInboundWhatsAppRevenueLoop,
  reconcileRevenueLoopPayment,
} from "@/lib/revenue/loop-orchestrator";

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action || "inbound_lead";

    if (action === "inbound_lead") {
      const {
        senderPhone,
        customerName,
        company,
        message,
        autoProposalThreshold,
      } = body;

      if (!senderPhone || typeof senderPhone !== "string") {
        return NextResponse.json(
          { success: false, error: "senderPhone is required." },
          { status: 400 }
        );
      }

      if (!message || typeof message !== "string") {
        return NextResponse.json(
          { success: false, error: "message is required." },
          { status: 400 }
        );
      }

      const origin = new URL(req.url).origin;
      const result = await processInboundWhatsAppRevenueLoop(supabase, {
        workspaceId: context.workspace.id,
        senderPhone,
        customerName,
        company,
        message,
        origin,
        actorUserId: context.user.id,
        autoProposalThreshold,
      });

      return NextResponse.json({
        success: true,
        action: "inbound_lead_processed",
        result,
      });
    }

    if (action === "reconcile_payment") {
      const { checkoutId, providerEventId, amount } = body;

      if (!checkoutId || typeof checkoutId !== "string") {
        return NextResponse.json(
          { success: false, error: "checkoutId is required." },
          { status: 400 }
        );
      }

      // Explicitly disallow browser requests supplying an amount or event ID to verify payments
      if (amount !== undefined || providerEventId !== undefined) {
        return NextResponse.json(
          {
            success: false,
            error: "Security violation: Browser requests supplying an amount or event ID cannot mark payments verified. Verification must occur through authoritative provider webhooks or server-side provider lookup.",
          },
          { status: 403 }
        );
      }

      // Lookup checkout record
      const { data: checkout, error: checkoutErr } = await supabase
        .from("payment_checkouts")
        .select("*")
        .eq("id", checkoutId)
        .eq("workspace_id", context.workspace.id)
        .single();

      if (checkoutErr || !checkout) {
        return NextResponse.json(
          { success: false, error: "Checkout record not found in workspace." },
          { status: 404 }
        );
      }

      // If already paid, return reconciled state idempotently
      if (checkout.status === "paid") {
        const { data: existingLedger } = await supabase
          .from("payment_ledger")
          .select("id")
          .eq("checkout_id", checkout.id)
          .eq("workspace_id", context.workspace.id)
          .maybeSingle();

        return NextResponse.json({
          success: true,
          action: "payment_already_reconciled",
          result: {
            success: true,
            ledgerId: existingLedger?.id,
            checkoutId: checkout.id,
            dealStage: "won",
          },
        });
      }

      // If Stripe secret key is present, verify directly against Stripe API
      const secretKey = process.env.STRIPE_SECRET_KEY;
      let authoritativeEventId: string | undefined;

      if (secretKey && secretKey.startsWith("sk_") && checkout.stripe_checkout_session_id) {
        try {
          const res = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${checkout.stripe_checkout_session_id}`,
            {
              headers: { Authorization: `Bearer ${secretKey}` },
            }
          );
          const session = await res.json();
          if (!res.ok || session.payment_status !== "paid") {
            return NextResponse.json(
              {
                success: false,
                error: "Stripe checkout session has not been completed or verified.",
              },
              { status: 400 }
            );
          }
          authoritativeEventId = session.payment_intent || session.id;
        } catch (err) {
          return NextResponse.json(
            {
              success: false,
              error: `Failed to verify checkout session with Stripe: ${err instanceof Error ? err.message : String(err)}`,
            },
            { status: 502 }
          );
        }
      } else {
        // In production, reject unverified provider reconciliations
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json(
            {
              success: false,
              error: "Stripe verification is not available in production without provider credentials.",
            },
            { status: 403 }
          );
        }
      }

      const result = await reconcileRevenueLoopPayment(supabase, {
        workspaceId: context.workspace.id,
        checkoutId: checkout.id,
        providerEventId: authoritativeEventId,
      });

      return NextResponse.json({
        success: true,
        action: "payment_reconciled",
        result,
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action '${action}'. Expected 'inbound_lead' or 'reconcile_payment'.` },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/revenue/loop error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Revenue loop orchestration failed.",
      },
      { status: 500 }
    );
  }
}
