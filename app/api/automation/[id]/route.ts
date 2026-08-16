import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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
    | "run"
    | "update";

  name?: string;
  description?: string;
  triggerType?: string;
};

type WorkflowAction = {
  order: number;
  type: string;
  label: string;
  config?: Record<string, unknown>;
};

type WorkflowRunStatus =
  | "Completed"
  | "Blocked"
  | "Failed";

type WorkflowStepStatus =
  | "Completed"
  | "Blocked"
  | "Skipped"
  | "Failed";

type StepResult = {
  id?: string;
  order: number;
  type: string;
  label: string;
  status: WorkflowStepStatus;
  message?: string;
  output: Record<string, unknown>;
};

async function getSupabase() {
  const cookieStore =
    await cookies();

  return createServerClient(
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
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            // Cookie writes may not
            // be available in every
            // server context.
          }
        },
      },
    }
  );
}

type SupabaseClientType =
  Awaited<
    ReturnType<typeof getSupabase>
  >;

async function getAuthenticatedUser() {
  const supabase =
    await getSupabase();

  const {
    data: { user },
    error,
  } =
    await supabase.auth.getUser();

  return {
    supabase,
    user,
    error,
  };
}

/*
============================================================
GET ONE WORKFLOW
============================================================
*/

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const {
      supabase,
      user,
      error: userError,
    } =
      await getAuthenticatedUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
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
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (
      error ||
      !workflow
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow not found.",
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
    console.error(
      "Workflow GET error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Could not load workflow.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
PATCH WORKFLOW
============================================================
*/

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const body =
      (await request.json()) as UpdateWorkflowRequest;

    const {
      supabase,
      user,
      error: userError,
    } =
      await getAuthenticatedUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: currentWorkflow,
      error: workflowError,
    } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (
      workflowError ||
      !currentWorkflow
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    ============================================================
    REAL EXECUTION ENGINE
    ============================================================
    */

    if (
      body.action === "run"
    ) {
      return executeWorkflowRun({
        supabase,
        userId: user.id,
        workflow:
          currentWorkflow,
      });
    }

    /*
    ============================================================
    NORMAL WORKFLOW CONTROLS
    ============================================================
    */

    const updateData: Record<
      string,
      unknown
    > = {
      updated_at:
        new Date().toISOString(),
    };

    let activityAction =
      "workflow_updated";

    let activityTitle =
      `${currentWorkflow.name} updated`;

    let activityDescription =
      `${currentWorkflow.name} was updated.`;

    switch (body.action) {
      case "start": {
        updateData.status =
          "Running";

        activityAction =
          "workflow_started";

        activityTitle =
          `${currentWorkflow.name} started`;

        activityDescription =
          `${currentWorkflow.name} is now active.`;

        break;
      }

      case "pause": {
        updateData.status =
          "Paused";

        activityAction =
          "workflow_paused";

        activityTitle =
          `${currentWorkflow.name} paused`;

        activityDescription =
          `${currentWorkflow.name} was paused.`;

        break;
      }

      case "resume": {
        updateData.status =
          "Running";

        activityAction =
          "workflow_resumed";

        activityTitle =
          `${currentWorkflow.name} resumed`;

        activityDescription =
          `${currentWorkflow.name} resumed running.`;

        break;
      }

      case "update": {
        if (
          typeof body.name ===
            "string" &&
          body.name.trim()
        ) {
          updateData.name =
            body.name.trim();
        }

        if (
          typeof body.description ===
          "string"
        ) {
          updateData.description =
            body.description.trim();
        }

        if (
          typeof body.triggerType ===
            "string" &&
          body.triggerType.trim()
        ) {
          updateData.trigger_type =
            body.triggerType.trim();
        }

        const updatedName =
          typeof updateData.name ===
          "string"
            ? updateData.name
            : currentWorkflow.name;

        activityAction =
          "workflow_edited";

        activityTitle =
          `${updatedName} edited`;

        activityDescription =
          "Workflow configuration was updated.";

        break;
      }

      default: {
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid workflow action.",
          },
          {
            status: 400,
          }
        );
      }
    }

    const {
      data: updatedWorkflow,
      error: updateError,
    } = await supabase
      .from("workflows")
      .update(updateData)
      .eq(
        "id",
        currentWorkflow.id
      )
      .eq(
        "user_id",
        user.id
      )
      .select("*")
      .single();

    if (
      updateError ||
      !updatedWorkflow
    ) {
      console.error(
        "Workflow update error:",
        updateError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not update workflow.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .insert({
        user_id:
          user.id,

        action:
          activityAction,

        entity_type:
          "workflow",

        entity_id:
          updatedWorkflow.id,

        title:
          activityTitle,

        description:
          activityDescription,

        metadata: {
          status:
            updatedWorkflow.status,

          trigger_type:
            updatedWorkflow.trigger_type,

          runs_count:
            updatedWorkflow.runs_count,
        },
      });

    if (activityError) {
      console.error(
        "Workflow activity log error:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Workflow updated successfully.",

      workflow:
        updatedWorkflow,
    });
  } catch (error) {
    console.error(
      "Workflow PATCH error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Could not update workflow.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
DELETE WORKFLOW
============================================================
*/

export async function DELETE(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const {
      supabase,
      user,
      error: userError,
    } =
      await getAuthenticatedUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: workflow,
      error: workflowError,
    } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (
      workflowError ||
      !workflow
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow not found.",
        },
        {
          status: 404,
        }
      );
    }

    const {
      error: deleteError,
    } = await supabase
      .from("workflows")
      .delete()
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      );

    if (deleteError) {
      console.error(
        "Workflow deletion error:",
        deleteError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not delete workflow.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .insert({
        user_id:
          user.id,

        action:
          "workflow_deleted",

        entity_type:
          "workflow",

        entity_id:
          null,

        title:
          `${workflow.name} deleted`,

        description:
          `${workflow.name} was removed from Automation Hub.`,

        metadata: {
          workflow_id:
            workflow.id,

          trigger_type:
            workflow.trigger_type,

          runs_count:
            workflow.runs_count,
        },
      });

    if (activityError) {
      console.error(
        "Workflow delete log error:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Workflow deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Workflow DELETE error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Could not delete workflow.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
J10 NEXUS WORKFLOW EXECUTION ENGINE
============================================================
*/

async function executeWorkflowRun({
  supabase,
  userId,
  workflow,
}: {
  supabase:
    SupabaseClientType;

  userId: string;

  workflow: {
    id: string;
    name: string;
    status: string;
    trigger_type: string;
    trigger_config: unknown;
    actions: unknown;
    runs_count: number | null;
  };
}) {
  const startedAt =
    new Date().toISOString();

  const actions =
    getWorkflowActions(
      workflow.actions
    );

  /*
  ------------------------------------------------------------
  CREATE EXECUTION
  ------------------------------------------------------------
  */

  const {
    data: createdRun,
    error: runCreateError,
  } = await supabase
    .from("workflow_runs")
    .insert({
      workflow_id:
        workflow.id,

      user_id:
        userId,

      status:
        "Running",

      trigger_type:
        "Manual",

      started_at:
        startedAt,

      metadata: {
        source:
          "manual_run",

        workflow_status:
          workflow.status,

        workflow_trigger:
          workflow.trigger_type,

        total_steps:
          actions.length,
      },
    })
    .select("*")
    .single();

  if (
    runCreateError ||
    !createdRun
  ) {
    console.error(
      "Workflow run creation error:",
      runCreateError
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not create the workflow execution.",
      },
      {
        status: 500,
      }
    );
  }

  const stepResults:
    StepResult[] = [];

  let finalStatus:
    WorkflowRunStatus =
      "Completed";

  let stopReason:
    string | null = null;

  /*
  ------------------------------------------------------------
  NO ACTIONS
  ------------------------------------------------------------
  */

  if (
    actions.length === 0
  ) {
    finalStatus =
      "Blocked";

    stopReason =
      "This workflow has no configured execution steps.";
  }

  /*
  ------------------------------------------------------------
  EXECUTE ACTIONS IN ORDER
  ------------------------------------------------------------
  */

  for (
    const action of actions
  ) {
    /*
    ----------------------------------------------------------
    PREVIOUS STEP STOPPED EXECUTION
    ----------------------------------------------------------
    */

    if (stopReason) {
      const {
        data: skippedStep,
        error:
          skippedInsertError,
      } = await supabase
        .from(
          "workflow_run_steps"
        )
        .insert({
          run_id:
            createdRun.id,

          workflow_id:
            workflow.id,

          user_id:
            userId,

          step_order:
            action.order,

          action_type:
            action.type,

          action_label:
            action.label,

          status:
            "Skipped",

          output: {},

          error_message:
            `Skipped because execution stopped: ${stopReason}`,

          completed_at:
            new Date().toISOString(),
        })
        .select("*")
        .single();

      if (
        skippedInsertError
      ) {
        console.error(
          "Skipped step creation error:",
          skippedInsertError
        );
      }

      stepResults.push({
        id:
          skippedStep?.id,

        order:
          action.order,

        type:
          action.type,

        label:
          action.label,

        status:
          "Skipped",

        message:
          stopReason,

        output: {},
      });

      continue;
    }

    /*
    ----------------------------------------------------------
    CREATE RUNNING STEP
    ----------------------------------------------------------
    */

    const stepStartedAt =
      new Date().toISOString();

    const {
      data: createdStep,
      error:
        stepCreateError,
    } = await supabase
      .from(
        "workflow_run_steps"
      )
      .insert({
        run_id:
          createdRun.id,

        workflow_id:
          workflow.id,

        user_id:
          userId,

        step_order:
          action.order,

        action_type:
          action.type,

        action_label:
          action.label,

        status:
          "Running",

        output: {},

        started_at:
          stepStartedAt,
      })
      .select("*")
      .single();

    if (
      stepCreateError ||
      !createdStep
    ) {
      console.error(
        "Workflow step creation error:",
        stepCreateError
      );

      finalStatus =
        "Failed";

      stopReason =
        `J10 NEXUS could not initialize step ${action.order}.`;

      stepResults.push({
        order:
          action.order,

        type:
          action.type,

        label:
          action.label,

        status:
          "Failed",

        message:
          stopReason,

        output: {},
      });

      continue;
    }

    /*
    ----------------------------------------------------------
    DETERMINE WHETHER THE ACTION CAN ACTUALLY EXECUTE
    ----------------------------------------------------------
    */

    const capability =
      getRequiredCapability(
        action
      );

    /*
    ----------------------------------------------------------
    BLOCK EXTERNAL / UNAVAILABLE CAPABILITY
    ----------------------------------------------------------
    */

    if (capability) {
      const blockedMessage =
        `${capability} is required before J10 NEXUS can execute "${action.label}".`;

      const blockedOutput = {
        executable:
          false,

        required_capability:
          capability,

        action_type:
          action.type,
      };

      const {
        error:
          blockedUpdateError,
      } = await supabase
        .from(
          "workflow_run_steps"
        )
        .update({
          status:
            "Blocked",

          output:
            blockedOutput,

          error_message:
            blockedMessage,

          completed_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          createdStep.id
        )
        .eq(
          "user_id",
          userId
        );

      if (
        blockedUpdateError
      ) {
        console.error(
          "Blocked step update error:",
          blockedUpdateError
        );
      }

      finalStatus =
        "Blocked";

      stopReason =
        blockedMessage;

      stepResults.push({
        id:
          createdStep.id,

        order:
          action.order,

        type:
          action.type,

        label:
          action.label,

        status:
          "Blocked",

        message:
          blockedMessage,

        output:
          blockedOutput,
      });

      continue;
    }

    /*
    ----------------------------------------------------------
    EXECUTE INTERNAL J10 NEXUS ACTION
    ----------------------------------------------------------
    */

    try {
      const output =
        executeInternalAction(
          action
        );

      const {
        error:
          completedUpdateError,
      } = await supabase
        .from(
          "workflow_run_steps"
        )
        .update({
          status:
            "Completed",

          output,

          error_message:
            null,

          completed_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          createdStep.id
        )
        .eq(
          "user_id",
          userId
        );

      if (
        completedUpdateError
      ) {
        throw completedUpdateError;
      }

      stepResults.push({
        id:
          createdStep.id,

        order:
          action.order,

        type:
          action.type,

        label:
          action.label,

        status:
          "Completed",

        output,
      });
    } catch (error) {
      console.error(
        "Workflow step execution error:",
        error
      );

      const failureMessage =
        `Step ${action.order} failed during execution.`;

      await supabase
        .from(
          "workflow_run_steps"
        )
        .update({
          status:
            "Failed",

          output: {},

          error_message:
            failureMessage,

          completed_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          createdStep.id
        )
        .eq(
          "user_id",
          userId
        );

      finalStatus =
        "Failed";

      stopReason =
        failureMessage;

      stepResults.push({
        id:
          createdStep.id,

        order:
          action.order,

        type:
          action.type,

        label:
          action.label,

        status:
          "Failed",

        message:
          failureMessage,

        output: {},
      });
    }
  }

  /*
  ------------------------------------------------------------
  COMPLETE EXECUTION
  ------------------------------------------------------------
  */

  const completedAt =
    new Date().toISOString();

  const {
    error: runUpdateError,
  } = await supabase
    .from("workflow_runs")
    .update({
      status:
        finalStatus,

      completed_at:
        completedAt,

      error_message:
        stopReason,

      metadata: {
        source:
          "manual_run",

        workflow_status:
          workflow.status,

        workflow_trigger:
          workflow.trigger_type,

        total_steps:
          actions.length,

        completed_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Completed"
          ).length,

        blocked_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Blocked"
          ).length,

        skipped_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Skipped"
          ).length,

        failed_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Failed"
          ).length,
      },
    })
    .eq(
      "id",
      createdRun.id
    )
    .eq(
      "user_id",
      userId
    );

  if (runUpdateError) {
    console.error(
      "Workflow run completion error:",
      runUpdateError
    );
  }

  /*
  ------------------------------------------------------------
  UPDATE WORKFLOW RUN COUNTER
  ------------------------------------------------------------
  */

  const nextRunCount =
    Number(
      workflow.runs_count ??
        0
    ) + 1;

  const {
    data: updatedWorkflow,
    error:
      workflowUpdateError,
  } = await supabase
    .from("workflows")
    .update({
      runs_count:
        nextRunCount,

      last_run_at:
        completedAt,

      updated_at:
        completedAt,

      /*
       * Important:
       * Manual Run Now does NOT
       * automatically change the
       * automation's deployment
       * status.
       */
    })
    .eq(
      "id",
      workflow.id
    )
    .eq(
      "user_id",
      userId
    )
    .select("*")
    .single();

  if (
    workflowUpdateError ||
    !updatedWorkflow
  ) {
    console.error(
      "Workflow execution counter update error:",
      workflowUpdateError
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "The execution was recorded, but the workflow statistics could not be updated.",
      },
      {
        status: 500,
      }
    );
  }

  /*
  ------------------------------------------------------------
  ACTIVITY LOG
  ------------------------------------------------------------
  */

  const activity =
    getExecutionActivity({
      workflowName:
        workflow.name,

      status:
        finalStatus,

      reason:
        stopReason,
    });

  const {
    error:
      activityError,
  } = await supabase
    .from("activity_logs")
    .insert({
      user_id:
        userId,

      action:
        activity.action,

      entity_type:
        "workflow",

      entity_id:
        workflow.id,

      title:
        activity.title,

      description:
        activity.description,

      metadata: {
        run_id:
          createdRun.id,

        run_status:
          finalStatus,

        trigger_type:
          "Manual",

        total_steps:
          actions.length,

        completed_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Completed"
          ).length,

        blocked_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Blocked"
          ).length,

        skipped_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Skipped"
          ).length,

        failed_steps:
          stepResults.filter(
            (step) =>
              step.status ===
              "Failed"
          ).length,

        reason:
          stopReason,
      },
    });

  if (activityError) {
    console.error(
      "Workflow execution activity log error:",
      activityError
    );
  }

  /*
  ------------------------------------------------------------
  RESPONSE
  ------------------------------------------------------------
  */

  return NextResponse.json({
    success: true,

    message:
      finalStatus ===
      "Completed"
        ? "Workflow execution completed successfully."
        : finalStatus ===
            "Blocked"
          ? `Workflow execution was blocked: ${stopReason}`
          : `Workflow execution failed: ${stopReason}`,

    workflow:
      updatedWorkflow,

    execution: {
      id:
        createdRun.id,

      workflowId:
        workflow.id,

      status:
        finalStatus,

      startedAt,

      completedAt,

      error:
        stopReason,

      steps:
        stepResults,
    },
  });
}

