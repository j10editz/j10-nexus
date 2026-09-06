import { NextResponse } from "next/server";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { verifyCustomDomainDns } from "@/lib/agency/domains";

export async function POST(req: Request) {
  try {
    const auth = await requireApiWorkspaceContext("admin");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const body = await req.json().catch(() => ({}));
    const domainId = body.domainId;

    if (!domainId || typeof domainId !== "string") {
      return NextResponse.json(
        { success: false, error: "domainId is required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const domain = await verifyCustomDomainDns(supabase, context.workspace.id, domainId);

    return NextResponse.json({
      success: true,
      message: `Domain ${domain.domain} verified and SSL issued successfully.`,
      domain,
    });
  } catch (error) {
    console.error("POST /api/agency/domains/verify error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to verify custom domain.",
      },
      { status: 400 }
    );
  }
}
