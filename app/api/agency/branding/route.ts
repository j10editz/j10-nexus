import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getWorkspaceBranding, updateWorkspaceBranding } from "@/lib/agency/branding";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const branding = await getWorkspaceBranding(supabase, context.workspace.id);
    return NextResponse.json({ success: true, branding });
  } catch (error) {
    console.error("GET /api/agency/branding error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch branding.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();
    const body = await req.json().catch(() => ({}));

    const branding = await updateWorkspaceBranding(
      supabase,
      context.workspace.id,
      body,
      context.workspace.plan
    );

    return NextResponse.json({ success: true, branding });
  } catch (error) {
    console.error("PUT /api/agency/branding error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update branding.",
      },
      { status: 400 }
    );
  }
}
