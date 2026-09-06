import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  createWorkspaceProposal,
  getWorkspaceProposals,
  type ProposalStatus,
} from "@/lib/revenue/proposals";

export async function GET(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as ProposalStatus | null;
    const contactId = searchParams.get("contactId") || undefined;

    const supabase = createServerSupabaseClient();
    const proposals = await getWorkspaceProposals(supabase, context.workspace.id, {
      status: status || undefined,
      contactId,
    });

    return NextResponse.json({ success: true, proposals });
  } catch (error) {
    console.error("GET /api/crm/proposals error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch proposals.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("agent");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const body = await req.json().catch(() => ({}));

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json(
        { success: false, error: "title is required." },
        { status: 400 }
      );
    }

    const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
    if (lineItems.length === 0 && (typeof body.amount !== "number" || body.amount <= 0)) {
      return NextResponse.json(
        { success: false, error: "Either non-empty lineItems or a positive amount must be provided." },
        { status: 400 }
      );
    }

    const origin = new URL(req.url).origin;
    const supabase = createServerSupabaseClient();

    const proposal = await createWorkspaceProposal(supabase, {
      workspaceId: context.workspace.id,
      contactId: body.contactId || null,
      threadId: body.threadId || null,
      title: body.title,
      description: body.description,
      lineItems,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      currency: body.currency,
      validDays: typeof body.validDays === "number" ? body.validDays : undefined,
      origin,
      actorUserId: context.user.id,
    });

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error("POST /api/crm/proposals error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create proposal.",
      },
      { status: 500 }
    );
  }
}
