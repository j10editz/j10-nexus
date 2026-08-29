import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Cookie writes may be unavailable in route handlers.
          }
        },
      },
    },
  );
}

async function authorize(context: RouteContext) {
  const { id } = await context.params;
  const supabase = await getSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 },
      ),
    } as const;
  }

  const { data: automation, error } = await supabase
    .from("automations")
    .select("id, name, status, published_version_id")
    .eq("id", id)
    .eq("user_id", user.id)
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

  return { supabase, user, automation } as const;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authorized = await authorize(context);

    if ("response" in authorized) {
      return authorized.response;
    }

    const { data, error } = await authorized.supabase
      .from("automation_versions")
      .select(
        `
        id,
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
      .eq("user_id", authorized.user.id)
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
    const authorized = await authorize(context);

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
        user_id: authorized.user.id,
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
