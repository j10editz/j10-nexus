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

    // Atomic RPC provisioning only (no non-atomic fallback direct inserts)
    const { data: rpcData, error: rpcError } = await supabase.rpc("provision_workspace", {
      p_name: trimmedName,
      p_slug: slug,
      p_brand_name: brandName?.trim() || trimmedName,
      p_accent_color: accentColor,
      p_workspace_type: safeWorkspaceType,
      p_plan: safePlan,
    });

    if (rpcError || !rpcData?.workspace || !rpcData?.membership) {
      console.error("Atomic workspace provisioning failure:", rpcError);
      return NextResponse.json(
        {
          success: false,
          error: rpcError?.message || "Failed to provision workspace atomically.",
        },
        { status: 500 }
      );
    }

    newWs = rpcData.workspace;
    membership = rpcData.membership;

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
