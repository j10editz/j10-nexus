/**
 * Canonical Application Origin Resolution for J10 NEXUS
 *
 * Verified Production Origin: https://j10-nexus.vercel.app
 * Browser Origin: window.location.origin
 */

export const VERIFIED_PRODUCTION_ORIGIN = "https://j10-nexus.vercel.app";

export function getCanonicalOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (origin && origin !== "null" && origin.startsWith("http")) {
      return origin;
    }
  }

  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (configured && configured.startsWith("http")) {
    return configured.replace(/\/+$/, "");
  }

  return VERIFIED_PRODUCTION_ORIGIN;
}
