import { NextResponse } from "next/server";
import { getCurrentUser, createServerSupabaseClient } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "Valid email address is required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address format." },
        { status: 400 }
      );
    }

    if (normalizedEmail === user.email?.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: "New email must be different from current email." },
        { status: 400 }
      );
    }

    // Call Supabase Auth email update
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.updateUser({
      email: normalizedEmail,
    });

    if (error) {
      console.warn("Email update request rejected:", error.message);
      return NextResponse.json(
        { success: false, error: error.message || "Failed to initiate email change." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      pendingConfirmation: true,
      currentEmail: user.email,
      newEmail: normalizedEmail,
      message: "Confirmation email sent. Please check both your current and new inbox to confirm the change.",
    });
  } catch (error: any) {
    console.error("POST /api/account/email error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error during email change request." },
      { status: 500 }
    );
  }
}
