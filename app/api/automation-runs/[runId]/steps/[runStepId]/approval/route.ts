import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  cookies,
} from "next/headers";

import {
  createServerClient,
} from "@supabase/ssr";

type RouteContext = {
  params: Promise<{
    runId: string;
    runStepId: string;
  }>;
};

type ApprovalBody = {
  decision:
    | "approve"
    | "reject";

  note?: string;
};

async function getSupabase() {
  const cookieStore =
    await cookies();

  return createServerClient(
    process.env
      .NEXT_PUBLIC_SUPABASE_URL!,
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(
          cookiesToSet
        ) {
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
            /*
            Cookie writes may not be available
            in every route-handler context.
            */
          }
        },
      },
    }
  );
}

function safeCounter(
  value:
    | number
    | null
    | undefined
) {
  const parsed =
    Number(value ?? 0);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    parsed
  );
}

/*
============================================================
POST
APPROVE / REJECT WORKFLOW APPROVAL
============================================================
*/

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      runId,
      runStepId,
    } =
      await context.params;

    const supabase =
      await getSupabase();

    const {
      data: {
        user,
      },

      error:
        userError,
    } =
      await supabase.auth.getUser();

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

    /*
    ============================================================
    BODY
    ============================================================
    */

    let body:
      ApprovalBody;

    try {
      body =
        (await request.json()) as ApprovalBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid approval request.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      body.decision !==
        "approve" &&
      body.decision !==
        "reject"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Decision must be approve or reject.",
        },
        {
          status: 400,
        }
      );
    }

    const note =
      body.note?.trim() ||
      null;

    /*
    ============================================================
    LOAD RUN STEP
    ============================================================
    */

    const {
      data:
        runStep,

      error:
        runStepError,
    } =
      await supabase
        .from(
          "automation_run_steps"
        )
        .select(
          `
          id,
          run_id,
          automation_id,
          automation_step_id,
          user_id,
          step_order,
          step_type,
          action_type,
          employee_id,
          employee_name,
          ai_task_id,
          status,
          requires_approval,
          approval_status,
          approved_by,
          approval_note,
          approved_at,
          input_payload
          `
        )
        .eq(
          "id",
          runStepId
        )
        .eq(
          "run_id",
          runId
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (runStepError) {
      console.error(
        "Approval run-step lookup error:",
        runStepError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load approval step.",
        },
        {
          status: 500,
        }
      );
    }

    if (!runStep) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Approval step not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    ============================================================
    APPROVAL SAFETY
    ============================================================
    */

    if (
      !runStep.requires_approval
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This workflow step does not require approval.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      runStep.approval_status !==
      "pending"
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            `This approval was already ${runStep.approval_status}.`,
        },
        {
          status: 409,
        }
      );
    }

    if (
      runStep.status !==
      "awaiting_approval"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This workflow step is not awaiting approval.",
        },
        {
          status: 409,
        }
      );
    }

    /*
    ============================================================
    LOAD RUN
    ============================================================
    */

    const {
      data:
        run,

      error:
        runError,
    } =
      await supabase
        .from(
          "automation_runs"
        )
        .select(
          `
          id,
          automation_id,
          user_id,
          trigger_type,
          trigger_payload,
          status,
          current_step_order,
          result_summary,
          error_message,
          execution_mode,
          api_called,
          total_cost_usd,
          started_at,
          completed_at
          `
        )
        .eq(
          "id",
          runId
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (
      runError ||
      !run
    ) {
      console.error(
        "Approval run lookup error:",
        runError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow execution not found.",
        },
        {
          status:
            runError
              ? 500
              : 404,
        }
      );
    }

    if (
      run.status !==
      "awaiting_approval"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow execution is no longer awaiting approval.",
        },
        {
          status: 409,
        }
      );
    }

    /*
    ============================================================
    LOAD AUTOMATION COUNTERS
    ============================================================
    */

    const {
      data:
        automation,

      error:
        automationError,
    } =
      await supabase
        .from(
          "automations"
        )
        .select(
          `
          id,
          name,
          status,
          successful_executions,
          failed_executions,
          awaiting_approval_executions
          `
        )
        .eq(
          "id",
          run.automation_id
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (
      automationError ||
      !automation
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow approval context.",
        },
        {
          status: 500,
        }
      );
    }

    const decidedAt =
      new Date().toISOString();

    /*
    ============================================================
    REJECT
    ============================================================
    */

    if (
      body.decision ===
      "reject"
    ) {
      const {
        error:
          rejectStepError,
      } =
        await supabase
          .from(
            "automation_run_steps"
          )
          .update({
            status:
              "failed",

            approval_status:
              "rejected",

            approved_by:
              user.id,

            approval_note:
              note,

            approved_at:
              decidedAt,
          })
          .eq(
            "id",
            runStep.id
          )
          .eq(
            "run_id",
            run.id
          )
          .eq(
            "user_id",
            user.id
          );

      if (
        rejectStepError
      ) {
        throw new Error(
          "Could not reject the workflow step."
        );
      }

      const rejectionMessage =
        note
          ? `Workflow rejected by human reviewer: ${note}`
          : "Workflow rejected by human reviewer.";

      const {
        error:
          rejectRunError,
      } =
        await supabase
          .from(
            "automation_runs"
          )
          .update({
            status:
              "failed",

            current_step_order:
              runStep.step_order,

            error_message:
              rejectionMessage,

            result_summary:
              rejectionMessage,

            completed_at:
              decidedAt,
          })
          .eq(
            "id",
            run.id
          )
          .eq(
            "user_id",
            user.id
          );

      if (
        rejectRunError
      ) {
        throw new Error(
          "Could not finalize the rejected workflow."
        );
      }

      await supabase
        .from(
          "automations"
        )
        .update({
          last_run_at:
            decidedAt,

          failed_executions:
            safeCounter(
              automation.failed_executions
            ) + 1,

          awaiting_approval_executions:
            Math.max(
              0,
              safeCounter(
                automation.awaiting_approval_executions
              ) - 1
            ),

          updated_at:
            decidedAt,
        })
        .eq(
          "id",
          automation.id
        )
        .eq(
          "user_id",
          user.id
        );

      return NextResponse.json({
        success: true,

        decision:
          "rejected",

        message:
          "Workflow rejected successfully.",

        run: {
          id:
            run.id,

          status:
            "failed",
        },

        approval: {
          runStepId:
            runStep.id,

          approvalStatus:
            "rejected",

          approvedBy:
            user.id,

          approvedAt:
            decidedAt,
        },
      });
    }

    /*
    ============================================================
    APPROVE
    ============================================================
    */

    const {
      error:
        approveStepError,
    } =
      await supabase
        .from(
          "automation_run_steps"
        )
        .update({
          status:
            "completed",

          approval_status:
            "approved",

          approved_by:
            user.id,

          approval_note:
            note,

          approved_at:
            decidedAt,
        })
        .eq(
          "id",
          runStep.id
        )
        .eq(
          "run_id",
          run.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (
      approveStepError
    ) {
      throw new Error(
        "Could not approve the workflow step."
      );
    }

    /*
    ============================================================
    FIND NEXT WORKFLOW STEP
    ============================================================
    */

    const {
      data:
        nextStep,

      error:
        nextStepError,
    } =
      await supabase
        .from(
          "automation_steps"
        )
        .select(
          `
          id,
          step_order,
          step_type,
          action_type,
          name
          `
        )
        .eq(
          "automation_id",
          run.automation_id
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "is_enabled",
          true
        )
        .gt(
          "step_order",
          runStep.step_order
        )
        .order(
          "step_order",
          {
            ascending:
              true,
          }
        )
        .limit(1)
        .maybeSingle();

    if (nextStepError) {
      throw new Error(
        "Could not determine the next workflow step."
      );
    }

    /*
    ============================================================
    PROTECTED BUSINESS ACTION
    Approval is recorded, but execution is intentionally
    queued for 12G-B instead of pretending the write happened.
    ============================================================
    */

    const protectedAction =
      runStep.step_type ===
        "action" &&
      (
        runStep.action_type ===
          "add_crm_note" ||
        runStep.action_type ===
          "update_crm_status"
      );

    if (protectedAction) {
      await supabase
        .from(
          "automation_run_steps"
        )
        .update({
          status:
            "queued",
        })
        .eq(
          "id",
          runStep.id
        )
        .eq(
          "run_id",
          run.id
        )
        .eq(
          "user_id",
          user.id
        );

      await supabase
        .from(
          "automation_runs"
        )
        .update({
          status:
            "queued",

          current_step_order:
            runStep.step_order,

          result_summary:
            `Human approved protected action at Step ${runStep.step_order}. Action execution is queued.`,
        })
        .eq(
          "id",
          run.id
        )
        .eq(
          "user_id",
          user.id
        );

      await supabase
        .from(
          "automations"
        )
        .update({
          awaiting_approval_executions:
            Math.max(
              0,
              safeCounter(
                automation.awaiting_approval_executions
              ) - 1
            ),

          updated_at:
            decidedAt,
        })
        .eq(
          "id",
          automation.id
        )
        .eq(
          "user_id",
          user.id
        );

      return NextResponse.json({
        success: true,

        decision:
          "approved",

        protectedAction:
          true,

        continuationRequired:
          true,

        message:
          "Human approval recorded. Protected business action is queued for execution.",

        run: {
          id:
            run.id,

          status:
            "queued",

          currentStepOrder:
            runStep.step_order,
        },

        approval: {
          runStepId:
            runStep.id,

          approvalStatus:
            "approved",

          approvedBy:
            user.id,

          approvedAt:
            decidedAt,
        },
      });
    }

    /*
    ============================================================
    FINAL APPROVAL STEP
    No more workflow steps remain.
    ============================================================
    */

    if (!nextStep) {
      const {
        error:
          finishRunError,
      } =
        await supabase
          .from(
            "automation_runs"
          )
          .update({
            status:
              "completed",

            current_step_order:
              null,

            result_summary:
              `Human approval completed the workflow at Step ${runStep.step_order}.`,

            error_message:
              null,

            completed_at:
              decidedAt,
          })
          .eq(
            "id",
            run.id
          )
          .eq(
            "user_id",
            user.id
          );

      if (
        finishRunError
      ) {
        throw new Error(
          "Approval succeeded but the workflow could not be finalized."
        );
      }

      await supabase
        .from(
          "automations"
        )
        .update({
          last_run_at:
            decidedAt,

          successful_executions:
            safeCounter(
              automation.successful_executions
            ) + 1,

          awaiting_approval_executions:
            Math.max(
              0,
              safeCounter(
                automation.awaiting_approval_executions
              ) - 1
            ),

          updated_at:
            decidedAt,
        })
        .eq(
          "id",
          automation.id
        )
        .eq(
          "user_id",
          user.id
        );

      return NextResponse.json({
        success: true,

        decision:
          "approved",

        continuationRequired:
          false,

        message:
          "Human approval completed the workflow successfully.",

        run: {
          id:
            run.id,

          status:
            "completed",

          currentStepOrder:
            null,
        },

        approval: {
          runStepId:
            runStep.id,

          approvalStatus:
            "approved",

          approvedBy:
            user.id,

          approvedAt:
            decidedAt,
        },
      });
    }

    /*
    ============================================================
    MORE STEPS REMAIN
    12G-B will continue from this exact next step.
    ============================================================
    */

    await supabase
      .from(
        "automation_runs"
      )
      .update({
        status:
          "queued",

        current_step_order:
          nextStep.step_order,

        result_summary:
          `Human approval granted. Workflow queued to continue at Step ${nextStep.step_order}.`,
      })
      .eq(
        "id",
        run.id
      )
      .eq(
        "user_id",
        user.id
      );

    await supabase
      .from(
        "automations"
      )
      .update({
        awaiting_approval_executions:
          Math.max(
            0,
            safeCounter(
              automation.awaiting_approval_executions
            ) - 1
          ),

        updated_at:
          decidedAt,
      })
      .eq(
        "id",
        automation.id
      )
      .eq(
        "user_id",
        user.id
      );

    return NextResponse.json({
      success: true,

      decision:
        "approved",

      continuationRequired:
        true,

      message:
        `Human approval recorded. Workflow is queued to continue at Step ${nextStep.step_order}.`,

      run: {
        id:
          run.id,

        status:
          "queued",

        currentStepOrder:
          nextStep.step_order,
      },

      nextStep: {
        id:
          nextStep.id,

        stepOrder:
          nextStep.step_order,

        stepType:
          nextStep.step_type,

        actionType:
          nextStep.action_type,

        name:
          nextStep.name,
      },

      approval: {
        runStepId:
          runStep.id,

        approvalStatus:
          "approved",

        approvedBy:
          user.id,

        approvedAt:
          decidedAt,
      },
    });
  } catch (error) {
    console.error(
      "J10 Human Approval Engine error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "J10 could not process the human approval decision.",
      },
      {
        status: 500,
      }
    );
  }
}