import { NextResponse } from "next/server";
import { getCurrentUser, createAdminSupabaseClient } from "@/lib/auth";
import { getActiveWorkspaceContext, getUserPlatformRole, getUserProfile } from "@/lib/workspaces/server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const [context, platformRole, profile] = await Promise.all([
      getActiveWorkspaceContext(),
      getUserPlatformRole(user.id),
      getUserProfile(user.id),
    ]);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email || "",
      },
      profile: profile || {
        user_id: user.id,
        display_name: user.email ? user.email.split("@")[0] : "User",
        avatar_url: null,
        job_title: "",
        phone: null,
        locale: "en-US",
        timezone: "UTC",
        status: "active",
        created_at: user.created_at,
        updated_at: user.created_at,
      },
      platformRole,
      activeWorkspaceRole: context?.membership?.role || null,
      activeWorkspaceName: context?.workspace?.name || null,
    });
  } catch (error: any) {
    console.error("GET /api/account/profile error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve profile." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { display_name, avatar_url, job_title, phone, locale, timezone } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (display_name !== undefined) updates.display_name = String(display_name).trim().slice(0, 80);
    if (avatar_url !== undefined) updates.avatar_url = avatar_url ? String(avatar_url).trim().slice(0, 500) : null;
    if (job_title !== undefined) updates.job_title = String(job_title).trim().slice(0, 80);
    if (phone !== undefined) updates.phone = phone ? String(phone).trim().slice(0, 30) : null;
    if (locale !== undefined) updates.locale = String(locale).trim().slice(0, 10);
    if (timezone !== undefined) updates.timezone = String(timezone).trim().slice(0, 50);

    const admin = createAdminSupabaseClient();
    const { data: updatedProfile, error } = await admin
      .from("profiles")
      .upsert({
        user_id: user.id,
        ...updates,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update profile." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
    });
  } catch (error: any) {
    console.error("PATCH /api/account/profile error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process profile update." },
      { status: 500 }
    );
  }
}
