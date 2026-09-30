import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";
import { OAUTH_INTENT_COOKIE_NAME } from "@/lib/auth/oauth";
import {
  RECOVERY_COOKIE_NAME,
  RECOVERY_MAX_AGE_SECONDS,
  signRecoveryIntent,
} from "@/lib/auth/recovery";

/**
 * Canonical Authentication Callback Handler for J10 NEXUS
 *
 * Handles server-side PKCE code exchange for:
 * - Email confirmation / signup verification
 * - Password recovery session initialization (forces /reset-password)
 * - Extensible architecture for future Google and Apple OAuth
 *
 * Security Guarantees:
 * - Recovery callbacks ALWAYS route to /reset-password, ignoring any ?next override.
 * - Establishes short-lived, HttpOnly recovery intent cookie on successful recovery exchange.
 * - Sensitive codes, tokens, and payloads are stripped from final URLs.
 * - Open redirects strictly blocked.
 * - Never uses service-role keys in public endpoints.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");
  const nextParam = requestUrl.searchParams.get("next");
  const oauthError = requestUrl.searchParams.get("error");
  const oauthErrorDescription = requestUrl.searchParams.get("error_description");

  const isRecovery = type === "recovery";

  const cookieStore = await cookies();
  const oauthNextCookie = cookieStore.get(OAUTH_INTENT_COOKIE_NAME)?.value;
  const rawNext = nextParam || oauthNextCookie;

  // When type=recovery, ignore arbitrary next parameter and force /reset-password
  const destination = isRecovery
    ? "/reset-password"
    : getSafeRedirectUrl(rawNext, "/dashboard");

  // 1. Handle error passed from auth provider (e.g., expired link)
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
    if (isRecovery) {
      return NextResponse.redirect(new URL("/reset-password?error=expired", request.url));
    }
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  const cookiesToSetOnRedirect: Array<{
    name: string;
    value: string;
    options?: any;
  }> = [];

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach((c) => {
          cookiesToSetOnRedirect.push(c);
          try {
            cookieStore.set(c.name, c.value, c.options);
          } catch {
            // Handled via redirect response headers
          }
        });
      },
    },
  });

  const { data, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data?.session?.user) {
    if (isRecovery) {
      return NextResponse.redirect(new URL("/reset-password?error=expired", request.url));
    }
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", request.url));
  }

  // 3. Successful exchange: Redirect to verified destination with sensitive parameters stripped
  const redirectResponse = NextResponse.redirect(new URL(destination, request.url));

  // Preserve Supabase session cookies on the redirect response
  cookiesToSetOnRedirect.forEach(({ name, value, options }) => {
    redirectResponse.cookies.set(name, value, options);
  });

  // Clear OAuth intent cookie on successful callback so it does not linger
  redirectResponse.cookies.delete(OAUTH_INTENT_COOKIE_NAME);

  // If this is a recovery callback, establish the short-lived, HttpOnly recovery intent cookie
  if (isRecovery) {
    const recoveryToken = signRecoveryIntent(data.session.user.id);
    if (!recoveryToken) {
      // Configuration failure: missing server secret. Fail closed without setting cookie.
      return NextResponse.redirect(new URL("/reset-password?error=expired", request.url));
    }
    redirectResponse.cookies.set(RECOVERY_COOKIE_NAME, recoveryToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: RECOVERY_MAX_AGE_SECONDS,
    });
  }

  return redirectResponse;
}
