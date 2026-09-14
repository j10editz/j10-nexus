import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Authenticated, tenant-scoped export route for Telegram Business data.
 * Exports connections, consent records, and telegram inbox messages.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let workspaceId = searchParams.get("workspaceId");

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!workspaceId) {
      const { data: memberWs } = await supabase
        .from("workspace_memberships")
        .select("workspace_id, role")
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .limit(1)
        .maybeSingle();

      if (!memberWs) {
        return NextResponse.json({ error: "No authorized workspace found" }, { status: 403 });
      }
      workspaceId = memberWs.workspace_id;
    }


    // Check workspace role (owner or admin required for export)
    const { data: membership } = await supabase
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Forbidden: only workspace owners and admins can export integration data" },
        { status: 403 }
      );
    }

    const businessConnectionId = searchParams.get("businessConnectionId")?.trim() || null;

    // Fetch connections (optionally connection-scoped)
    let connQuery = supabase
      .from("telegram_business_connections")
      .select("id, business_connection_id, telegram_username, status, can_reply, is_enabled, consent_version, created_at, last_verified_at, last_event_at, disconnected_at")
      .eq("workspace_id", workspaceId);

    if (businessConnectionId) {
      connQuery = connQuery.eq("business_connection_id", businessConnectionId);
    }
    const { data: connections } = await connQuery;

    // Fetch consents
    let consentQuery = supabase
      .from("telegram_connection_consents")
      .select("id, consent_version, ai_provider, categories_processed, retention_days, revocation_method, authorized_at, revoked_at")
      .eq("workspace_id", workspaceId);

    if (businessConnectionId) {
      consentQuery = consentQuery.or(`business_connection_id.eq.${businessConnectionId},business_connection_id.is.null`);
    }
    const { data: consents } = await consentQuery;

    // Fetch messages (strictly connection-scoped if businessConnectionId provided)
    let messagesQuery = supabase
      .from("inbox_messages")
      .select("id, thread_id, direction, content, delivery_status, created_at, metadata")
      .eq("workspace_id", workspaceId)
      .eq("provider", "telegram");

    if (businessConnectionId) {
      messagesQuery = messagesQuery.filter("metadata->>business_connection_id", "eq", businessConnectionId);
    }
    const { data: messages } = await messagesQuery;

    // Fetch AI Jobs
    let jobsQuery = supabase
      .from("telegram_ai_jobs")
      .select("id, chat_id, status, attempts, next_attempt_at, created_at, updated_at")
      .eq("workspace_id", workspaceId);

    if (businessConnectionId) {
      jobsQuery = jobsQuery.eq("business_connection_id", businessConnectionId);
    }
    const { data: jobs } = await jobsQuery;

    const exportPayload = {
      export_version: "2026.1",
      exported_at: new Date().toISOString(),
      workspace_id: workspaceId,
      business_connection_id: businessConnectionId,
      requested_by_user_id: user.id,
      connections: connections || [],
      consents: consents || [],
      messages_count: (messages || []).length,
      messages: messages || [],
      jobs_count: (jobs || []).length,
      jobs: jobs || [],
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="telegram-data-export-${workspaceId}.json"`,
      },
    });
  } catch (err) {
    console.error("[Telegram Export Route] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
