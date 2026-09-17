import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getWhatsAppConnectionStatus } from "@/lib/whatsapp/embedded-signup";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const status = await getWhatsAppConnectionStatus(supabase, context.workspace.id);

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (err: any) {
    console.error("[WhatsApp Status API] Error:", err?.message || err);
    return NextResponse.json(
      { success: false, error: "Failed to load WhatsApp connection status." },
      { status: 500 }
    );
  }
}
