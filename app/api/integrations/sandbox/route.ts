import {
  NextResponse,
} from "next/server";

import type {
  IntegrationSandboxApiResponse,
} from "../../../../types/integration-sandbox";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "../../../../lib/integrations/api";

import {
  IntegrationDevelopmentSandboxError,
  parseIntegrationSandboxRequest,
  runIntegrationDevelopmentSandbox,
} from "../../../../lib/integrations/development-sandbox";

import {
  INTEGRATION_SANDBOX_SCENARIO_IDS,
  INTEGRATION_SANDBOX_SCHEMA_VERSION,
} from "../../../../types/integration-sandbox";

const MAX_REQUEST_BYTES =
  16 * 1024;

function unavailableResponse() {
  return NextResponse.json<IntegrationSandboxApiResponse>(
    {
      success: false,
      error: "Not found.",
    },
    {
      status: 404,
    },
  );
}

function sandboxErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
    IntegrationDevelopmentSandboxError
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
        code:
          error.code,
      },
      {
        status:
          error.status,
      },
    );
  }

  return integrationApiErrorResponse(
    error,
    "J10 NEXUS could not run the integration development sandbox.",
  );
}

async function authenticateRequest() {
  const supabase =
    await createIntegrationApiClient();

  return getAuthenticatedIntegrationUser(
    supabase,
  );
}

export async function GET() {
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    return unavailableResponse();
  }

  try {
    const user =
      await authenticateRequest();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        {
          status:
            401,
        },
      );
    }

    return NextResponse.json<IntegrationSandboxApiResponse>({
      success:
        true,

      descriptor: {
        schemaVersion:
          INTEGRATION_SANDBOX_SCHEMA_VERSION,

        environment:
          "development",

        deterministic:
          true,

        productionDisabled:
          true,

        zeroCost:
          true,

        scenarioIds:
          INTEGRATION_SANDBOX_SCENARIO_IDS,
      },
    });
  } catch (error) {
    return sandboxErrorResponse(
      error,
    );
  }
}

export async function POST(
  request: Request,
) {
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    return unavailableResponse();
  }

  try {
    const user =
      await authenticateRequest();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        {
          status:
            401,
        },
      );
    }

    const text =
      await request.text();

    if (
      Buffer.byteLength(
        text,
        "utf8",
      ) > MAX_REQUEST_BYTES
    ) {
      throw new IntegrationDevelopmentSandboxError(
        "Sandbox request exceeded the 16 KB safety limit.",
        "INTEGRATION_SANDBOX_REQUEST_TOO_LARGE",
        413,
      );
    }

    const value =
      text.trim()
        ? JSON.parse(
            text,
          ) as unknown
        : undefined;

    const sandboxRequest =
      parseIntegrationSandboxRequest(
        value,
      );

    const sandbox =
      await runIntegrationDevelopmentSandbox(
        sandboxRequest,
        new URL(
          request.url,
        ).origin,
      );

    return NextResponse.json<IntegrationSandboxApiResponse>(
      {
        success:
          sandbox.success,

        sandbox,
      },
      {
        status:
          sandbox.success
            ? 200
            : 500,
      },
    );
  } catch (error) {
    return sandboxErrorResponse(
      error,
    );
  }
}