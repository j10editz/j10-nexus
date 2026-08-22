import {
  NextResponse,
} from "next/server";

import {
  cookies,
} from "next/headers";

import {
  createServerClient,
} from "@supabase/ssr";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

type WorkflowAction = {
  order: number;
  type: string;
  label: string;
  config?:
    Record<string, unknown>;
};

type WorkflowBlueprint = {
  name: string;
  description: string;
  triggerType: string;
  triggerLabel: string;
  triggerConfig:
    Record<string, unknown>;
  actions:
    WorkflowAction[];
};

type BuildRequest = {
  intent?: string;
  request?: string;
  recommendedTools?: string[];
  workflowBlueprint?:
    WorkflowBlueprint | null;
};

const ALLOWED_WORKFLOW_ACTIONS =
  new Set([
    "send_message",
    "wait",
    "check_response",
    "notify",

    "receive_message",
    "analyze_message",
    "generate_response",

    "analyze_audience",
    "generate_content",
    "launch_campaign",
    "analyze_results",

    "classify_request",
    "respond_or_escalate",

    "analyze_email",
    "send_email",

    "execute_task",
    "record_result",

    "analyze_request",
  ]);

const ALLOWED_TRIGGER_TYPES =
  new Set([
    "Manual",
    "Event",
    "Schedule",
    "Webhook",
    "AI",
  ]);

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as
        BuildRequest;

    const intent =
      typeof body.intent ===
        "string"
        ? body.intent
            .trim()
            .toLowerCase()
        : "";

    const originalRequest =
      typeof body.request ===
        "string"
        ? body.request.trim()
        : "";

    const recommendedTools =
      Array.isArray(
        body.recommendedTools
      )
        ? body.recommendedTools
        : [];

    if (
      !intent ||
      !originalRequest
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Build request is incomplete.",
        },
        {
          status:
            400,
        }
      );
    }

    const cookieStore =
      await cookies();

    const supabase =
      createServerClient(
        process.env
          .NEXT_PUBLIC_SUPABASE_URL!,

        process.env
          .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,

        {
          cookies: {
            getAll() {
              return cookieStore
                .getAll();
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
                 * Cookie writes may not
                 * be available in every
                 * execution context.
                 */
              }
            },
          },
        }
      );

    const {
      data: {
        user,
      },

      error:
        userError,
    } =
      await supabase.auth
        .getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            "Unauthorized.",
        },
        {
          status:
            401,
        }
      );
    }

    const isEmployeeIntent =
      intent ===
        "ai_employee" ||
      intent ===
        "employee";

    const isWorkflowIntent =
      intent ===
        "workflow" ||
      intent ===
        "automation" ||
      intent ===
        "automation_workflow";

    /*
    ============================================================
    AI EMPLOYEE
    ============================================================
    */

    if (isEmployeeIntent) {
      return buildEmployee({
        supabase,

        userId:
          user.id,

        originalRequest,

        recommendedTools,
      });
    }

    /*
    ============================================================
    WORKFLOW
    ============================================================
    */

    if (isWorkflowIntent) {
      const blueprint =
        body.workflowBlueprint;

      if (
        !isValidWorkflowBlueprint(
          blueprint
        )
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error:
              "The approved workflow blueprint is missing or invalid.",
          },
          {
            status:
              400,
          }
        );
      }

      return buildWorkflow({
        supabase,

        userId:
          user.id,

        originalRequest,

        recommendedTools,

        blueprint,
      });
    }

    /*
    ============================================================
    UNSUPPORTED
    ============================================================
    */

    return NextResponse.json(
      {
        success:
          false,

        deployable:
          false,

        error:
          "This J10 NEXUS resource type is not deployable yet.",

        intent,
      },
      {
        status:
          400,
      }
    );
  } catch (error) {
    console.error(
      "J10 AI build API error:",
      error
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          "J10 AI could not execute the approved build.",
      },
      {
        status:
          500,
      }
    );
  }
}

/*
============================================================
BUILD AI EMPLOYEE
============================================================
*/

