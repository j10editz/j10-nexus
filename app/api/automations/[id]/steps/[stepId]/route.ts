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

import {
  validateAutomationStepConfig,
} from "@/lib/automation/failure-policy";

type RouteContext = {
  params: Promise<{
    id: string;
    stepId: string;
  }>;
};

type StepType =
  | "ai_task"
  | "action"
  | "condition"
  | "approval"
  | "activity";

type UpdateStepBody = {
  stepOrder?: number;

  name?:
    | string
    | null;

  stepType?: StepType;

  actionType?:
    | string
    | null;

  employeeId?:
    | string
    | null;

  taskType?:
    | string
    | null;

  instructions?:
    | string
    | null;

  config?: Record<
    string,
    unknown
  >;

  conditionConfig?: Record<
    string,
    unknown
  >;

  requiresApproval?: boolean;

  approvalType?:
    | "human"
    | null;

  isEnabled?: boolean;
};

const allowedStepTypes: StepType[] = [
  "ai_task",
  "action",
  "condition",
  "approval",
  "activity",
];

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
            Cookie mutation may not be available
            in every route-handler context.
            */
          }
        },
      },
    }
  );
}

async function getAuthenticatedUser() {
  const supabase =
    await getSupabase();

  const {
    data: {
      user,
    },

    error,
  } =
    await supabase.auth.getUser();

  return {
    supabase,
    user,
    error,
  };
}

const stepSelect = `
  id,
  automation_id,
  user_id,
  step_order,
  name,
  step_type,
  action_type,
  employee_id,
  employee_name,
  task_type,
  instructions,
  config,
  condition_config,
  requires_approval,
  approval_type,
  on_success_step_id,
  on_failure_step_id,
  is_enabled,
  created_at,
  updated_at
`;

async function verifyAutomation(
  supabase: Awaited<
    ReturnType<typeof getSupabase>
  >,
  automationId: string,
  userId: string
) {
  const {
    data,
    error,
  } =
    await supabase
      .from("automations")
      .select(
        `
        id,
        name,
        status
        `
      )
      .eq(
        "id",
        automationId
      )
      .eq(
        "user_id",
        userId
      )
      .maybeSingle();

  return {
    automation: data,
    error,
  };
}

async function verifyStep(
  supabase: Awaited<
    ReturnType<typeof getSupabase>
  >,
  automationId: string,
  stepId: string,
  userId: string
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "automation_steps"
      )
      .select(
        stepSelect
      )
      .eq(
        "id",
        stepId
      )
      .eq(
        "automation_id",
        automationId
      )
      .eq(
        "user_id",
        userId
      )
      .maybeSingle();

  return {
    step: data,
    error,
  };
}

