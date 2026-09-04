import { NextResponse } from "next/server";
import {
  createIntegrationApiClient,
  getAuthenticatedIntegrationUser,
} from "@/lib/integrations/api";
import {
  computeKnowledgeSummary,
  estimateTokenCount,
  KNOWLEDGE_CATEGORIES,
} from "@/lib/knowledge/service";
import type { KnowledgeCategory, KnowledgeDocument } from "@/types/knowledge";

export async function GET(request: Request) {
  try {
    const supabase = await createIntegrationApiClient();
    const user = await getAuthenticatedIntegrationUser(supabase);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim();
    const search = searchParams.get("search")?.trim().toLowerCase();

    let query = supabase
      .from("company_knowledge_documents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (category && category !== "all" && category in KNOWLEDGE_CATEGORIES) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      // If table does not exist yet, return empty list gracefully
      console.warn("Knowledge documents load warning:", error.message);
      return NextResponse.json({
        success: true,
        documents: [],
        summary: computeKnowledgeSummary([]),
      });
    }

    let documents = (data ?? []) as KnowledgeDocument[];

    if (search) {
      documents = documents.filter(
        (doc) =>
          doc.title.toLowerCase().includes(search) ||
          doc.content.toLowerCase().includes(search) ||
          doc.tags.some((t) => t.toLowerCase().includes(search))
      );
    }

    const summary = computeKnowledgeSummary((data ?? []) as KnowledgeDocument[]);

    return NextResponse.json({
      success: true,
      documents,
      summary,
    });
  } catch (error) {
    console.error("Knowledge GET API error:", error);
    return NextResponse.json(
      { success: false, error: "J10 NEXUS could not load knowledge base." },
      { status: 500 }
    );
  }
}

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
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const category: KnowledgeCategory =
      body.category && body.category in KNOWLEDGE_CATEGORIES
        ? body.category
        : "product_service";
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];
    const isGroundingActive = body.is_grounding_active !== false;

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Document title is required." },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        { success: false, error: "Document content is required." },
        { status: 400 }
      );
    }

    const tokenCount = estimateTokenCount(content);

    const { data: document, error: insertError } = await supabase
      .from("company_knowledge_documents")
      .insert({
        user_id: user.id,
        title,
        content,
        category,
        tags,
        status: "published",
        is_grounding_active: isGroundingActive,
        token_count: tokenCount,
      })
      .select("*")
      .single();

    if (insertError || !document) {
      console.error("Knowledge document creation error:", insertError);
      return NextResponse.json(
        {
          success: false,
          error: "Could not create knowledge document in database.",
        },
        { status: 500 }
      );
    }

    // Attempt activity log write
    try {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "knowledge_document_created",
        entity_type: "knowledge_document",
        entity_id: document.id,
        title: `Knowledge Document Added: ${document.title}`,
        description: `Added to ${KNOWLEDGE_CATEGORIES[category]} (~${tokenCount} tokens grounded).`,
        metadata: {
          category,
          token_count: tokenCount,
          is_grounding_active: isGroundingActive,
        },
      });
    } catch {}

    return NextResponse.json(
      {
        success: true,
        document,
        message: "Knowledge document added to Company Brain.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Knowledge POST API error:", error);
    return NextResponse.json(
      { success: false, error: "J10 NEXUS could not save knowledge document." },
      { status: 500 }
    );
  }
}