async function buildEmployee({
  supabase,
  userId,
  originalRequest,
  recommendedTools,
}: {
  supabase:
    SupabaseClient;

  userId:
    string;

  originalRequest:
    string;

  recommendedTools:
    string[];
}) {
  const lowerRequest =
    originalRequest
      .toLowerCase();

  let employeeName =
    "J10 AI Employee";

  let role =
    "AI Assistant";

  let department =
    "Operations";

  if (
    lowerRequest.includes(
      "sales"
    ) ||
    lowerRequest.includes(
      "lead"
    )
  ) {
    employeeName =
      "AI Sales Agent";

    role =
      "Sales Specialist";

    department =
      "Sales";
  } else if (
    lowerRequest.includes(
      "support"
    ) ||
    lowerRequest.includes(
      "customer"
    )
  ) {
    employeeName =
      "AI Customer Support Agent";

    role =
      "Customer Support Specialist";

    department =
      "Customer Support";
  } else if (
    lowerRequest.includes(
      "hr"
    ) ||
    lowerRequest.includes(
      "human resources"
    )
  ) {
    employeeName =
      "AI HR Assistant";

    role =
      "HR Assistant";

    department =
      "Human Resources";
  } else if (
    lowerRequest.includes(
      "finance"
    ) ||
    lowerRequest.includes(
      "account"
    )
  ) {
    employeeName =
      "AI Accounting Assistant";

    role =
      "Accounting Assistant";

    department =
      "Finance";
  } else if (
    lowerRequest.includes(
      "research"
    )
  ) {
    employeeName =
      "AI Research Assistant";

    role =
      "Research Assistant";

    department =
      "Research";
  } else if (
    lowerRequest.includes(
      "legal"
    )
  ) {
    employeeName =
      "AI Legal Assistant";

    role =
      "Legal Assistant";

    department =
      "Legal";
  } else if (
    lowerRequest.includes(
      "recruit"
    )
  ) {
    employeeName =
      "AI Recruiting Assistant";

    role =
      "Recruiting Assistant";

    department =
      "Human Resources";
  } else if (
    lowerRequest.includes(
      "project"
    )
  ) {
    employeeName =
      "AI Project Manager";

    role =
      "Project Manager";

    department =
      "Operations";
  } else if (
    lowerRequest.includes(
      "email"
    )
  ) {
    employeeName =
      "AI Email Assistant";

    role =
      "Email Assistant";

    department =
      "Operations";
  } else if (
    lowerRequest.includes(
      "executive"
    )
  ) {
    employeeName =
      "AI Executive Assistant";

    role =
      "Executive Assistant";

    department =
      "Operations";
  } else if (
    lowerRequest.includes(
      "marketing"
    )
  ) {
    employeeName =
      "AI Marketing Agent";

    role =
      "Marketing Specialist";

    department =
      "Marketing";
  }

  const avatar =
    employeeName
      .replace(
        "AI ",
        ""
      )
      .trim()
      .charAt(0)
      .toUpperCase() ||
    "J";

  const {
    data:
      createdEmployee,

    error:
      createError,
  } =
    await supabase
      .from(
        "employees"
      )
      .insert({
        user_id:
          userId,

        name:
          employeeName,

        role,

        department,

        status:
          "Running",

        tasks_completed:
          0,

        revenue_generated:
          0,

        last_active:
          "Just now",

        avatar,

        model:
          "GPT-5",
      })
      .select(
        `
        id,
        user_id,
        name,
        role,
        department,
        status,
        tasks_completed,
        revenue_generated,
        last_active,
        avatar,
        model,
        created_at
        `
      )
      .single();

  if (
    createError ||
    !createdEmployee
  ) {
    console.error(
      "J10 AI employee build error:",
      createError
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          "J10 AI could not create the employee.",
      },
      {
        status:
          500,
      }
    );
  }

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
          userId,

        action:
          "ai_employee_created",

        entity_type:
          "ai_employee",

        entity_id:
          createdEmployee.id,

        title:
          `${createdEmployee.name} created`,

        description:
          `${createdEmployee.name} was created by J10 AI and is now running.`,

        metadata: {
          source:
            "j10_ai",

          original_request:
            originalRequest,

          role:
            createdEmployee.role,

          department:
            createdEmployee.department,

          model:
            createdEmployee.model,

          recommended_tools:
            recommendedTools,
        },
      });

  if (activityError) {
    console.error(
      "Employee activity log error:",
      activityError
    );
  }

  return NextResponse.json({
    success:
      true,

    deployable:
      true,

    resourceType:
      "ai_employee",

    message:
      "J10 AI successfully created the approved AI employee.",

    ownerId:
      userId,

    employee:
      createdEmployee,
  });
}

