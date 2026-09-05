import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACTIVE_WORKSPACE_COOKIE,
  getActiveWorkspaceContext,
  getUserWorkspaces,
  getUserPlatformRole,
  getUserProfile,
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

    const [context, workspaces, platformRole, profile] = await Promise.all([
      getActiveWorkspaceContext(),
      getUserWorkspaces(user.id),
      getUserPlatformRole(user.id),
      getUserProfile(user.id),
    ]);

    return NextResponse.json({
      success: true,
      activeWorkspace: context?.workspace || null,
      role: context?.membership?.role || null,
      platformRole,
      profile,
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

    // Verify platform privileges before permitting agency_master creation
    const platformRole = await getUserPlatformRole(user.id);
    const isPlatformAdmin = platformRole === "platform_founder" || platformRole === "platform_admin";

    const safeWorkspaceType = isPlatformAdmin && workspaceType === "agency_master" ? "agency_master" : "client";
    const safePlan = isPlatformAdmin ? plan : (["starter", "growth"].includes(plan) ? plan : "growth");

    const trimmedName = name.trim();
    const slug = `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;

    const supabase = createServerSupabaseClient();

    let newWs: any = null;
    let membership: any = null;

    // 1. Attempt atomic RPC provisioning first
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("provision_workspace", {
        p_name: trimmedName,
        p_slug: slug,
        p_brand_name: brandName?.trim() || trimmedName,
        p_accent_color: accentColor,
        p_workspace_type: safeWorkspaceType,
        p_plan: safePlan,
      });

      if (!rpcError && rpcData?.workspace && rpcData?.membership) {
        newWs = rpcData.workspace;
        membership = rpcData.membership;
      }
    } catch {
      // Fall through to standard insert
    }

    // 2. Direct fallback insert if RPC not present
    if (!newWs) {
      const { data: createdWs, error: wsError } = await supabase
        .from("workspaces")
        .insert({
          name: trimmedName,
          slug,
          workspace_type: safeWorkspaceType,
          plan: safePlan,
          status: "active",
          brand_name: brandName?.trim() || trimmedName,
          accent_color: accentColor,
          owner_user_id: user.id,
        })
        .select("*")
        .single();

      if (wsError || !createdWs) {
        console.error("Workspace insertion error:", wsError);
        return NextResponse.json(
          { success: false, error: "Failed to create workspace." },
          { status: 500 }
        );
      }
      newWs = createdWs;

      const { data: createdMem, error: memError } = await supabase
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
      membership = createdMem;
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
