import {
  NextResponse,
} from "next/server";

import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "../../../../lib/integrations/api";

import {
  listIntegrationConnections,
} from "../../../../lib/integrations/database";

import {
  evaluateIntegrationReadiness,
} from "../../../../lib/integrations/readiness";

export async function GET() {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(
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

    const connections = await listIntegrationConnections(
      supabase,
      user.id,
    );
    const reports = connections.map(
      evaluateIntegrationReadiness,
    );
    const readiness = Object.fromEntries(
      reports.map((report) => [
        report.connectionId,
        report,
      ]),
    );

    return NextResponse.json({
      success: true,
      readiness,
      summary: {
        registered: reports.length,
        operational: reports.filter(
          (report) => report.state === "operational",
        ).length,
        ready: reports.filter(
          (report) => report.state === "ready",
        ).length,
        attention: reports.filter(
          (report) => report.state === "attention",
        ).length,
        blocked: reports.filter((report) =>
          [
            "blocked",
            "needs_configuration",
            "needs_credentials",
            "needs_authorization",
          ].includes(report.state),
        ).length,
      },
    });
  } catch (error) {
    return integrationApiErrorResponse(
      error,
      "J10 NEXUS could not evaluate integration readiness.",
    );
  }
}