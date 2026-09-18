import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createAdminSupabaseClient } from "@/lib/auth";
import {
  createWhatsAppConnectionSession,
  META_WHATSAPP_CALLBACK_URL,
  META_WHATSAPP_GRAPH_API_VERSION,
} from "@/lib/whatsapp/embedded-signup";

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

    // Validate Meta App ID and Configuration ID BEFORE inserting a session
    const appId =
      process.env.NEXT_PUBLIC_META_APP_ID?.trim() ||
      process.env.META_WHATSAPP_APP_ID?.trim() ||
      process.env.META_APP_ID?.trim() ||
      "";

    const configId =
      process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID?.trim() ||
      process.env.META_WHATSAPP_CONFIG_ID?.trim() ||
      "";

    if (!appId || !configId) {
      console.warn("[WhatsApp Session API] Meta configuration missing: appId or configId not set");
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp connection is not configured on the server. Please configure Meta App ID and Configuration ID.",
          code: "META_CONFIGURATION_MISSING",
        },
        { status: 503 }
      );
    }

    // Privileged client is used ONLY AFTER canonical authorization has verified owner/admin role AND Meta is configured
    const adminSupabase = createAdminSupabaseClient();
    const session = await createWhatsAppConnectionSession(adminSupabase, {
      workspaceId: ws.id,
      userId: context.user.id,
    });

    return NextResponse.json({
      success: true,
      state: session.token,
      expiresAt: session.expiresAt,
      appId,
      configId,
      graphVersion: META_WHATSAPP_GRAPH_API_VERSION,
      callbackUrl: META_WHATSAPP_CALLBACK_URL,
    });
  } catch (err: any) {
    console.error("[WhatsApp Session API] error stage: session_init code:", err?.code || "SESSION_INIT_ERROR");
    return NextResponse.json(
      { success: false, error: "Failed to initialize WhatsApp connection session." },
      { status: 500 }
    );
  }
}
