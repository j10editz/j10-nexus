import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  getAvailableTemplates,
  applyWorkspaceTemplate,
} from "@/lib/agency/templates";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const templates = await getAvailableTemplates(supabase, context.workspace.id);
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error("GET /api/agency/templates error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch templates.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const body = await req.json().catch(() => ({}));
    const templateSlug = body.templateSlug;

    if (!templateSlug || typeof templateSlug !== "string") {
      return NextResponse.json(
        { success: false, error: "templateSlug is required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await applyWorkspaceTemplate(
      supabase,
      context.workspace.id,
      templateSlug
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agency/templates error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to apply template.",
      },
      { status: 500 }
    );
  }
}
