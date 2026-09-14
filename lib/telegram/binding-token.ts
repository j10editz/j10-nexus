import "server-only";
import crypto from "node:crypto";

const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes
const usedNonces = new Set<string>();

function getSigningKey(): Buffer {
  const encKey = process.env.J10_INTEGRATION_ENCRYPTION_KEY?.trim();
  if (encKey) {
    try {
      const buf = Buffer.from(encKey, "base64");
      if (buf.length === 32) return buf;
    } catch {}
  }
  return crypto.createHash("sha256").update(encKey || "j10-default-binding-secret-key").digest();
}

function uuidToBuffer(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bufferToUuid(buf: Buffer): string {
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Generates an opaque, cryptographically signed, expiring binding token.
 * Token binary payload (32 bytes):
 * [0..15] : 16 bytes Workspace UUID
 * [16..19]: 4 bytes Expire timestamp (epoch seconds, uint32BE)
 * [20..23]: 4 bytes Nonce (uint32BE)
 * [24..31]: 8 bytes HMAC-SHA256 signature (truncated 64-bit MAC)
 * Encoded as Base64Url: Length 45 characters (Strictly <= Telegram's 64-char limit).
 */
export function generateTelegramBindingToken(
  workspaceId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const wsBuf = uuidToBuffer(workspaceId);
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSeconds;
  const nonce = crypto.randomBytes(4);

  const expBuf = Buffer.alloc(4);
  expBuf.writeUInt32BE(expSec, 0);

  const body = Buffer.concat([wsBuf, expBuf, nonce]); // 24 bytes
  const hmac = crypto.createHmac("sha256", getSigningKey());
  hmac.update(body);
  const sig = hmac.digest().subarray(0, 8); // 8 bytes

  const tokenBytes = Buffer.concat([body, sig]); // 32 bytes
  return `b_${tokenBytes.toString("base64url")}`;
}

export interface VerifyBindingResult {
  valid: boolean;
  workspaceId?: string;
  error?: string;
}

/**
 * Verifies a Telegram binding token.
 * Rejects tampering, signature mismatch, expiration, replay, and malformed format.
 */
export function verifyTelegramBindingToken(
  tokenStr: string,
  expectedWorkspaceId?: string
): VerifyBindingResult {
  if (!tokenStr || !tokenStr.startsWith("b_")) {
    return { valid: false, error: "Invalid binding token prefix." };
  }

  const rawB64 = tokenStr.slice(2);
  const buf = Buffer.from(rawB64, "base64url");
  if (buf.length !== 32) {
    return { valid: false, error: "Invalid binding token byte length." };
  }

  const body = buf.subarray(0, 24);
  const sig = buf.subarray(24, 32);

  const hmac = crypto.createHmac("sha256", getSigningKey());
  hmac.update(body);
  const expectedSig = hmac.digest().subarray(0, 8);

  if (!crypto.timingSafeEqual(sig, expectedSig)) {
    return { valid: false, error: "Token signature verification failed (tampered token)." };
  }

  const wsBuf = body.subarray(0, 16);
  const wsId = bufferToUuid(wsBuf);
  const expSec = body.readUInt32BE(16);
  const nonce = body.readUInt32BE(20);

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > expSec) {
    return { valid: false, error: "Binding token has expired (exceeded 30 minutes)." };
  }

  const nonceKey = `${wsId}:${nonce}`;
  if (usedNonces.has(nonceKey)) {
    return { valid: false, error: "Binding token replay rejected (already used)." };
  }
  usedNonces.add(nonceKey);

  // Prevent memory growth on nonces
  if (usedNonces.size > 20000) {
    usedNonces.clear();
  }

  if (expectedWorkspaceId && wsId !== expectedWorkspaceId) {
    return { valid: false, error: "Cross-workspace binding attempt rejected." };
  }

  return {
    valid: true,
    workspaceId: wsId,
  };
}
