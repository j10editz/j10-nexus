import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
  integrationApiErrorResponse,
} from "@/lib/integrations/api";
import { listDeadLetterEvents } from "@/lib/integrations/dlq";

export async function GET(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const statusParam = searchParams.get("status") as "failed" | "retryable" | "processed" | "all" | null;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const result = await listDeadLetterEvents(supabase, user.id, {
      provider,
      status: statusParam || "all",
      limit,
    });

    return NextResponse.json({
      success: true,
      items: result.items,
      summary: result.summary,
    });
  } catch (error) {
    return integrationApiErrorResponse(error, "Failed to load dead-letter queue.");
  }
}
