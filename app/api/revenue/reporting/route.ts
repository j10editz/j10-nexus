import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { getWorkspaceExecutiveRevenueReport } from "@/lib/revenue/executive-reporting";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const report = await getWorkspaceExecutiveRevenueReport(
      supabase,
      context.workspace.id
    );

    return NextResponse.json(
      { success: true, report },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/revenue/reporting error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to compute executive revenue report.",
      },
      { status: 500 }
    );
  }
}
