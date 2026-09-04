import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACTIVE_WORKSPACE_COOKIE,
  getActiveWorkspaceContext,
  getUserWorkspaces,
} from "@/lib/workspaces/server";
import { createServerSupabaseClient, getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const context = await getActiveWorkspaceContext();
    const workspaces = await getUserWorkspaces(user.id);

    return NextResponse.json({
      success: true,
      activeWorkspace: context?.workspace || null,
      role: context?.membership?.role || null,
      workspaces,
    });
  } catch (error) {
    console.error("GET /api/workspaces error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve workspaces." },
      { status: 500 }
    );
  }
}

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
    const {
      name,
      brandName,
      plan = "growth",
      workspaceType = "client",
      accentColor = "#3B82F6",
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Workspace name is required." },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const slug = `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;

    const supabase = createServerSupabaseClient();

    // 1. Create workspace
    const { data: newWs, error: wsError } = await supabase
      .from("workspaces")
      .insert({
        name: trimmedName,
        slug,
        workspace_type: workspaceType,
        plan,
        status: "active",
        brand_name: brandName?.trim() || trimmedName,
        accent_color: accentColor,
        owner_user_id: user.id,
      })
      .select("*")
      .single();

    if (wsError || !newWs) {
      console.error("Workspace insertion error:", wsError);
      return NextResponse.json(
        { success: false, error: "Failed to create workspace." },
        { status: 500 }
      );
    }

    // 2. Add creator as owner membership
    const { data: membership, error: memError } = await supabase
      .from("workspace_memberships")
      .insert({
        workspace_id: newWs.id,
        user_id: user.id,
        role: "owner",
        status: "active",
      })
      .select("*")
      .single();

    if (memError) {
      console.error("Membership insertion error:", memError);
      return NextResponse.json(
        { success: false, error: "Failed to assign workspace ownership." },
        { status: 500 }
      );
    }

    // 3. Switch active workspace to newly created one
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, newWs.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({
      success: true,
      workspace: newWs,
      membership,
    });
  } catch (error) {
    console.error("POST /api/workspaces error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}
