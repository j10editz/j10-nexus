import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

export async function DELETE(
  _request: Request,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const { id } = await routeContext.params;

    const { error } = await supabase
      .from("workforce_members")
      .delete()
      .eq("id", id)
      .eq("workspace_id", context.workspace.id);

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to remove team member." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Team member removed from workforce directory.",
    });
  } catch (error) {
    console.error("Workforce DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Error deleting workforce member." },
      { status: 500 }
    );
  }
}
