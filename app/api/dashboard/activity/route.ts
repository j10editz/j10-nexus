import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
              // Ignore cookie write errors
              // in read-only server contexts.
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
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

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
      .order("created_at", {
        ascending: false,
      })
      .limit(10);

    if (activityError) {
      console.error(
        "Activity API error:",
        activityError
      );

      return NextResponse.json(
        {
          error:
            "Could not load recent activity.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      activity: activity ?? [],
    });
  } catch (error) {
    console.error(
      "Dashboard activity API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "J10 NEXUS could not load recent activity.",
      },
      {
        status: 500,
      }
    );
  }
}