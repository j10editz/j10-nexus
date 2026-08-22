import {
  randomUUID,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import {
  INTEGRATION_ACTION_SCHEMA_VERSION,
} from "../../../../types/integration-action";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

export async function POST(
  request: Request,
) {
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    request.headers.get(
      "X-J10-Internal-Action-Sandbox",
    ) !== "day14i"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "J10 internal sandbox authorization failed.",
      },
      {
        status: 403,
      },
    );
  }

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Sandbox request contains invalid JSON.",
      },
      {
        status: 400,
      },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Sandbox request must be a JSON object.",
      },
      {
        status: 400,
      },
    );
  }

  const input =
    isRecord(body.input)
      ? body.input
      : {};

  return NextResponse.json({
    success: true,
    sandbox: true,
    schemaVersion:
      INTEGRATION_ACTION_SCHEMA_VERSION,
    receiptId:
      randomUUID(),
    executionId:
      typeof body.executionId === "string"
        ? body.executionId
        : null,
    providerId:
      typeof body.providerId === "string"
        ? body.providerId
        : null,
    capabilityId:
      typeof body.capabilityId === "string"
        ? body.capabilityId
        : null,
    operation:
      typeof body.operation === "string"
        ? body.operation
        : null,
    inputKeys:
      Object.keys(input).sort(),
    receivedAt:
      new Date().toISOString(),
    externalSideEffect:
      false,
  });
}