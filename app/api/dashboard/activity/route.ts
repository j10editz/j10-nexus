import {
  NextRequest,
  NextResponse,
} from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

function getLimit(request: NextRequest) {
  const requested = Number(
    request.nextUrl.searchParams.get("limit") ?? 25
  );

  if (!Number.isFinite(requested)) {
    return 25;
  }

  return Math.min(
    Math.max(Math.floor(requested), 1),
    100
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const limit = getLimit(request);

    const {
      data: activity,
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .select(
        `
        id,
        workspace_id,
        user_id,
        action,
        entity_type,
        entity_id,
        title,
        description,
        metadata,
        created_at
        `
      )
      .eq("workspace_id", context.workspace.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(limit);

    if (activityError) {
      console.error(
        "Activity API error:",
        activityError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workspace activity.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      limit,
      activity: activity ?? [],
    });
  } catch (error) {
    console.error(
      "Dashboard activity API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not load workspace activity.",
      },
      {
        status: 500,
      }
    );
  }
}
