import { cookies } from "next/headers";
import { createServerSupabaseClient, getCurrentUser, createAdminSupabaseClient } from "@/lib/auth";

export const ACTIVE_WORKSPACE_COOKIE = "j10_active_workspace_id";

export type WorkspaceRole = "owner" | "admin" | "manager" | "agent" | "viewer";

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  workspace_type: "agency_master" | "client";
  plan: "starter" | "growth" | "enterprise";
  status: "active" | "trial" | "past_due" | "suspended";
  brand_name: string;
  accent_color: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMembershipRecord {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: "active" | "invited" | "suspended";
  created_at: string;
  updated_at: string;
  workspace?: WorkspaceRecord;
}

export interface ActiveWorkspaceContext {
  workspace: WorkspaceRecord;
  membership: WorkspaceMembershipRecord;
  user: {
    id: string;
    email?: string;
  };
}

export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  viewer: 10,
  agent: 20,
  manager: 30,
  admin: 40,
  owner: 50,
};

export function hasMinimumRole(userRole: WorkspaceRole, minimumRole: WorkspaceRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 0);
}

/**
 * Resolves the authenticated user and their active workspace membership.
 * Validates that the active workspace requested via cookie actually belongs to the user.
 * Never trusts client-supplied workspace IDs without database membership verification.
 */
export async function getActiveWorkspaceContext(): Promise<ActiveWorkspaceContext | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const cookieStore = await cookies();
  const requestedWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  const supabase = createServerSupabaseClient();

  // 1. If a workspace cookie is set, verify active membership
  if (requestedWorkspaceId) {
    const { data: membership, error } = await supabase
      .from("workspace_memberships")
      .select("id, workspace_id, user_id, role, status, created_at, updated_at, workspace:workspaces(*)")
      .eq("user_id", user.id)
      .eq("workspace_id", requestedWorkspaceId)
      .eq("status", "active")
      .maybeSingle();

    if (!error && membership && membership.workspace) {
      return {
        workspace: membership.workspace as unknown as WorkspaceRecord,
        membership: {
          id: membership.id,
          workspace_id: membership.workspace_id,
          user_id: membership.user_id,
          role: membership.role as WorkspaceRole,
          status: membership.status,
          created_at: membership.created_at,
          updated_at: membership.updated_at,
        },
        user: {
          id: user.id,
          email: user.email,
        },
      };
    }
  }

  // 2. If cookie was unset or invalid, query all active memberships for user
  const { data: memberships } = await supabase
    .from("workspace_memberships")
    .select("id, workspace_id, user_id, role, status, created_at, updated_at, workspace:workspaces(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (memberships && memberships.length > 0 && memberships[0].workspace) {
    const primary = memberships[0];
    const ws = primary.workspace as unknown as WorkspaceRecord;

    // Save to cookie
    try {
      cookieStore.set(ACTIVE_WORKSPACE_COOKIE, ws.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    } catch {
      // Ignore cookie write errors in read-only render contexts
    }

    return {
      workspace: ws,
      membership: {
        id: primary.id,
        workspace_id: primary.workspace_id,
        user_id: primary.user_id,
        role: primary.role as WorkspaceRole,
        status: primary.status,
        created_at: primary.created_at,
        updated_at: primary.updated_at,
      },
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  // 3. User has no workspaces: provision initial canonical "J10 NEXUS HQ" workspace
  const adminClient = createAdminSupabaseClient();
  const baseSlug = "j10-nexus-hq";
  const slug = `${baseSlug}-${user.id.slice(0, 8)}`;
  const workspaceName = "J10 NEXUS HQ";

  // Attempt atomic database RPC first
  try {
    const { data: rpcData, error: rpcError } = await adminClient.rpc("provision_workspace", {
      p_name: workspaceName,
      p_slug: slug,
      p_brand_name: workspaceName,
      p_accent_color: "#3B82F6",
      p_workspace_type: "agency_master",
      p_plan: "enterprise",
    });

    if (!rpcError && rpcData?.workspace && rpcData?.membership) {
      const ws = rpcData.workspace as WorkspaceRecord;
      const mem = rpcData.membership as WorkspaceMembershipRecord;

      try {
        cookieStore.set(ACTIVE_WORKSPACE_COOKIE, ws.id, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
      } catch {
        // Ignore cookie write errors in read-only render contexts
      }

      return {
        workspace: ws,
        membership: mem,
        user: { id: user.id, email: user.email },
      };
    }
  } catch {
    // Fall back to direct atomic insert if RPC is not present
  }

  // Fallback direct insert
  const { data: newWs, error: wsError } = await adminClient
    .from("workspaces")
    .insert({
      name: workspaceName,
      slug,
      workspace_type: "agency_master",
      plan: "enterprise",
      status: "active",
      brand_name: workspaceName,
      accent_color: "#3B82F6",
      owner_user_id: user.id,
    })
    .select("*")
    .single();

  if (wsError || !newWs) {
    console.error("Failed to provision default workspace for user:", wsError);
    return null;
  }

  const { data: newMem, error: memError } = await adminClient
    .from("workspace_memberships")
    .insert({
      workspace_id: newWs.id,
      user_id: user.id,
      role: "owner",
      status: "active",
    })
    .select("*")
    .single();

  if (memError || !newMem) {
    console.error("Failed to create membership for user workspace:", memError);
    return null;
  }

  try {
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, newWs.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch {
    // Ignore cookie write errors in read-only render contexts
  }

  return {
    workspace: newWs as WorkspaceRecord,
    membership: newMem as WorkspaceMembershipRecord,
    user: {
      id: user.id,
      email: user.email,
    },
  };
}

/**
 * Returns all active workspaces the user belongs to.
 */
export async function getUserWorkspaces(userId: string): Promise<Array<WorkspaceRecord & { role: WorkspaceRole }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workspace_memberships")
    .select("role, workspace:workspaces(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data
    .filter((item) => item.workspace !== null)
    .map((item) => ({
      ...(item.workspace as unknown as WorkspaceRecord),
      role: item.role as WorkspaceRole,
    }));
}
