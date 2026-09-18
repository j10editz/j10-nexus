import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { calculateBeautyMetrics } from "@/lib/beauty/conversion-service";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) return auth.error;

    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const metrics = await calculateBeautyMetrics(supabase, wsContext.workspace.id);

    return NextResponse.json(
      { success: true, metrics },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to calculate metrics";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
