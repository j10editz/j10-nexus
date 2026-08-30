import {
  NextRequest,
  NextResponse,
} from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },

          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(
                ({ name, value, options }) => {
                  cookieStore.set(
                    name,
                    value,
                    options
                  );
                }
              );
            } catch {
              // Cookie writes can be unavailable in read-only contexts.
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const limit = getLimit(request);

    const {
      data: activity,
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .select(
        `
        id,
        action,
        entity_type,
        entity_id,
        title,
        description,
        metadata,
        created_at
        `
      )
      .eq("user_id", user.id)
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