/*
============================================================
BUILD EXACT APPROVED WORKFLOW
============================================================
*/

async function buildWorkflow({
  supabase,
  userId,
  originalRequest,
  recommendedTools,
  blueprint,
}: {
  supabase:
    SupabaseClient;

  userId:
    string;

  originalRequest:
    string;

  recommendedTools:
    string[];

  blueprint:
    WorkflowBlueprint;
}) {
  /*
   * The blueprint was already generated by J10 AI
   * and reviewed by the user. Execute that exact
   * approved blueprint without reinterpreting it.
   */

  const {
    data:
      createdWorkflow,

    error:
      workflowError,
  } =
    await supabase
      .from(
        "workflows"
      )
      .insert({
        user_id:
          userId,

        name:
          blueprint.name,

        description:
          blueprint.description,

        status:
          "Draft",

        trigger_type:
          blueprint.triggerType,

        trigger_config:
          blueprint.triggerConfig,

        actions:
          blueprint.actions,

        runs_count:
          0,

        last_run_at:
          null,
      })
      .select("*")
      .single();

  if (
    workflowError ||
    !createdWorkflow
  ) {
    console.error(
      "J10 AI workflow build error:",
      workflowError
    );

    return NextResponse.json(
      {
        success:
          false,

        error:
          "J10 AI could not create the automation.",
      },
      {
        status:
          500,
      }
    );
  }

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
          userId,

        action:
          "workflow_created",

        entity_type:
          "workflow",

        entity_id:
          createdWorkflow.id,

        title:
          `${createdWorkflow.name} created`,

        description:
          `${createdWorkflow.name} was created from an approved J10 AI workflow blueprint.`,

        metadata: {
          source:
            "j10_ai",

          approval_source:
            "user_review",

          original_request:
            originalRequest,

          trigger_type:
            blueprint.triggerType,

          trigger_label:
            blueprint.triggerLabel,

          action_count:
            blueprint.actions.length,

          recommended_tools:
            recommendedTools,
        },
      });

  if (activityError) {
    console.error(
      "Workflow activity log error:",
      activityError
    );
  }

  return NextResponse.json({
    success:
      true,

    deployable:
      true,

    resourceType:
      "workflow",

    message:
      "J10 AI successfully created the approved automation.",

    ownerId:
      userId,

    workflow:
      createdWorkflow,
  });
}

/*
============================================================
BLUEPRINT VALIDATION
============================================================
*/

function isValidWorkflowBlueprint(
  blueprint:
    | WorkflowBlueprint
    | null
    | undefined
): blueprint is WorkflowBlueprint {
  if (!blueprint) {
    return false;
  }

  if (
    typeof blueprint.name !==
      "string" ||
    !blueprint.name.trim() ||
    blueprint.name.length >
      120
  ) {
    return false;
  }

  if (
    typeof blueprint.description !==
    "string"
  ) {
    return false;
  }

  if (
    typeof blueprint.triggerType !==
      "string" ||
    !ALLOWED_TRIGGER_TYPES.has(
      blueprint.triggerType
    )
  ) {
    return false;
  }

  if (
    typeof blueprint.triggerLabel !==
    "string"
  ) {
    return false;
  }

  if (
    !blueprint.triggerConfig ||
    typeof blueprint.triggerConfig !==
      "object" ||
    Array.isArray(
      blueprint.triggerConfig
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(
      blueprint.actions
    ) ||
    blueprint.actions.length ===
      0 ||
    blueprint.actions.length >
      20
  ) {
    return false;
  }

  for (
    const action of
    blueprint.actions
  ) {
    if (
      typeof action.order !==
        "number" ||
      typeof action.type !==
        "string" ||
      typeof action.label !==
        "string"
    ) {
      return false;
    }

    if (
      !ALLOWED_WORKFLOW_ACTIONS.has(
        action.type
      )
    ) {
      return false;
    }

    if (
      action.config !==
        undefined &&
      (
        typeof action.config !==
          "object" ||
        action.config ===
          null ||
        Array.isArray(
          action.config
        )
      )
    ) {
      return false;
    }
  }

  return true;
}