import { createHmac, timingSafeEqual } from "node:crypto";

export const RECOVERY_COOKIE_NAME = "j10_recovery_intent";
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60; // 15 minutes

interface RecoveryPayload {
  userId: string;
  exp: number; // epoch ms
}

function getRecoverySecret(): string {
  return (
    process.env.SUPABASE_JWT_SECRET ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "j10-nexus-recovery-internal-salt"
  );
}

/**
 * Creates a signed, tamper-proof recovery intent token bound to the verified user ID.
 */
export function signRecoveryIntent(userId: string): string {
  const exp = Date.now() + RECOVERY_MAX_AGE_SECONDS * 1000;
  const payloadStr = JSON.stringify({ userId, exp });
  const b64Payload = Buffer.from(payloadStr, "utf8").toString("base64url");
  const signature = createHmac("sha256", getRecoverySecret())
    .update(b64Payload)
    .digest("base64url");
  return `${b64Payload}.${signature}`;
}

/**
 * Verifies that the recovery intent token is valid, unexpired, and matches expected user ID.
 */
export function verifyRecoveryIntentToken(
  token: string | undefined | null,
  expectedUserId?: string
): { valid: boolean; userId?: string } {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false };
  }

  const [b64Payload, signature] = token.split(".");
  if (!b64Payload || !signature) {
    return { valid: false };
  }

  const expectedSig = createHmac("sha256", getRecoverySecret())
    .update(b64Payload)
    .digest("base64url");

  // Constant-time signature verification
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
