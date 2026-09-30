/**
 * Safe Redirect Validation Utility for J10 NEXUS
 *
 * Prevents Open Redirect vulnerabilities (CWE-601) by ensuring redirect targets
 * are valid, same-origin relative application paths.
 *
 * Strict protection against:
 * - Absolute external URLs (http:, https:, ftp:, etc.)
 * - Protocol-relative URLs (//evil.com, ///evil.com)
 * - Backslash bypasses (/\evil.com, \\evil.com, \/evil.com)
 * - Control characters, newlines, null bytes
 * - JavaScript schemes (javascript:, data:, vbscript:)
 * - Multi-encoded bypass attempts (%2f%2f, %252f)
 */

const FALLBACK_DEFAULT = "/dashboard";

/**
 * Validates a candidate redirect target and returns a sanitized internal path.
 * If the target is invalid, external, or malformed, returns the fallback path.
 */
export function getSafeRedirectUrl(
  target: string | null | undefined,
  fallback = FALLBACK_DEFAULT
): string {
  const safeFallback = fallback && fallback.startsWith("/") && !fallback.startsWith("//") && !fallback.includes("\\")
    ? fallback
    : FALLBACK_DEFAULT;

  if (!target || typeof target !== "string") {
    return safeFallback;
  }

  const trimmed = target.trim();
  if (!trimmed) {
    return safeFallback;
  }

  // 1. Block control characters, null bytes, and non-printable characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return safeFallback;
  }

  // 2. Reject backslashes anywhere in the target (often used to trick naive path parsers)
  if (trimmed.includes("\\")) {
    return safeFallback;
  }

  // 3. Multi-layer URL decode to detect encoded bypass attempts like %2f%2fevil.com
  let decoded = trimmed;
  for (let i = 0; i < 3; i++) {
    try {
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    } catch {
      // Malformed URI sequence
      return safeFallback;
    }
  }

  // Check decoded version for protocol-relative or backslash sequences
  const normalizedDecoded = decoded.trim().replace(/\s+/g, "");
  if (
    normalizedDecoded.startsWith("//") ||
    normalizedDecoded.startsWith("/\\") ||
    normalizedDecoded.startsWith("\\/") ||
    normalizedDecoded.startsWith("\\\\") ||
    normalizedDecoded.includes("\\")
  ) {
    return safeFallback;
  }

  // 4. Must start with a single slash '/'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return safeFallback;
  }

  // 5. Parse with URL constructor against a dummy base origin to verify path structure
  try {
    const dummyOrigin = "http://localhost";
    const parsed = new URL(trimmed, dummyOrigin);

    // Host must remain the dummy origin (ensures no authority injection)
    if (parsed.origin !== dummyOrigin) {
      return safeFallback;
    }

    // Protocol must remain http
    if (parsed.protocol !== "http:") {
      return safeFallback;
    }

    // Pathname must start with '/' and not '//'
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
      return safeFallback;
    }

    // Disallow dangerous schemes if somehow present
    const lower = trimmed.toLowerCase();
    if (
      lower.includes("javascript:") ||
      lower.includes("data:") ||
      lower.includes("vbscript:")
    ) {
      return safeFallback;
    }

    // Return the safe internal relative path (pathname + search + hash)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return safeFallback;
  }
}
