import { NextResponse } from "next/server";
import { getAuthProviderSettings } from "@/lib/auth/providers";

/**
 * Endpoint for client-side discovery of active, truth-verified OAuth providers.
 * Returns { google: boolean, apple: boolean }.
 * Cached with public headers to optimize page load speeds.
 */
export async function GET() {
  const providers = await getAuthProviderSettings();
  return NextResponse.json(providers, {
    headers: {
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
    },
  });
}
