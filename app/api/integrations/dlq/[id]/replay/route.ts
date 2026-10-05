import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { replayDeadLetterEvent } from "@/lib/integrations/dlq";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    let workspaceId: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      workspaceId = body?.workspaceId;
    } catch {
      // Body optional
    }

    const result = await replayDeadLetterEvent(supabase, user.id, id, workspaceId);

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Failed to replay dead-letter event.");
  }
}
