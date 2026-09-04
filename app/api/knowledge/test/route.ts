import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import { simulateKnowledgeGrounding } from "@/lib/knowledge/service";

export async function POST(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json(
        { success: false, error: "Question is required for grounding simulation." },
        { status: 400 }
      );
    }

    const result = await simulateKnowledgeGrounding(supabase, user.id, question);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Knowledge grounding simulation error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "J10 NEXUS could not simulate knowledge grounding.",
      },
      { status: 500 }
    );
  }
}
