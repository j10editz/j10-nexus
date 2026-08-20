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
  }>;
};

type StepType =
  | "ai_task"
  | "action"
  | "condition"
  | "approval"
  | "activity";

type CreateStepBody = {
  stepOrder?: number;

  name?: string;

  stepType?: StepType;

  actionType?: string | null;

  employeeId?: string | null;

  taskType?: string | null;

  instructions?: string | null;

  config?: Record<string, unknown>;

  conditionConfig?: Record<string, unknown>;

  requiresApproval?: boolean;

  approvalType?: "human" | null;

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

/*
============================================================
GET
Load workflow steps
============================================================
*/

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
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
      console.error(
        "Workflow verification error:",
        automationError
      );

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
      data:
        steps,

      error:
        stepsError,
    } =
      await supabase
        .from(
          "automation_steps"
        )
        .select(
          `
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
          `
        )
        .eq(
          "automation_id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .order(
          "step_order",
          {
            ascending:
              true,
          }
        );

    if (stepsError) {
      console.error(
        "Workflow steps GET error:",
        stepsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow steps.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,

      automation,

      steps:
        steps ?? [],
    });
  } catch (error) {
    console.error(
      "Workflow steps GET fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not load workflow steps.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
POST
Create workflow step
============================================================
*/

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
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
      console.error(
        "Workflow verification error:",
        automationError
      );

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

    const body =
      (await request.json()) as CreateStepBody;

    const configValidation =
      validateAutomationStepConfig(
        body.config
      );

    if (
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

    const stepType =
      body.stepType;

    if (
      !stepType ||
      !allowedStepTypes.includes(
        stepType
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Valid workflow step type is required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    ============================================================
    STEP ORDER
    If not supplied, append after the final current step.
    ============================================================
    */

    let stepOrder =
      body.stepOrder;

    if (
      stepOrder !== undefined &&
      (
        !Number.isInteger(
          stepOrder
        ) ||
        stepOrder <= 0
      )
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

    if (
      stepOrder === undefined
    ) {
      const {
        data:
          lastStep,

        error:
          lastStepError,
      } =
        await supabase
          .from(
            "automation_steps"
          )
          .select(
            "step_order"
          )
          .eq(
            "automation_id",
            id
          )
          .eq(
            "user_id",
            user.id
          )
          .order(
            "step_order",
            {
              ascending:
                false,
            }
          )
          .limit(1)
          .maybeSingle();

      if (lastStepError) {
        console.error(
          "Last workflow step lookup error:",
          lastStepError
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Could not determine workflow step order.",
          },
          {
            status: 500,
          }
        );
      }

      stepOrder =
        Number(
          lastStep?.step_order ??
            0
        ) + 1;
    }

    /*
    ============================================================
    EXACT AI EMPLOYEE BINDING
    ============================================================
    */

    let employeeId:
      string | null =
        body.employeeId ??
        null;

    let employeeName:
      string | null =
        null;

    if (employeeId) {
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
            employeeId
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

      employeeId =
        employee.id;

      employeeName =
        employee.name;
    }

    /*
    ============================================================
    APPROVAL SAFETY
    ============================================================
    */

    const requiresApproval =
      stepType ===
        "approval"
        ? true
        : body.requiresApproval ??
          false;

    const approvalType =
      requiresApproval
        ? "human"
        : null;

    /*
    ============================================================
    INSERT
    ============================================================
    */

    const {
      data:
        step,

      error:
        insertError,
    } =
      await supabase
        .from(
          "automation_steps"
        )
        .insert({
          automation_id:
            id,

          user_id:
            user.id,

          step_order:
            stepOrder,

          name:
            body.name?.trim() ||
            null,

          step_type:
            stepType,

          action_type:
            body.actionType?.trim() ||
            null,

          employee_id:
            employeeId,

          employee_name:
            employeeName,

          task_type:
            body.taskType?.trim() ||
            null,

          instructions:
            body.instructions?.trim() ||
            null,

          config:
            configValidation.config,

          condition_config:
            body.conditionConfig ??
            {},

          requires_approval:
            requiresApproval,

          approval_type:
            approvalType,

          is_enabled:
            body.isEnabled ??
            true,
        })
        .select(
          `
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
          `
        )
        .single();

    if (
      insertError ||
      !step
    ) {
      console.error(
        "Workflow step POST error:",
        insertError
      );

      const duplicateOrder =
        insertError?.code ===
        "23505";

      return NextResponse.json(
        {
          success: false,

          error:
            duplicateOrder
              ? "Another workflow step already uses this order."
              : "Could not create workflow step.",
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
            "automation_step_created",

          entity_type:
            "automation",

          entity_id:
            id,

          title:
            `${automation.name} step created`,

          description:
            `Step ${step.step_order} (${step.step_type}) was added to ${automation.name}.`,

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

            requires_approval:
              step.requires_approval,
          },
        });

    if (activityError) {
      console.error(
        "Workflow step activity log error:",
        activityError
      );
    }

    return NextResponse.json(
      {
        success: true,

        message:
          "Workflow step created successfully.",

        step,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Workflow step POST fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not create the workflow step.",
      },
      {
        status: 500,
      }
    );
  }
}
