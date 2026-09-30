import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export const RECOVERY_COOKIE_NAME = "j10_recovery_intent";
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60; // 15 minutes
export const RECOVERY_KEY_CONTEXT = "j10-auth-recovery-cookie-v1";

interface RecoveryPayload {
  userId: string;
  exp: number; // epoch ms
}

/**
 * Resolves the server-only master secret for recovery intent signing.
 * Strictly checks privileged server secrets in priority order:
 * 1. AUTH_RECOVERY_HMAC_SECRET
 * 2. SUPABASE_SECRET_KEY
 * 3. SUPABASE_SERVICE_ROLE_KEY (legacy server fallback)
 *
 * Rejects public browser keys or hardcoded values.
 */
function getRecoveryMasterSecret(): string | null {
  const secret =
    process.env.AUTH_RECOVERY_HMAC_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || typeof secret !== "string") {
    return null;
  }

  const trimmed = secret.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

/**
 * Derives a purpose-separated 256-bit HMAC key via HKDF-SHA256
 * bound to a specific application context (e.g. 'j10-auth-recovery-cookie-v1').
 * Fails closed (returns null) if no privileged server secret is available.
 */
export function deriveRecoverySigningKey(context = RECOVERY_KEY_CONTEXT): Buffer | null {
  const masterSecret = getRecoveryMasterSecret();
  if (!masterSecret) {
    return null;
  }

  try {
    return Buffer.from(
      hkdfSync("sha256", masterSecret, "", context, 32)
    );
  } catch {
    return null;
  }
}

/**
 * Creates a signed, tamper-proof recovery intent token bound to the verified user ID.
 * Fails closed by returning null if no private server-side secret is configured.
 * Never logs secrets, derived keys, tokens, or signatures.
 */
export function signRecoveryIntent(userId: string, context = RECOVERY_KEY_CONTEXT): string | null {
  if (!userId || typeof userId !== "string") {
    return null;
  }

  const key = deriveRecoverySigningKey(context);
  if (!key) {
    return null;
  }

  const exp = Date.now() + RECOVERY_MAX_AGE_SECONDS * 1000;
  const payloadStr = JSON.stringify({ userId, exp });
  const b64Payload = Buffer.from(payloadStr, "utf8").toString("base64url");
  const signature = createHmac("sha256", key)
    .update(b64Payload)
    .digest("base64url");

  return `${b64Payload}.${signature}`;
}

/**
 * Verifies that the recovery intent token is valid, unexpired, matches the expected user ID,
 * and was signed with a purpose-separated key derived from a privileged server secret.
 * Fails closed if token is invalid, tampered, expired, or server secret is missing.
 */
export function verifyRecoveryIntentToken(
  token: string | undefined | null,
  expectedUserId?: string,
  context = RECOVERY_KEY_CONTEXT
): { valid: boolean; userId?: string } {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false };
  }

  const key = deriveRecoverySigningKey(context);
  if (!key) {
    return { valid: false };
  }

  const [b64Payload, signature] = token.split(".");
  if (!b64Payload || !signature) {
    return { valid: false };
  }

  const expectedSig = createHmac("sha256", key)
    .update(b64Payload)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const payloadJson = Buffer.from(b64Payload, "base64url").toString("utf8");
    const payload: RecoveryPayload = JSON.parse(payloadJson);

    if (!payload.userId || !payload.exp) {
      return { valid: false };
    }

    if (Date.now() > payload.exp) {
      return { valid: false }; // Expired
    }

    if (expectedUserId && payload.userId !== expectedUserId) {
      return { valid: false }; // Mismatched user session
    }

    return { valid: true, userId: payload.userId };
  } catch {
    return { valid: false };
  }
}
