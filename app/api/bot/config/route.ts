import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getWorkspaceBotConfig } from "@/lib/ai/telegram-assistant";

export async function GET() {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const wsId = context.workspace.id;

    const { config, brandName, isJ10Official } = await getWorkspaceBotConfig(supabase, wsId);

    return NextResponse.json({
      success: true,
      config,
      workspaceName: context.workspace.name,
      brandName,
      isJ10Official,
    });
  } catch (error) {
    console.error("GET /api/bot/config error:", error);
    return NextResponse.json({ success: false, error: "Failed to load bot configuration." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    // Role check: Only owner, admin, or manager can modify bot configuration
    const role = context.membership.role;
    if (role !== "owner" && role !== "admin" && role !== "manager") {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to configure the bot." },
        { status: 403 }
      );
    }

    const wsId = context.workspace.id;
    const body = await req.json();
    const supabase = createServerSupabaseClient();

    const updatePayload = {
      workspace_id: wsId,
      business_name: body.business_name?.trim() || context.workspace.brand_name || context.workspace.name,
      description: body.description?.trim() || "",
      services: Array.isArray(body.services) ? body.services : [],
      pricing_details: body.pricing_details?.trim() || "",
      business_hours: body.business_hours?.trim() || "Mon-Fri 9:00 AM - 6:00 PM",
      faqs: Array.isArray(body.faqs) ? body.faqs : [],
      booking_link: body.booking_link?.trim() || "",
      tone: body.tone || "professional",
      supported_languages: Array.isArray(body.supported_languages) && body.supported_languages.length > 0 ? body.supported_languages : ["English"],
      escalation_instructions: body.escalation_instructions?.trim() || "",
      welcome_message: body.welcome_message?.trim() || "",
      ai_enabled: body.ai_enabled !== false,
      privacy_policy_url: body.privacy_policy_url?.trim() || "",
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await supabase
      .from("bot_configurations")
      .upsert(updatePayload, { onConflict: "workspace_id" })
      .select()
      .single();

    if (error) {
      console.error("Failed to upsert bot configuration:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: saved,
      message: "Bot configuration saved successfully.",
    });
  } catch (error) {
    console.error("POST /api/bot/config error:", error);
    return NextResponse.json({ success: false, error: "Failed to save bot configuration." }, { status: 500 });
  }
}
