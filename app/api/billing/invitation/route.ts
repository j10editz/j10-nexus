import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getFounders3SlotStatus, hashInvitationCode } from "@/lib/billing/invitations";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { context, error } = await requireApiWorkspaceContext("viewer");
    if (error) {
      return error;
    }

    const body = await request.json().catch(() => ({}));
    const invitationCode = String(body.invitationCode || "").trim();

    if (!invitationCode) {
      return NextResponse.json(
        { success: false, error: "Invitation code is required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const wsId = context.workspace.id;
    const codeHash = hashInvitationCode(invitationCode);

    // 1. Fetch invitation record by SHA-256 hash
    const { data: invitation, error: invErr } = await supabase
      .from("founders3_invitations")
      .select("*")
      .eq("invitation_code_hash", codeHash)
      .maybeSingle();

    if (invErr || !invitation) {
      return NextResponse.json(
        { success: false, error: "Invalid invitation code. Please verify your code and try again." },
        { status: 404 }
      );
    }

    // 2. Validate workspace ownership
    if (invitation.workspace_id !== wsId) {
      return NextResponse.json(
        {
          success: false,
          error: "This single-use invitation is scoped to a different business workspace and cannot be transferred.",
        },
        { status: 403 }
      );
    }

    // 3. Validate status & expiration
    if (invitation.status !== "active" || invitation.used_count >= invitation.max_uses) {
      return NextResponse.json(
        { success: false, error: "This Founder's 3 invitation code has already been redeemed." },
        { status: 400 }
      );
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: "This Founder's 3 invitation code has expired." },
        { status: 400 }
      );
    }

    // 4. Fetch live slot status
    const slotStatus = await getFounders3SlotStatus(supabase, wsId);

    return NextResponse.json({
      success: true,
      valid: true,
      invitation: {
        id: invitation.id,
        workspaceId: invitation.workspace_id,
        status: invitation.status,
        expiresAt: invitation.expires_at,
      },
      slotStatus,
    });
  } catch (err: any) {
    console.error("Founder's 3 invitation validation error:", err?.message || "Internal error");
    return NextResponse.json(
      { success: false, error: "Failed to validate invitation code." },
      { status: 500 }
    );
  }
}
