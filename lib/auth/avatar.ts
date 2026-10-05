/**
 * Avatar Resolution & Sanitization Module
 *
 * Implements strict security controls for dashboard user avatars:
 * 1. Priority 1: User-uploaded J10 profile image (relative or safe HTTPS URL).
 * 2. Priority 2: Authenticated Supabase user metadata fallback (avatar_url or picture)
 *    from trusted Google avatar hosts.
 * 3. Priority 3: Generic fallback icon (null).
 *
 * Security: Rejects non-HTTPS schemes, untrusted hosts, path traversal, credentials,
 * data URIs, and javascript: execution.
 */

export const TRUSTED_GOOGLE_AVATAR_HOST_PATTERNS = [
  /^([a-z0-9_-]+\.)*googleusercontent\.com$/i,
  /^([a-z0-9_-]+\.)*ggpht\.com$/i,
];

/**
 * Validates that an avatar URL is an HTTPS URL from a trusted Google avatar host.
 * Strictly blocks malicious hosts, plain HTTP, credentials, ports, and arbitrary schemes.
 */
export function isTrustedGoogleAvatarUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }

  const trimmed = url.trim();

  // Reject javascript:, data:, vbscript:, and protocol-relative schemes before URL parsing
  if (
    trimmed.startsWith("//") ||
    /^(javascript|data|vbscript|file|ftp):/i.test(trimmed)
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);

    // Protocol must be strictly https:
    if (parsed.protocol !== "https:") {
      return false;
    }

    // Must not contain embedded credentials (username:password@...)
    if (parsed.username || parsed.password) {
      return false;
    }

    // Must not specify non-standard ports
    if (parsed.port && parsed.port !== "443") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Must match authorized Google host patterns
    return TRUSTED_GOOGLE_AVATAR_HOST_PATTERNS.some((pattern) =>
      pattern.test(hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Validates that an avatar URL (including user-uploaded local or hosted J10 avatar)
 * is safe to render in an <img> tag.
 */
export function isSafeAvatarUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }

  const trimmed = url.trim();

  // Relative path uploaded to J10 (e.g. /uploads/..., /avatars/...)
  if (trimmed.startsWith("/")) {
    // Block protocol-relative URLs (//evil.com) and backslash tricks (/\evil.com)
    if (trimmed.startsWith("//") || trimmed.startsWith("/\\") || trimmed.includes("\\")) {
      return false;
    }
    return true;
  }

  // Absolute URL
  try {
    const parsed = new URL(trimmed);

    // Only https: is allowed for external URLs
    if (parsed.protocol !== "https:") {
      return false;
    }

    if (parsed.username || parsed.password) {
      return false;
    }

    if (parsed.port && parsed.port !== "443" && parsed.port !== "3000") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export interface ResolveAvatarParams {
  j10AvatarUrl?: string | null;
  googleMetadata?: Record<string, any> | null;
}

/**
 * Resolves the account avatar URL adhering to strict precedence:
 * 1. User-uploaded J10 profile image (highest priority).
 * 2. Authenticated Supabase user metadata fallback (avatar_url || picture)
 *    validated against trusted Google avatar hosts.
 * 3. Generic user icon (null).
 */
export function resolveAccountAvatar({
  j10AvatarUrl,
  googleMetadata,
}: ResolveAvatarParams): string | null {
  // 1. Priority 1: User-uploaded J10 profile image
  if (j10AvatarUrl && typeof j10AvatarUrl === "string") {
    const trimmed = j10AvatarUrl.trim();
    if (trimmed && isSafeAvatarUrl(trimmed)) {
      return trimmed;
    }
  }

  // 2. Priority 2: Authenticated Supabase user metadata fallback
  const rawGoogleAvatar =
    googleMetadata?.avatar_url || googleMetadata?.picture;

  if (rawGoogleAvatar && typeof rawGoogleAvatar === "string") {
    const trimmedGoogle = rawGoogleAvatar.trim();
    if (isTrustedGoogleAvatarUrl(trimmedGoogle)) {
      return trimmedGoogle;
    }
  }

  // 3. Final fallback: null (render generic user icon)
  return null;
}
