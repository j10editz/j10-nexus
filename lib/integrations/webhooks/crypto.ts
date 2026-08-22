import "server-only";

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export function sha256Hex(value: string | Buffer) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

export function hmacSha256Hex(
  secret: string,
  value: string | Buffer,
) {
  return createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

export function hmacSha256Base64(
  secret: string,
  value: string | Buffer,
) {
  return createHmac("sha256", secret)
    .update(value)
    .digest("base64");
}

export function safeStringEqual(
  actual: string,
  expected: string,
) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function normalizeSignatureHex(value: string | null) {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
}

export function parseUnixTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Number(value.trim());

  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return null;
  }

  return timestamp;
}

export function isWebhookTimestampFresh(
  unixTimestamp: number,
  now = Date.now(),
) {
  const ageSeconds = Math.abs(
    Math.floor(now / 1000) - unixTimestamp,
  );

  return ageSeconds <= WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
}

export function buildWebhookReplayKey(input: {
  providerId: string;
  eventType: string;
  externalEventId: string | null;
  payloadSha256: string;
  timestampIdentity?: string | null;
}) {
  const identity =
    input.externalEventId?.trim() ||
    `${input.timestampIdentity?.trim() || "no-timestamp"}:${input.payloadSha256}`;

  return sha256Hex(
    `${input.providerId}:${input.eventType}:${identity}`,
  );
}