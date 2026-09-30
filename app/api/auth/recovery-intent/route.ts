import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, getCurrentUser } from "@/lib/auth";
import {
  RECOVERY_COOKIE_NAME,
  verifyRecoveryIntentToken,
} from "@/lib/auth/recovery";
import { sanitizeAuthError } from "@/lib/auth/errors";

export async function GET() {
  const cookieStore = await cookies();
  const recoveryCookie = cookieStore.get(RECOVERY_COOKIE_NAME)?.value;

  if (!recoveryCookie) {
    return NextResponse.json({ valid: false });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ valid: false });
  }

  const verification = verifyRecoveryIntentToken(recoveryCookie, user.id);
  if (!verification.valid) {
    const response = NextResponse.json({ valid: false });
    response.cookies.set(RECOVERY_COOKIE_NAME, "", {
      maxAge: 0,
      path: "/",
    });
    return response;
  }

  return NextResponse.json({ valid: true });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const recoveryCookie =
    cookieStore.get(RECOVERY_COOKIE_NAME)?.value ||
    request.cookies.get(RECOVERY_COOKIE_NAME)?.value;

  const user = await getCurrentUser();
  if (!user || !recoveryCookie) {
    return NextResponse.json(
      { error: "The recovery link is invalid or has expired. Request a new link to continue." },
      { status: 401 }
    );
  }

  const verification = verifyRecoveryIntentToken(recoveryCookie, user.id);
  if (!verification.valid) {
    const response = NextResponse.json(
      { error: "The recovery link is invalid or has expired. Request a new link to continue." },
      { status: 401 }
    );
    response.cookies.set(RECOVERY_COOKIE_NAME, "", {
      maxAge: 0,
      path: "/",
    });
    return response;
  }

  let body: { password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 }
    );
  }

  const { password } = body;
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters long." },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return NextResponse.json(
      { error: sanitizeAuthError(error, "reset") },
      { status: 400 }
    );
  }

  // Password updated successfully: Clear recovery intent cookie immediately
  const response = NextResponse.json({ success: true });
  response.cookies.set(RECOVERY_COOKIE_NAME, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return response;
}
