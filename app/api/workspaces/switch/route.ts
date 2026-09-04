import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspaces/server";
import { createServerSupabaseClient, getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { workspaceId } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { success: false, error: "workspaceId is required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify membership in database - never trust client assertion alone
    const { data: membership, error } = await supabase
      .from("workspace_memberships")
      .select("id, workspace_id, user_id, role, status, workspace:workspaces(*)")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .maybeSingle();

    if (error || !membership || !membership.workspace) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not hold an active membership in this workspace.",
        },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({
      success: true,
      activeWorkspace: membership.workspace,
      role: membership.role,
    });
  } catch (error) {
    console.error("POST /api/workspaces/switch error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
