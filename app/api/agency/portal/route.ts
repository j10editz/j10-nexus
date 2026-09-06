import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getClientPortalData } from "@/lib/agency/portal";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const portal = await getClientPortalData(supabase, context.workspace.id);
    return NextResponse.json({ success: true, portal });
  } catch (error) {
    console.error("GET /api/agency/portal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load client portal data.",
      },
      { status: 500 }
    );
  }
}
