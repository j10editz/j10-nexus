import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createAdminSupabaseClient } from "@/lib/auth";
import { disconnectWhatsAppIntegration } from "@/lib/whatsapp/embedded-signup";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only workspace owners and admins can disconnect WhatsApp." },
        { status: 403 }
      );
    }

    const wsId = context.workspace.id;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Disconnected via J10 NEXUS Connections dashboard";

    // Privileged client used strictly after owner/admin authorization
    const adminSupabase = createAdminSupabaseClient();
    await disconnectWhatsAppIntegration(adminSupabase, wsId, reason);

    return NextResponse.json({
      success: true,
      message: "WhatsApp integration has been disconnected safely. All historical Inbox, CRM, and message data are preserved.",
    });
  } catch (err: any) {
    console.error("[WhatsApp Disconnect API] stage: disconnect code:", err?.code || "DISCONNECT_FAILED");
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to disconnect WhatsApp integration." },
      { status: 500 }
    );
  }
}
