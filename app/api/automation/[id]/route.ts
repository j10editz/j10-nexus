import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateWorkflowRequest = {
  action?:
    | "start"
    | "pause"
    | "resume"
    | "archive"
    | "update";
  name?: string;
  description?: string;
  triggerType?: string;
  status?: string;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const { data: workflow, error } = await supabase
      .from("automations")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .maybeSingle();

    if (error || !workflow) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      workflow,
    });
  } catch (error) {
    console.error("Workflow GET error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not load workflow.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const {
      data: currentWorkflow,
      error: workflowError,
    } = await supabase
      .from("automations")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .maybeSingle();

    if (workflowError || !currentWorkflow) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow not found.",
        },
        {
          status: 404,
        }
      );
    }

    const body = (await request.json().catch(() => ({}))) as UpdateWorkflowRequest;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    let activityAction = "workflow_updated";
    let activityTitle = `${currentWorkflow.name} updated`;
    let activityDescription = `${currentWorkflow.name} was updated.`;

    if (body.action === "start" || body.action === "resume") {
      updateData.status = "active";
      activityAction = body.action === "start" ? "workflow_started" : "workflow_resumed";
      activityTitle = `${currentWorkflow.name} ${body.action === "start" ? "started" : "resumed"}`;
      activityDescription = `${currentWorkflow.name} is now active.`;
    } else if (body.action === "pause") {
      updateData.status = "paused";
      activityAction = "workflow_paused";
      activityTitle = `${currentWorkflow.name} paused`;
      activityDescription = `${currentWorkflow.name} was paused.`;
    } else if (body.action === "archive") {
      updateData.status = "archived";
      activityAction = "workflow_archived";
      activityTitle = `${currentWorkflow.name} archived`;
      activityDescription = `${currentWorkflow.name} was archived.`;
    } else if (body.status) {
      const allowed = ["draft", "active", "paused", "archived"];
      if (allowed.includes(body.status.toLowerCase())) {
        updateData.status = body.status.toLowerCase();
      }
    }

    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    if (typeof body.description === "string") {
      updateData.description = body.description.trim();
    }
    if (typeof body.triggerType === "string" && body.triggerType.trim()) {
      updateData.trigger_type = body.triggerType.trim().toLowerCase();
    }

    const {
      data: updatedWorkflow,
      error: updateError,
    } = await supabase
      .from("automations")
      .update(updateData)
      .eq("id", currentWorkflow.id)
      .eq("workspace_id", wsContext.workspace.id)
      .select("*")
      .single();

    if (updateError || !updatedWorkflow) {
      console.error("Workflow update error:", updateError);

      return NextResponse.json(
        {
          success: false,
          error: "Could not update workflow.",
        },
        {
          status: 500,
        }
      );
    }

    const { error: activityError } = await supabase
      .from("activity_logs")
      .insert({
        workspace_id: wsContext.workspace.id,
        user_id: wsContext.user.id,
        action: activityAction,
        entity_type: "workflow",
        entity_id: updatedWorkflow.id,
        title: activityTitle,
        description: activityDescription,
        metadata: {
          status: updatedWorkflow.status,
          trigger_type: updatedWorkflow.trigger_type,
        },
      });

    if (activityError) {
      console.error("Workflow activity log error:", activityError);
    }

    return NextResponse.json({
      success: true,
      message: "Workflow updated successfully.",
      workflow: updatedWorkflow,
    });
  } catch (error) {
    console.error("Workflow PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not update workflow.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context: wsContext } = auth;
    const supabase = createServerSupabaseClient();

    const {
      data: workflow,
      error: workflowError,
    } = await supabase
      .from("automations")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id)
      .maybeSingle();

    if (workflowError || !workflow) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow not found.",
        },
        {
          status: 404,
        }
      );
    }

    const { error: deleteError } = await supabase
      .from("automations")
      .delete()
      .eq("id", id)
      .eq("workspace_id", wsContext.workspace.id);

    if (deleteError) {
      console.error("Workflow deletion error:", deleteError);

      return NextResponse.json(
        {
          success: false,
          error: "Could not delete workflow.",
        },
        {
          status: 500,
        }
      );
    }

    const { error: activityError } = await supabase
      .from("activity_logs")
      .insert({
        workspace_id: wsContext.workspace.id,
        user_id: wsContext.user.id,
        action: "workflow_deleted",
        entity_type: "workflow",
        entity_id: null,
        title: `${workflow.name} deleted`,
        description: `${workflow.name} was removed from Automation Hub.`,
        metadata: {
          workflow_id: workflow.id,
          trigger_type: workflow.trigger_type,
        },
      });

    if (activityError) {
      console.error("Workflow delete log error:", activityError);
    }

    return NextResponse.json({
      success: true,
      message: "Workflow deleted successfully.",
    });
  } catch (error) {
    console.error("Workflow DELETE error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not delete workflow.",
      },
      {
        status: 500,
      }
    );
  }
}