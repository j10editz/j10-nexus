import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createAdminSupabaseClient } from "@/lib/auth";
import { getWhatsAppConnectionStatus } from "@/lib/whatsapp/embedded-signup";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    // Privileged client allows any authorized workspace member to read the integration status,
    // avoiding user-scoped RLS policies that would otherwise hide integrations created by other admins.
    const adminSupabase = createAdminSupabaseClient();
    const status = await getWhatsAppConnectionStatus(adminSupabase, context.workspace.id);

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (err: any) {
    console.error("[WhatsApp Status API] stage: get_status code:", err?.code || "STATUS_FAILED");
    return NextResponse.json(
      { success: false, error: "Failed to load WhatsApp connection status." },
      { status: 500 }
    );
  }
}
