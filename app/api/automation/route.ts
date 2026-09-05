import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

type CreateWorkflowRequest = {
  name?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  actions?: unknown[];
};

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const {
      data: automations,
      error,
    } = await supabase
      .from("automations")
      .select("*")
      .eq("workspace_id", context.workspace.id)
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
      workflows: automations ?? [],
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
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

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

    const triggerTypeRaw =
      typeof body.triggerType === "string"
        ? body.triggerType.trim().toLowerCase()
        : "manual";

    const allowedTriggerTypes = [
      "manual",
      "new_crm_contact",
      "crm_status_changed",
      "new_ai_task",
      "ai_task_completed",
      "schedule",
      "integration_event",
    ];

    const triggerType = allowedTriggerTypes.includes(triggerTypeRaw)
      ? triggerTypeRaw
      : "manual";

    const triggerConfig =
      body.triggerConfig &&
      typeof body.triggerConfig === "object"
        ? body.triggerConfig
        : {};

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

    const {
      data: automation,
      error,
    } = await supabase
      .from("automations")
      .insert({
        workspace_id: context.workspace.id,
        user_id: context.user.id,
        name,
        description,
        status: "draft",
        trigger_type: triggerType,
        trigger_config: triggerConfig,
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
        workflow: automation,
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