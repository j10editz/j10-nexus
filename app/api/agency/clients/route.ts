import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  getAgencyClientWorkspaces,
  onboardAgencyClientWorkspace,
} from "@/lib/agency/client-onboarding";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const clients = await getAgencyClientWorkspaces(supabase, context.workspace.id);
    return NextResponse.json({ success: true, clients });
  } catch (error) {
    console.error("GET /api/agency/clients error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch client workspaces.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const body = await req.json().catch(() => ({}));

    if (!body.clientName || typeof body.clientName !== "string") {
      return NextResponse.json(
        { success: false, error: "clientName is required." },
        { status: 400 }
      );
    }

    if (!body.clientContactEmail || typeof body.clientContactEmail !== "string") {
      return NextResponse.json(
        { success: false, error: "clientContactEmail is required." },
        { status: 400 }
      );
    }

    const origin = new URL(req.url).origin;
    const supabase = createServerSupabaseClient();

    const result = await onboardAgencyClientWorkspace(supabase, {
      agencyWorkspaceId: context.workspace.id,
      clientName: body.clientName,
      clientContactName: body.clientContactName || body.clientName,
      clientContactEmail: body.clientContactEmail,
      brandName: body.brandName,
      plan: body.plan,
      billingMode: body.billingMode,
      clientTier: body.clientTier,
      templateSlug: body.templateSlug,
      actorUserId: context.user.id,
      origin,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agency/clients error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to onboard client workspace.",
      },
      { status: 500 }
    );
  }
}
