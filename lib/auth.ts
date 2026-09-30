import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "placeholder-anon-key";

  return createServerClient(
    url,
    key,
    {
      cookies: {
        async getAll() {
          const cookieStore = await cookies();
          return cookieStore.getAll();
        },

        async setAll(cookiesToSet) {
          const cookieStore = await cookies();

          try {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(name, value, options);
              }
            );
          } catch {
            // Ignore cookie write errors in read-only server contexts.
          }
        },
      },
    }
  );
}

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Admin Supabase client unavailable: Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY. Cannot fall back to publishable key."
    );
  }

  return createSupabaseAdmin(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getCurrentUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireUser(returnUrl?: string) {
  const user = await getCurrentUser();

  if (!user) {
    const safeNext = returnUrl ? getSafeRedirectUrl(returnUrl, "/dashboard") : undefined;
    const loginUrl = safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login";
    redirect(loginUrl);
  }

  return user;
}

export async function redirectIfAuthenticated(nextUrl?: string) {
  const user = await getCurrentUser();

  if (user) {
    redirect(getSafeRedirectUrl(nextUrl, "/dashboard"));
  }
}