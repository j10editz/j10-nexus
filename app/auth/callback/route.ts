import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

/**
 * Canonical Authentication Callback Handler for J10 NEXUS
 *
 * Handles server-side PKCE code exchange for:
 * - Email confirmation / signup validation
 * - Password recovery session initialization
 * - Extensible foundation for upcoming Google and Apple OAuth
 *
 * Security Guarantees:
 * - Code exchange happens entirely server-side.
 * - Redirects strictly validated to internal paths (no open redirects).
 * - Sensitive codes, tokens, and payloads are stripped from public URLs.
 * - Never uses service-role keys or exposes secrets.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");
  const nextParam = requestUrl.searchParams.get("next");
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDescription = requestUrl.searchParams.get("error_description");

  // Determine fallback destination based on flow type
  const isRecovery = type === "recovery";
  const defaultDestination = isRecovery ? "/reset-password" : "/dashboard";
  const safeDestination = getSafeRedirectUrl(nextParam, defaultDestination);

  // 1. Handle error passed from auth provider / Supabase URL (e.g., expired link)
  if (oauthError || oauthErrorDescription) {
    if (isRecovery) {
      return NextResponse.redirect(new URL("/reset-password?error=expired", request.url));
    }
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  // 2. Validate authorization code presence
  if (!code) {
    if (isRecovery) {
      return NextResponse.redirect(new URL("/reset-password?error=expired", request.url));
    }
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Handled by response headers if in read-only phase
        }
      },
    },
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    // Sanitized redirect - never leak the raw code or error details to the browser
    if (isRecovery) {
      return NextResponse.redirect(new URL("/reset-password?error=expired", request.url));
    }
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  // 3. Successful exchange: Redirect to validated internal destination with sensitive params removed
  return NextResponse.redirect(new URL(safeDestination, request.url));
}