/*
============================================================
ACTION PARSER
============================================================
*/

function getWorkflowActions(
  actions: unknown
): WorkflowAction[] {
  if (
    !Array.isArray(actions)
  ) {
    return [];
  }

  return actions
    .filter(
      (
        action
      ): action is Record<
        string,
        unknown
      > =>
        typeof action ===
          "object" &&
        action !== null &&
        !Array.isArray(
          action
        )
    )
    .map(
      (
        action,
        index
      ): WorkflowAction => {
        const configValue =
          action.config;

        const config =
          typeof configValue ===
            "object" &&
          configValue !==
            null &&
          !Array.isArray(
            configValue
          )
            ? (configValue as Record<
                string,
                unknown
              >)
            : undefined;

        return {
          order:
            typeof action.order ===
            "number"
              ? action.order
              : index + 1,

          type:
            typeof action.type ===
            "string"
              ? action.type
              : "unknown_action",

          label:
            typeof action.label ===
            "string"
              ? action.label
              : `Workflow Step ${
                  index + 1
                }`,

          config,
        };
      }
    )
    .sort(
      (a, b) =>
        a.order -
        b.order
    );
}

/*
============================================================
CAPABILITY CHECK
============================================================
*/

function getRequiredCapability(
  action: WorkflowAction
): string | null {
  const channelValue =
    action.config?.channel;

  const channel =
    typeof channelValue ===
    "string"
      ? channelValue.toLowerCase()
      : "";

  const label =
    action.label.toLowerCase();

  /*
  ------------------------------------------------------------
  WHATSAPP
  ------------------------------------------------------------
  */

  if (
    action.type ===
      "receive_message" &&
    label.includes(
      "whatsapp"
    )
  ) {
    return "WhatsApp integration";
  }

  if (
    action.type ===
      "send_message" &&
    (
      channel ===
        "whatsapp" ||
      label.includes(
        "whatsapp"
      )
    )
  ) {
    return "WhatsApp integration";
  }

  /*
  ------------------------------------------------------------
  EMAIL
  ------------------------------------------------------------
  */

  if (
    action.type ===
      "send_email" ||
    action.type ===
      "analyze_email"
  ) {
    return "Email integration";
  }

  /*
  ------------------------------------------------------------
  AI PROCESSING
  ------------------------------------------------------------
  */

  if (
    [
      "analyze_message",
      "generate_response",
      "analyze_audience",
      "generate_content",
      "classify_request",
      "respond_or_escalate",
      "analyze_request",
    ].includes(
      action.type
    )
  ) {
    return "J10 AI execution runtime";
  }

  /*
  ------------------------------------------------------------
  CRM / BUSINESS DATA
  ------------------------------------------------------------
  */

  if (
    action.type ===
      "check_response"
  ) {
    return "CRM integration";
  }

  /*
  ------------------------------------------------------------
  NOTIFICATIONS
  ------------------------------------------------------------
  */

  if (
    action.type ===
      "notify"
  ) {
    return "Notification integration";
  }

  /*
  ------------------------------------------------------------
  MARKETING
  ------------------------------------------------------------
  */

  if (
    [
      "launch_campaign",
      "analyze_results",
    ].includes(
      action.type
    )
  ) {
    return "Marketing integration";
  }

  /*
  ------------------------------------------------------------
  ASYNC WAIT / SCHEDULING
  ------------------------------------------------------------
  */

  if (
    action.type === "wait"
  ) {
    return "Asynchronous workflow scheduler";
  }

  /*
  ------------------------------------------------------------
  GENERIC BUSINESS TASK
  ------------------------------------------------------------
  */

  if (
    action.type ===
      "execute_task"
  ) {
    return "Business integration";
  }

  /*
  ------------------------------------------------------------
  GENERIC SEND MESSAGE
  ------------------------------------------------------------
  */

  if (
    action.type ===
      "send_message"
  ) {
    return "Messaging integration";
  }

  /*
  ------------------------------------------------------------
  INTERNAL ACTION
  ------------------------------------------------------------
  */

  if (
    action.type ===
      "record_result"
  ) {
    return null;
  }

  /*
   * Unknown action:
   * do not pretend we can execute it.
   */

  return `Executor for "${action.type}"`;
}

