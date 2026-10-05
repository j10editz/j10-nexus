import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { resolveDeadLetterEvent } from "@/lib/integrations/dlq";

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

    let note: string | undefined;
    try {
      const body = await request.json().catch(() => ({}));
      note = body?.note;
    } catch {
      // Optional body
    }

    const result = await resolveDeadLetterEvent(supabase, user.id, id, note);

    return NextResponse.json({
      success: result.success,
      result,
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Failed to resolve dead-letter event.");
  }
}
