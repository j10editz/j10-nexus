import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { createWhatsAppConnectionSession } from "@/lib/whatsapp/embedded-signup";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only workspace owners and admins can initiate WhatsApp onboarding." },
        { status: 403 }
      );
    }

    const ws = context.workspace;
    if (ws.status === "past_due" || ws.status === "suspended") {
      return NextResponse.json(
        {
          success: false,
          error: "Your workspace subscription is past due or suspended. Please reactivate billing to connect WhatsApp.",
        },
        { status: 402 }
      );
    }

    const supabase = createServerSupabaseClient();
    const session = await createWhatsAppConnectionSession(supabase, {
      workspaceId: ws.id,
      userId: context.user.id,
    });

    const appId =
      process.env.NEXT_PUBLIC_META_APP_ID?.trim() ||
      process.env.META_WHATSAPP_APP_ID?.trim() ||
      process.env.META_APP_ID?.trim() ||
      "";

    const configId =
      process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID?.trim() ||
      process.env.META_WHATSAPP_CONFIG_ID?.trim() ||
      "";

    return NextResponse.json({
      success: true,
      state: session.token,
      expiresAt: session.expiresAt,
      appId,
      configId,
    });
  } catch (err: any) {
    console.error("[WhatsApp Session API] Error:", err?.message || err);
    return NextResponse.json(
      { success: false, error: "Failed to initialize WhatsApp connection session." },
      { status: 500 }
    );
  }
}
