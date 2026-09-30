import { getSafeRedirectUrl } from "./redirect";

export const OAUTH_INTENT_COOKIE_NAME = "j10_oauth_next";
export const OAUTH_INTENT_MAX_AGE_SECONDS = 300; // 5 minutes

/**
 * Builds the canonical OAuth callback URL for Supabase signInWithOAuth.
 * Ensures the redirectTo URL is explicitly derived from the active browser origin.
 */
export function resolveOAuthCallbackUrl(
  origin: string,
  nextUrl?: string,
  stripQuery = false
): string {
  const safeNext = getSafeRedirectUrl(nextUrl, "/dashboard");
  if (stripQuery) {
    return `${origin}/auth/callback`;
  }
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}

/**
 * Sets client-side OAuth intent cookie to preserve destination even if the auth
 * provider strips query parameters during callback allowlist validation.
 */
export function setClientOAuthIntentCookie(destination: string): void {
  if (typeof document === "undefined") return;
  const safeDestination = getSafeRedirectUrl(destination, "/dashboard");
  const isSecure =
    typeof window !== "undefined" && window.location?.protocol === "https:";
  document.cookie = `${OAUTH_INTENT_COOKIE_NAME}=${encodeURIComponent(
    safeDestination
  )}; Path=/; Max-Age=${OAUTH_INTENT_MAX_AGE_SECONDS}; SameSite=Lax; ${
    isSecure ? "Secure;" : ""
  }`;
}