/*
============================================================
GET
Single workflow step
============================================================
*/

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
      stepId,
    } =
      await context.params;

    const {
      supabase,
      user,
      error:
        userError,
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
      automation,
      error:
        automationError,
    } =
      await verifyAutomation(
        supabase,
        id,
        user.id
      );

    if (automationError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not verify workflow.",
        },
        {
          status: 500,
        }
      );
    }

    if (!automation) {
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
      step,
      error:
        stepError,
    } =
      await verifyStep(
        supabase,
        id,
        stepId,
        user.id
      );

    if (stepError) {
      console.error(
        "Workflow step GET error:",
        stepError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow step.",
        },
        {
          status: 500,
        }
      );
    }

    if (!step) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow step not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      automation,
      step,
    });
  } catch (error) {
    console.error(
      "Workflow step GET fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not load the workflow step.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
PATCH
Update workflow step
============================================================
*/

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
      stepId,
    } =
      await context.params;

    const {
      supabase,
      user,
      error:
        userError,
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
      automation,
      error:
        automationError,
    } =
      await verifyAutomation(
        supabase,
        id,
        user.id
      );

    if (automationError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not verify workflow.",
        },
        {
          status: 500,
        }
      );
    }

    if (!automation) {
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
      step:
        existingStep,

      error:
        stepError,
    } =
      await verifyStep(
        supabase,
        id,
        stepId,
        user.id
      );

    if (stepError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not verify workflow step.",
        },
        {
          status: 500,
        }
      );
    }

    if (!existingStep) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow step not found.",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      (await request.json()) as UpdateStepBody;

    const configValidation =
      body.config !==
      undefined
        ? validateAutomationStepConfig(
            body.config
          )
        : null;

    if (
      configValidation &&
      !configValidation.valid
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            configValidation.error,
        },
        {
          status: 400,
        }
      );
    }

    const nextStepType =
      body.stepType ??
      (existingStep.step_type as StepType);

    if (
      !allowedStepTypes.includes(
        nextStepType
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid workflow step type.",
        },
        {
          status: 400,
        }
      );
    }

    const nextStepOrder =
      body.stepOrder ??
      existingStep.step_order;

    if (
      !Number.isInteger(
        nextStepOrder
      ) ||
      nextStepOrder <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Step order must be a positive integer.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    ============================================================
    EXACT AI EMPLOYEE BINDING
    ============================================================
    */

    let nextEmployeeId:
      string | null =
        existingStep.employee_id;

    let nextEmployeeName:
      string | null =
        existingStep.employee_name;

    if (
      body.employeeId !==
      undefined
    ) {
      if (
        body.employeeId ===
        null
      ) {
        nextEmployeeId =
          null;

        nextEmployeeName =
          null;
      } else {
        const {
          data:
            employee,

          error:
            employeeError,
        } =
          await supabase
            .from(
              "employees"
            )
            .select(
              `
              id,
              name
              `
            )
            .eq(
              "id",
              body.employeeId
            )
            .eq(
              "user_id",
              user.id
            )
            .maybeSingle();

        if (employeeError) {
          console.error(
            "Workflow employee verification error:",
            employeeError
          );

          return NextResponse.json(
            {
              success: false,
              error:
                "Could not verify AI employee.",
            },
            {
              status: 500,
            }
          );
        }

        if (!employee) {
          return NextResponse.json(
            {
              success: false,
              error:
                "AI employee not found.",
            },
            {
              status: 404,
            }
          );
        }

        nextEmployeeId =
          employee.id;

        nextEmployeeName =
          employee.name;
      }
    }

    /*
    ============================================================
    APPROVAL SAFETY
    Approval steps ALWAYS require human approval.
    ============================================================
    */

    let nextRequiresApproval =
      body.requiresApproval ??
      existingStep.requires_approval;

    let nextApprovalType:
      "human" | null =
        nextRequiresApproval
          ? "human"
          : null;

    if (
      nextStepType ===
      "approval"
    ) {
      nextRequiresApproval =
        true;

      nextApprovalType =
        "human";
    }

    /*
    ============================================================
    UPDATE
    ============================================================
    */

    const {
      data:
        updatedStep,

      error:
        updateError,
    } =
      await supabase
        .from(
          "automation_steps"
        )
        .update({
          step_order:
            nextStepOrder,

          name:
            body.name !==
            undefined
              ? body.name?.trim() ||
                null
              : existingStep.name,

          step_type:
            nextStepType,

          action_type:
            body.actionType !==
            undefined
              ? body.actionType?.trim() ||
                null
              : existingStep.action_type,

          employee_id:
            nextEmployeeId,

          employee_name:
            nextEmployeeName,

          task_type:
            body.taskType !==
            undefined
              ? body.taskType?.trim() ||
                null
              : existingStep.task_type,

          instructions:
            body.instructions !==
            undefined
              ? body.instructions?.trim() ||
                null
              : existingStep.instructions,

          config:
            body.config !==
            undefined
              ? configValidation?.config ??
                {}
              : existingStep.config,

          condition_config:
            body.conditionConfig !==
            undefined
              ? body.conditionConfig
              : existingStep.condition_config,

          requires_approval:
            nextRequiresApproval,

          approval_type:
            nextApprovalType,

          is_enabled:
            body.isEnabled !==
            undefined
              ? body.isEnabled
              : existingStep.is_enabled,
        })
        .eq(
          "id",
          stepId
        )
        .eq(
          "automation_id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .select(
          stepSelect
        )
        .single();

    if (
      updateError ||
      !updatedStep
    ) {
      console.error(
        "Workflow step PATCH error:",
        updateError
      );

      const duplicateOrder =
        updateError?.code ===
        "23505";

      return NextResponse.json(
        {
          success: false,

          error:
            duplicateOrder
              ? "Another workflow step already uses this order."
              : "Could not update workflow step.",
        },
        {
          status:
            duplicateOrder
              ? 409
              : 500,
        }
      );
    }

    /*
    ============================================================
    ACTIVITY
    ============================================================
    */

    const {
      error:
        activityError,
    } =
      await supabase
        .from(
          "activity_logs"
        )
        .insert({
          user_id:
            user.id,

          action:
            "automation_step_updated",

          entity_type:
            "automation",

          entity_id:
            id,

          title:
            `${automation.name} step updated`,

          description:
            `Step ${updatedStep.step_order} was updated.`,

          metadata: {
            source:
              "workflow_builder",

            automation_id:
              id,

            automation_name:
              automation.name,

            automation_step_id:
              updatedStep.id,

            step_order:
              updatedStep.step_order,

            step_type:
              updatedStep.step_type,

            employee_id:
              updatedStep.employee_id,

            employee_name:
              updatedStep.employee_name,

            requires_approval:
              updatedStep.requires_approval,
          },
        });

    if (activityError) {
      console.error(
        "Workflow step update activity error:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Workflow step updated successfully.",

      step:
        updatedStep,
    });
  } catch (error) {
    console.error(
      "Workflow step PATCH fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not update the workflow step.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
DELETE
Delete workflow step
============================================================
*/

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
      stepId,
    } =
      await context.params;

    const {
      supabase,
      user,
      error:
        userError,
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
      automation,
      error:
        automationError,
    } =
      await verifyAutomation(
        supabase,
        id,
        user.id
      );

    if (automationError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not verify workflow.",
        },
        {
          status: 500,
        }
      );
    }

    if (!automation) {
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
      step,
      error:
        stepError,
    } =
      await verifyStep(
        supabase,
        id,
        stepId,
        user.id
      );

    if (stepError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Could not verify workflow step.",
        },
        {
          status: 500,
        }
      );
    }

    if (!step) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow step not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    ============================================================
    ACTIVITY BEFORE DELETE
    ============================================================
    */

    const {
      error:
        activityError,
    } =
      await supabase
        .from(
          "activity_logs"
        )
        .insert({
          user_id:
            user.id,

          action:
            "automation_step_deleted",

          entity_type:
            "automation",

          entity_id:
            id,

          title:
            `${automation.name} step deleted`,

          description:
            `Step ${step.step_order} (${step.step_type}) was removed.`,

          metadata: {
            source:
              "workflow_builder",

            automation_id:
              id,

            automation_name:
              automation.name,

            automation_step_id:
              step.id,

            step_order:
              step.step_order,

            step_type:
              step.step_type,

            employee_id:
              step.employee_id,

            employee_name:
              step.employee_name,
          },
        });

    if (activityError) {
      console.error(
        "Workflow step delete activity error:",
        activityError
      );
    }

    /*
    ============================================================
    DELETE
    ============================================================
    */

    const {
      error:
        deleteError,
    } =
      await supabase
        .from(
          "automation_steps"
        )
        .delete()
        .eq(
          "id",
          stepId
        )
        .eq(
          "automation_id",
          id
        )
        .eq(
          "user_id",
          user.id
        );

    if (deleteError) {
      console.error(
        "Workflow step DELETE error:",
        deleteError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not delete workflow step.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Workflow step deleted successfully.",

      deletedStep: {
        id:
          step.id,

        stepOrder:
          step.step_order,

        stepType:
          step.step_type,
      },
    });
  } catch (error) {
    console.error(
      "Workflow step DELETE fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not delete the workflow step.",
      },
      {
        status: 500,
      }
    );
  }
}