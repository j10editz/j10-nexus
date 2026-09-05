import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext, type WorkspaceRole } from "@/lib/workspaces/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function authorize(context: RouteContext, minRole: WorkspaceRole = "viewer") {
  const { id } = await context.params;
  const auth = await requireApiWorkspaceContext(minRole);
  if (auth.error) {
    return { response: auth.error } as const;
  }
  const { context: wsContext } = auth;
  const supabase = createServerSupabaseClient();

  const { data: automation, error } = await supabase
    .from("automations")
    .select("id, workspace_id, name, status, published_version_id")
    .eq("id", id)
    .eq("workspace_id", wsContext.workspace.id)
    .maybeSingle();

  if (error) {
    console.error("J10 Flow version workflow lookup error:", error);
    return {
      response: NextResponse.json(
        { success: false, error: "Could not load workflow versions." },
        { status: 500 },
      ),
    } as const;
  }

  if (!automation) {
    return {
      response: NextResponse.json(
        { success: false, error: "Workflow not found." },
        { status: 404 },
      ),
    } as const;
  }

  return { supabase, wsContext, automation } as const;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authorized = await authorize(context, "viewer");

    if ("response" in authorized) {
      return authorized.response;
    }

    const { data, error } = await authorized.supabase
      .from("automation_versions")
      .select(
        `
        id,
        workspace_id,
        version_number,
        status,
        graph_version,
        graph_checksum,
        rollback_of_version_id,
        publication_note,
        published_at,
        retired_at,
        created_at,
        validation_warnings
        `,
      )
      .eq("automation_id", authorized.automation.id)
      .eq("workspace_id", authorized.wsContext.workspace.id)
      .order("version_number", { ascending: false })
      .limit(50);

    if (error) {
      console.error("J10 Flow version history error:", error);
      return NextResponse.json(
        { success: false, error: "Could not load workflow versions." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      currentVersionId: authorized.automation.published_version_id,
      versions: data ?? [],
    });
  } catch (error) {
    console.error("J10 Flow version history fatal error:", error);
    return NextResponse.json(
      { success: false, error: "J10 could not load workflow versions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorized = await authorize(context, "manager");

    if ("response" in authorized) {
      return authorized.response;
    }

    if (authorized.automation.status === "archived") {
      return NextResponse.json(
        { success: false, error: "Archived workflows cannot be rolled back." },
        { status: 409 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body contains invalid JSON." },
        { status: 400 },
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as Record<string, unknown>).sourceVersionId !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "A rollback source version is required." },
        { status: 400 },
      );
    }

    const sourceVersionId = String(
      (body as Record<string, unknown>).sourceVersionId,
    );
    const activate = (body as Record<string, unknown>).activate !== false;
    const { data, error } = await authorized.supabase.rpc(
      "rollback_automation_version_runtime",
      {
        p_automation_id: authorized.automation.id,
        p_source_version_id: sourceVersionId,
        p_activate: activate,
      },
    );

    if (error) {
      console.error("J10 Flow rollback error:", {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { success: false, error: "J10 could not roll back this workflow." },
        { status: 409 },
      );
    }

    const result = data as Record<string, unknown> | null;

    const { error: activityError } = await authorized.supabase
      .from("activity_logs")
      .insert({
        workspace_id: authorized.wsContext.workspace.id,
        user_id: authorized.wsContext.user.id,
        action: "automation_version_rolled_back",
        entity_type: "automation",
        entity_id: authorized.automation.id,
        title: `${authorized.automation.name} rolled back`,
        description: `A new immutable workflow version was created from a previous version.`,
        metadata: {
          source: "j10_flow_version_history",
          automation_id: authorized.automation.id,
          source_version_id: sourceVersionId,
          new_version_id: result?.automationVersionId ?? null,
          new_version_number: result?.versionNumber ?? null,
          activated: activate,
        },
      });

    if (activityError) {
      console.error("J10 Flow rollback activity error:", activityError);
    }

    return NextResponse.json({
      success: true,
      message: "Workflow rollback created and switched atomically.",
      rollback: result,
    });
  } catch (error) {
    console.error("J10 Flow rollback fatal error:", error);
    return NextResponse.json(
      { success: false, error: "J10 could not roll back this workflow." },
      { status: 500 },
    );
  }
}
