import {
  NextResponse,
} from "next/server";

import type {
  IntegrationAnalyticsPeriod,
} from "../../../../types/integration-analytics";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "../../../../lib/integrations/api";

import {
  getIntegrationAnalytics,
} from "../../../../lib/integrations/analytics";

const ALLOWED_PERIODS =
  new Set<IntegrationAnalyticsPeriod>([
    7,
    30,
    90,
  ]);

function parsePeriod(
  value: string | null,
): IntegrationAnalyticsPeriod | null {
  if (!value) {
    return 30;
  }

  const parsed =
    Number.parseInt(
      value,
      10,
    ) as IntegrationAnalyticsPeriod;

  return ALLOWED_PERIODS.has(
    parsed,
  )
    ? parsed
    : null;
}

export async function GET(
  request: Request,
) {
  try {
    const supabase =
      await createIntegrationApiClient();

    const user =
      await getAuthenticatedIntegrationUser(
        supabase,
      );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      );
    }

    const url =
      new URL(request.url);

    const period =
      parsePeriod(
        url.searchParams.get(
          "days",
        ),
      );

    if (!period) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Analytics period must be 7, 30, or 90 days.",
        },
        {
          status: 400,
        },
      );
    }

    const analytics =
      await getIntegrationAnalytics(
        supabase,
        user.id,
        period,
      );

    return NextResponse.json(
      {
        success: true,
        analytics,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not generate integration analytics.",
    );
  }
}