/*
============================================================
INTERNAL ACTION EXECUTION
============================================================
*/

function executeInternalAction(
  action: WorkflowAction
): Record<
  string,
  unknown
> {
  switch (action.type) {
    case "record_result": {
      return {
        success: true,

        recorded: true,

        message:
          "Workflow result recorded by J10 NEXUS.",

        recorded_at:
          new Date().toISOString(),
      };
    }

    default: {
      throw new Error(
        `No internal executor exists for ${action.type}.`
      );
    }
  }
}

/*
============================================================
ACTIVITY RESULT
============================================================
*/

function getExecutionActivity({
  workflowName,
  status,
  reason,
}: {
  workflowName: string;

  status:
    WorkflowRunStatus;

  reason:
    string | null;
}) {
  if (
    status ===
    "Completed"
  ) {
    return {
      action:
        "workflow_ran",

      title:
        `${workflowName} ran`,

      description:
        `${workflowName} completed a workflow execution successfully.`,
    };
  }

  if (
    status ===
    "Blocked"
  ) {
    return {
      action:
        "workflow_run_blocked",

      title:
        `${workflowName} run blocked`,

      description:
        reason ||
        `${workflowName} requires additional configuration before it can execute.`,
    };
  }

  return {
    action:
      "workflow_run_failed",

    title:
      `${workflowName} run failed`,

    description:
      reason ||
      `${workflowName} encountered an execution error.`,
  };
}