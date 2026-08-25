import { NextResponse } from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "../../../../lib/integrations/api";

import {
  getIntegrationRuntimeSummary,
} from "../../../../lib/integrations/runtime-registry";

export async function GET() {
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

    return NextResponse.json({
      success: true,
      runtime:
        getIntegrationRuntimeSummary(),
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not load the connector runtime registry.",
    );
  }
}