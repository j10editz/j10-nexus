import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { createTelegramConnectionSession, CURRENT_CONSENT_VERSION } from "@/lib/telegram/connection-session";
import { recordTelegramConnectionConsent } from "@/lib/telegram/consent";
import { getActiveBusinessConnectionForWorkspace } from "@/lib/telegram/business-connections";

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const ws = context.workspace;
    const wsId = ws.id;

    if (ws.status === "past_due" || ws.status === "suspended") {
      return NextResponse.json(
        {
          success: false,
          error: "Your workspace subscription is past due or suspended. Please reactivate billing to connect Telegram.",
        },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const consentVersion = body.consentVersion || CURRENT_CONSENT_VERSION;
    const supabase = createServerSupabaseClient();

    // 1. Record immutable owner consent audit
    await recordTelegramConnectionConsent(supabase, {
      workspaceId: wsId,
      userId: context.user.id,
      consentVersion,
      aiProvider: "google-gemini",
      categoriesProcessed: ["inbound_messages", "contact_metadata", "appointment_requests"],
      retentionDays: 90,
      revocationMethod: "dashboard_disconnect",
    });

    // 2. Generate secure pending connection session
    const session = await createTelegramConnectionSession(supabase, {
      workspaceId: wsId,
      createdByUserId: context.user.id,
      connectionMode: "telegram_business",
      consentVersion,
      botUsername: "j10_nexus_leads_bot",
    });

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      token: session.token,
      shareLink: session.shareLink,
      expiresAt: session.expiresAt,
      consentVersion: session.consentVersion,
    });
  } catch (err: any) {
    console.error("[Telegram Session API] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to initialize connection session." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const activeConnection = await getActiveBusinessConnectionForWorkspace(supabase, context.workspace.id);

    return NextResponse.json({
      success: true,
      connected: !!activeConnection && activeConnection.status === "active",
      connection: activeConnection,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch session status." },
      { status: 500 }
    );
  }
}
