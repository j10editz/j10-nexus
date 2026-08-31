import "server-only";

import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const APPROVAL_VERSION =
  "j10.operator-approval.v1" as const;

const APPROVAL_TTL_MS =
  5 * 60 * 1_000;

type OperatorApprovalPayload = {
  version: typeof APPROVAL_VERSION;
  userId: string;
  connectionId: string;
  fingerprint: string;
  purpose:
    "whatsapp_test_delivery";
  nonce: string;
  expiresAt: number;
};

function approvalSecret(): string {
  const secret =
    process.env
      .J10_INTEGRATION_ENCRYPTION_KEY;

  if (
    !secret ||
    secret.length < 32
  ) {
    throw new Error(
      "J10 operator approval signing is not configured.",
    );
  }

  return secret;
}

function signPayload(
  encodedPayload: string,
): string {
  return createHmac(
    "sha256",
    approvalSecret(),
  )
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(
  actual: string,
  expected: string,
): boolean {
  const actualBuffer =
    Buffer.from(actual);

  const expectedBuffer =
    Buffer.from(expected);

  return (
    actualBuffer.length ===
      expectedBuffer.length &&
    timingSafeEqual(
      actualBuffer,
      expectedBuffer,
    )
  );
}

export function createIntegrationOperatorApproval(
  input: {
    userId: string;
    connectionId: string;
    fingerprint: string;
  },
) {
  const payload:
    OperatorApprovalPayload = {
    version:
      APPROVAL_VERSION,
    userId:
      input.userId,
    connectionId:
      input.connectionId,
    fingerprint:
      input.fingerprint,
    purpose:
      "whatsapp_test_delivery",
    nonce:
      randomUUID(),
    expiresAt:
      Date.now() +
      APPROVAL_TTL_MS,
  };

  const encodedPayload =
    Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");

  return {
    token:
      `${encodedPayload}.${signPayload(encodedPayload)}`,
    expiresAt:
      new Date(
        payload.expiresAt,
      ).toISOString(),
    nonce:
      payload.nonce,
  };
}

export function verifyIntegrationOperatorApproval(
  token: unknown,
  expected: {
    userId: string;
    connectionId: string;
    fingerprint: string;
  },
): boolean {
  if (typeof token !== "string") {
    return false;
  }

  const [encodedPayload, signature, extra] =
    token.split(".");

  if (
    !encodedPayload ||
    !signature ||
    extra
  ) {
    return false;
  }

  if (
    !safeEqual(
      signature,
      signPayload(encodedPayload),
    )
  ) {
    return false;
  }

  let payload:
    OperatorApprovalPayload;

  try {
    payload =
      JSON.parse(
        Buffer.from(
          encodedPayload,
          "base64url",
        ).toString("utf8"),
      ) as OperatorApprovalPayload;
  } catch {
    return false;
  }

  return (
    payload.version ===
      APPROVAL_VERSION &&
    payload.purpose ===
      "whatsapp_test_delivery" &&
    payload.userId ===
      expected.userId &&
    payload.connectionId ===
      expected.connectionId &&
    payload.fingerprint ===
      expected.fingerprint &&
    typeof payload.expiresAt ===
      "number" &&
    payload.expiresAt >
      Date.now() &&
    payload.expiresAt <=
      Date.now() +
        APPROVAL_TTL_MS
  );
}
