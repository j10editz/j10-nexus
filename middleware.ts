import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

export async function middleware(request: NextRequest) {
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
    "/dashboard/:path*",
    "/login",
  ],
};
