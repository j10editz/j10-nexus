import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getCurrentUser, createAdminSupabaseClient } from "@/lib/auth";
import { getActiveWorkspaceContext, ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspaces/server";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function GET() {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Only owners and admins can view invitations." },
        { status: 403 }
      );
    }

    const admin = createAdminSupabaseClient();
    const { data: invitations, error } = await admin
      .from("workspace_invitations")
      .select("id, email_normalized, role, expires_at, accepted_at, revoked_at, created_at")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, invitations });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Only workspace owners and admins can invite new members." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, role = "agent" } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ success: false, error: "Valid email is required." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const allowedRoles = ["admin", "manager", "agent", "viewer"];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ success: false, error: "Invalid workspace role." }, { status: 400 });
    }

    // Role hierarchy check: Admins cannot invite Admins or Owners
    if (context.membership.role === "admin" && role === "admin") {
      return NextResponse.json(
        { success: false, error: "Admins cannot invite other Admins. Workspace Owner authority is required." },
        { status: 403 }
      );
    }

    // Generate high-entropy raw invitation token (never stored in plaintext)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const admin = createAdminSupabaseClient();
    const { data: invitation, error } = await admin
      .from("workspace_invitations")
      .insert({
        workspace_id: context.workspace.id,
        email_normalized: normalizedEmail,
        role,
        token_hash: tokenHash,
        invited_by: context.user.id,
        expires_at: expiresAt,
      })
      .select("id, workspace_id, email_normalized, role, expires_at, created_at")
      .single();

    if (error) {
      console.error("Error creating invitation:", error);
      return NextResponse.json({ success: false, error: "Failed to create invitation." }, { status: 500 });
    }

    // Canonical production origin rather than invented domain
    const appUrl =
      process.env.J10_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://j10-nexus.vercel.app";
    const inviteUrl = `${appUrl}/login?invitation=${rawToken}`;

    return NextResponse.json({
      success: true,
      invitation,
      inviteUrl,
    });
  } catch (error: any) {
    console.error("POST /api/workspaces/invitations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.email) {
      return NextResponse.json(
        { success: false, error: "Authentication required to accept invitation." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "Invitation token is required." }, { status: 400 });
    }

    const tokenHash = hashToken(token.trim());
    const admin = createAdminSupabaseClient();

    // Call atomic, email-bound accept_workspace_invitation RPC in PostgreSQL
    const { data: rpcResult, error: rpcError } = await admin.rpc("accept_workspace_invitation", {
      p_token_hash: tokenHash,
      p_user_id: user.id,
      p_user_email: user.email,
    });

    if (rpcError) {
      const errMsg = rpcError.message;
      let status = 400;
      if (errMsg.includes("expired")) status = 410;
      else if (errMsg.includes("already been accepted")) status = 409;
      else if (errMsg.includes("Access denied")) status = 403;
      else if (errMsg.includes("Invalid invitation")) status = 404;

      return NextResponse.json({ success: false, error: errMsg }, { status });
    }

    const membership = rpcResult?.membership;
    const workspaceId = rpcResult?.workspace_id;

    // Switch active workspace to the newly joined workspace
    if (workspaceId) {
      const cookieStore = await cookies();
      cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return NextResponse.json({
      success: true,
      membership,
      workspaceId,
      message: "Invitation accepted. You now have access to this workspace.",
    });
  } catch (error: any) {
    console.error("PUT /api/workspaces/invitations error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const context = await getActiveWorkspaceContext();
    if (!context) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    if (!["owner", "admin"].includes(context.membership.role)) {
      return NextResponse.json(
        { success: false, error: "Only owners and admins can revoke invitations." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get("id");

    if (!invitationId) {
      return NextResponse.json({ success: false, error: "Invitation ID is required." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("workspace_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("workspace_id", context.workspace.id)
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ success: false, error: "Failed to revoke invitation or invitation not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Invitation revoked successfully.",
      invitation: data,
    });
  } catch (error: any) {
    console.error("DELETE /api/workspaces/invitations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
