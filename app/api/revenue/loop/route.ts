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
      const { checkoutId, providerEventId, amount, currency } = body;

      if (!checkoutId || typeof checkoutId !== "string") {
        return NextResponse.json(
          { success: false, error: "checkoutId is required." },
          { status: 400 }
        );
      }

      const result = await reconcileRevenueLoopPayment(supabase, {
        workspaceId: context.workspace.id,
        checkoutId,
        providerEventId,
        amount: typeof amount === "number" ? amount : undefined,
        currency,
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
