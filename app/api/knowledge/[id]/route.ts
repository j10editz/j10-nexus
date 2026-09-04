import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import {
  estimateTokenCount,
  KNOWLEDGE_CATEGORIES,
} from "@/lib/knowledge/service";
import type { KnowledgeCategory } from "@/types/knowledge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { data: document, error } = await supabase
      .from("company_knowledge_documents")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !document) {
      return NextResponse.json(
        { success: false, error: "Knowledge document not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, document });
  } catch (error) {
    console.error("Knowledge document GET error:", error);
    return NextResponse.json(
      { success: false, error: "Could not load knowledge document." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }

    if (typeof body.content === "string" && body.content.trim()) {
      updates.content = body.content.trim();
      updates.token_count = estimateTokenCount(updates.content as string);
    }

    if (body.category && body.category in KNOWLEDGE_CATEGORIES) {
      updates.category = body.category as KnowledgeCategory;
    }

    if (Array.isArray(body.tags)) {
      updates.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
    }

    if (typeof body.is_grounding_active === "boolean") {
      updates.is_grounding_active = body.is_grounding_active;
    }

    if (body.status === "published" || body.status === "draft" || body.status === "archived") {
      updates.status = body.status;
    }

    const { data: document, error } = await supabase
      .from("company_knowledge_documents")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error || !document) {
      console.error("Knowledge document update error:", error);
      return NextResponse.json(
        { success: false, error: "Could not update knowledge document." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      document,
      message: "Document updated successfully.",
    });
  } catch (error) {
    console.error("Knowledge document PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Could not update knowledge document." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { error } = await supabase
      .from("company_knowledge_documents")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Knowledge document deletion error:", error);
      return NextResponse.json(
        { success: false, error: "Could not delete knowledge document." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Knowledge document deleted.",
    });
  } catch (error) {
    console.error("Knowledge document DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Could not delete knowledge document." },
      { status: 500 }
    );
  }
}
