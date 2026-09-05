import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getCurrentUser, createAdminSupabaseClient } from "@/lib/auth";
import { getActiveWorkspaceContext } from "@/lib/workspaces/server";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function GET(req: Request) {
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

    // Generate high-entropy raw invitation token
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

    // Construct secure invitation URL
    const appUrl = process.env.J10_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://j10nexus.com";
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
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required to accept invitation." }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "Invitation token is required." }, { status: 400 });
    }

    const tokenHash = hashToken(token.trim());
    const admin = createAdminSupabaseClient();

    // 1. Fetch invitation record
    const { data: invitation, error: inviteError } = await admin
      .from("workspace_invitations")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (inviteError || !invitation) {
      return NextResponse.json({ success: false, error: "Invalid invitation token." }, { status: 404 });
    }

    if (invitation.accepted_at) {
      return NextResponse.json({ success: false, error: "This invitation has already been accepted." }, { status: 409 });
    }

    if (invitation.revoked_at) {
      return NextResponse.json({ success: false, error: "This invitation has been revoked." }, { status: 410 });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ success: false, error: "This invitation has expired." }, { status: 410 });
    }

    // 2. Transactionally add membership
    const { data: newMem, error: memError } = await admin
      .from("workspace_memberships")
      .upsert({
        workspace_id: invitation.workspace_id,
        user_id: user.id,
        role: invitation.role,
        status: "active",
      })
      .select("*")
      .single();

    if (memError) {
      console.error("Error creating accepted membership:", memError);
      return NextResponse.json({ success: false, error: "Failed to join workspace." }, { status: 500 });
    }

    // 3. Mark invitation accepted
    await admin
      .from("workspace_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return NextResponse.json({
      success: true,
      membership: newMem,
      message: "Invitation accepted. You now have access to this workspace.",
    });
  } catch (error: any) {
    console.error("PUT /api/workspaces/invitations error:", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
