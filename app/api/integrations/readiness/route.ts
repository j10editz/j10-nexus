import {
  NextResponse,
} from "next/server";

import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

import {
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
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const connections = await listIntegrationConnections(
      supabase,
      context.workspace.id,
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