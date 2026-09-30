/**
 * Authentication Provider Configuration and Discovery
 *
 * Truthful detection of external social auth providers (Google, Apple).
 * Queries the Supabase Auth settings endpoint (/auth/v1/settings) to verify
 * whether each provider is actively enabled in the project.
 *
 * Security:
 * - Never returns or uses secrets, private keys, or credentials.
 * - Safely defaults to false (disabled) if Supabase is unreachable or unconfigured.
 * - Prevents rendering unconfigured social auth buttons (truthful provider display).
 */

export const CANONICAL_SUPABASE_PROJECT_REF = "fulzdhltboospethnwfk";
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_PROJECT_REF}.supabase.co`;

export interface AuthProviderSettings {
  google: boolean;
  apple: boolean;
}

export async function getAuthProviderSettings(): Promise<AuthProviderSettings> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || CANONICAL_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { google: false, apple: false };
  }

  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      next: { revalidate: 15 },
    });

    if (!res.ok) {
      return { google: false, apple: false };
    }

    const data = await res.json();
    return {
      google: Boolean(data?.external?.google),
      apple: Boolean(data?.external?.apple),
    };
  } catch {
    return { google: false, apple: false };
  }
}
