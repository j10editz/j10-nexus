import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import {
  registerCustomDomain,
  removeCustomDomain,
} from "@/lib/agency/domains";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const { data: domains, error } = await supabase
      .from("workspace_domains")
      .select("*")
      .eq("workspace_id", context.workspace.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, domains: domains || [] });
  } catch (error) {
    console.error("GET /api/agency/domains error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch domains.",
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
    const supabase = createServerSupabaseClient();
    const body = await req.json().catch(() => ({}));

    if (!body.domain || typeof body.domain !== "string") {
      return NextResponse.json(
        { success: false, error: "domain is required." },
        { status: 400 }
      );
    }

    const result = await registerCustomDomain(
      supabase,
      context.workspace.id,
      body.domain,
      context.workspace.plan
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agency/domains error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to register custom domain.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const { searchParams } = new URL(req.url);
    const domainId = searchParams.get("domainId");

    if (!domainId) {
      return NextResponse.json(
        { success: false, error: "domainId parameter is required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const result = await removeCustomDomain(supabase, context.workspace.id, domainId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("DELETE /api/agency/domains error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove custom domain.",
      },
      { status: 500 }
    );
  }
}
