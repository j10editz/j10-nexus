import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type CreateWorkflowRequest = {
  name?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  actions?: unknown[];
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
            // Cookie writes may not be available
            // in every server context.
          }
        },
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = await getSupabase();

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

    const {
      data: workflows,
      error,
    } = await supabase
      .from("workflows")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Workflow fetch error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflows.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      workflows: workflows ?? [],
    });
  } catch (error) {
    console.error(
      "Automation API GET error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Automation service failed.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as CreateWorkflowRequest;

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    const triggerType =
      typeof body.triggerType === "string"
        ? body.triggerType.trim()
        : "Manual";

    const triggerConfig =
      body.triggerConfig &&
      typeof body.triggerConfig === "object"
        ? body.triggerConfig
        : {};

    const actions = Array.isArray(
      body.actions
    )
      ? body.actions
      : [];

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow name is required.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase = await getSupabase();

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

    const {
      data: workflow,
      error,
    } = await supabase
      .from("workflows")
      .insert({
        user_id: user.id,
        name,
        description,
        status: "Draft",
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        actions,
        runs_count: 0,
      })
      .select("*")
      .single();

    if (error) {
      console.error(
        "Workflow creation error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not create workflow.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "Workflow created successfully.",
        workflow,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Automation API POST error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Automation service failed.",
      },
      {
        status: 500,
      }
    );
  }
}