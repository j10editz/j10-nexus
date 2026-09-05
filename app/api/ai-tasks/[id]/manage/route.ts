import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getJ10AIMode } from "@/lib/ai/runtime";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type TaskManageAction =
  | "cancel"
  | "retry";

type ManageTaskRequest = {
  action?: TaskManageAction;
};

type WorkforceTaskRow = {
  id: string;
  workspace_id?: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  title: string;
  task_type: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
};

async function recordTaskActivity({
  supabase,
  userId,
  workspaceId,
  task,
  action,
  title,
  description,
}: {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  task: WorkforceTaskRow;
  action: string;
  title: string;
  description: string;
}) {
  const { error } = await supabase
    .from("activity_logs")
    .insert({
      workspace_id: task.workspace_id || workspaceId,
      user_id: userId,
      action,
      entity_type: "ai_employee",
      entity_id: task.employee_id,
      title,
      description,
      metadata: {
        source:
          "ai_workforce_task_management",

        task_id:
          task.id,

        task_title:
          task.title,

        task_type:
          task.task_type,

        employee_id:
          task.employee_id,

        employee_name:
          task.employee_name,

        exact_employee_binding:
          true,

        j10_ai_mode:
          getJ10AIMode(),
      },
    });

  if (error) {
    console.error(
      "AI task management activity error:",
      error
    );
  }
}

export async function POST(
  request: Request,
  routeContext: RouteContext
) {
  try {
    const { id } =
      await routeContext.params;

    const taskId =
      id?.trim();

    if (!taskId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Task ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      (await request.json()) as ManageTaskRequest;

    const action =
      body.action;

    if (
      action !== "cancel" &&
      action !== "retry"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unsupported task management action.",
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
    const { context } = auth;
    const supabase = createServerSupabaseClient();
    const user = context.user;
    const workspaceId = context.workspace.id;

    const {
      data: taskData,
      error: taskError,
    } =
      await supabase
        .from("ai_tasks")
        .select(
          `
          id,
          workspace_id,
          user_id,
          employee_id,
          employee_name,
          title,
          task_type,
          status
          `
        )
        .eq(
          "id",
          taskId
        )
        .eq(
          "workspace_id",
          workspaceId
        )
        .maybeSingle();

    if (
      taskError ||
      !taskData
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Task not found.",
        },
        {
          status: 404,
        }
      );
    }

    const task =
      taskData as WorkforceTaskRow;

    const {
      data: employee,
      error: employeeError,
    } =
      await supabase
        .from("employees")
        .select(
          `
          id,
          name,
          status
          `
        )
        .eq(
          "id",
          task.employee_id
        )
        .eq(
          "workspace_id",
          workspaceId
        )
        .maybeSingle();

    if (
      employeeError ||
      !employee
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The exact AI employee assigned to this task could not be verified.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      action === "cancel"
    ) {
      if (
        task.status !==
        "pending"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              `Only Pending tasks can be cancelled. Current status: ${task.status}.`,
          },
          {
            status: 409,
          }
        );
      }

      const now =
        new Date().toISOString();

      const {
        data: cancelledTask,
        error: cancelError,
      } =
        await supabase
          .from("ai_tasks")
          .update({
            status:
              "cancelled",

            updated_at:
              now,
          })
          .eq(
            "id",
            task.id
          )
          .eq(
            "workspace_id",
            workspaceId
          )
          .eq(
            "status",
            "pending"
          )
          .select("*")
          .maybeSingle();

      if (
        cancelError ||
        !cancelledTask
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Task status changed before cancellation could complete. Refresh and try again.",
          },
          {
            status: 409,
          }
        );
      }

      await recordTaskActivity({
        supabase,
        userId:
          user.id,
        workspaceId,
        task,
        action:
          "ai_task_cancelled",
        title:
          `Task cancelled for ${task.employee_name}`,
        description:
          task.title,
      });

      return NextResponse.json({
        success: true,
        action:
          "cancel",
        message:
          "Task cancelled successfully.",
        task:
          cancelledTask,
      });
    }

    if (
      task.status !==
      "failed"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Only Failed tasks can be retried. Current status: ${task.status}.`,
        },
        {
          status: 409,
        }
      );
    }

    const now =
      new Date().toISOString();

    const {
      data: retryTask,
      error: retryError,
    } =
      await supabase
        .from("ai_tasks")
        .update({
          status:
            "pending",

          result_text:
            null,

          error_message:
            null,

          execution_mode:
            getJ10AIMode(),

          api_called:
            false,

          target_model:
            null,

          display_model:
            null,

          estimated_cost_usd:
            0,

          started_at:
            null,

          completed_at:
            null,

          updated_at:
            now,
        })
        .eq(
          "id",
          task.id
        )
        .eq(
          "workspace_id",
          workspaceId
        )
        .eq(
          "status",
          "failed"
        )
        .select("*")
        .maybeSingle();

    if (
      retryError ||
      !retryTask
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Task status changed before retry could be queued. Refresh and try again.",
        },
        {
          status: 409,
        }
      );
    }

    await recordTaskActivity({
      supabase,
      userId:
        user.id,
      workspaceId,
      task,
      action:
        "ai_task_retry_queued",
      title:
        `Retry queued for ${task.employee_name}`,
      description:
        task.title,
    });

    return NextResponse.json({
      success: true,
      action:
        "retry",
      message:
        "Task reset and ready for retry.",
      task:
        retryTask,
      runEndpoint:
        `/api/ai-tasks/${task.id}/run`,
    });
  } catch (error) {
    console.error(
      "AI task management error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not manage this task.",
      },
      {
        status: 500,
      }
    );
  }
}