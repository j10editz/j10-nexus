import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

export async function middleware(request: NextRequest) {
  // Fail-closed guard: If an OAuth code or error reaches root or any public route outside /auth/callback,
  // immediately redirect to /auth/callback. The code is never rendered, logged, or retained in the browser URL.
  const code = request.nextUrl.searchParams.get("code");
  const authError = request.nextUrl.searchParams.get("error");
  const isCallbackPath = request.nextUrl.pathname.startsWith("/auth/callback");
  const isSanitizedLoginFailure =
    request.nextUrl.pathname === "/login" && authError === "auth_callback_failed";

  // The sanitized login failure is the final destination. Redirecting it back
  // through the callback creates an infinite callback/login loop.
  if ((code || authError) && !isCallbackPath && !isSanitizedLoginFailure) {
    const callbackUrl = new URL("/auth/callback", request.url);
    request.nextUrl.searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });
    return NextResponse.redirect(callbackUrl, { status: 307 });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const pathname = request.nextUrl.pathname;

  // Protect /dashboard routes: redirect unauthenticated visitors to /login
  if (pathname.startsWith("/dashboard")) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL("/login", request.url);
      const safeNext = getSafeRedirectUrl(
        pathname + request.nextUrl.search,
        "/dashboard"
      );
      loginUrl.searchParams.set("next", safeNext);

      const redirectResponse = NextResponse.redirect(loginUrl);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  // Redirect authenticated visitors away from /login to safe destination
  if (pathname === "/login") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const nextParam = request.nextUrl.searchParams.get("next");
      const safeDestination = getSafeRedirectUrl(nextParam, "/dashboard");
      const finalDestination = safeDestination.startsWith("/login")
        ? "/dashboard"
        : safeDestination;

      const redirectResponse = NextResponse.redirect(new URL(finalDestination, request.url));
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};
