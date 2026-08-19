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
    id: string;
  }>;
};

type AutomationStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived";

type AutomationTriggerType =
  | "manual"
  | "new_crm_contact"
  | "crm_status_changed"
  | "new_ai_task"
  | "ai_task_completed"
  | "schedule";

type AutomationAction =
  | "pause"
  | "resume"
  | "archive";

type UpdateAutomationBody = {
  action?: AutomationAction;

  name?: string;

  description?:
    | string
    | null;

  status?: AutomationStatus;

  triggerType?: AutomationTriggerType;

  triggerConfig?: Record<
    string,
    unknown
  >;

  scheduleExpression?:
    | string
    | null;

  timezone?: string;
};

const allowedStatuses: AutomationStatus[] = [
  "draft",
  "active",
  "paused",
  "archived",
];

const allowedTriggerTypes: AutomationTriggerType[] = [
  "manual",
  "new_crm_contact",
  "crm_status_changed",
  "new_ai_task",
  "ai_task_completed",
  "schedule",
];

const allowedActions: AutomationAction[] = [
  "pause",
  "resume",
  "archive",
];

/*
============================================================
SUPABASE
============================================================
*/

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
            Cookie mutation may be unavailable
            in some route-handler contexts.
            */
          }
        },
      },
    }
  );
}

/*
============================================================
AUTOMATION SELECT
============================================================
*/

const automationSelect = `
  id,
  user_id,
  name,
  description,
  status,
  trigger_type,
  trigger_config,
  schedule_expression,
  timezone,
  last_run_at,
  next_run_at,
  total_executions,
  successful_executions,
  failed_executions,
  awaiting_approval_executions,
  created_at,
  updated_at
`;

/*
============================================================
AUTH
============================================================
*/

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

/*
============================================================
ACTIVITY LOGGER
============================================================
*/

async function recordAutomationActivity({
  supabase,
  userId,
  automationId,
  automationName,
  action,
  title,
  description,
  metadata = {},
}: {
  supabase:
    Awaited<
      ReturnType<
        typeof getSupabase
      >
    >;

  userId:
    string;

  automationId:
    string;

  automationName:
    string;

  action:
    string;

  title:
    string;

  description:
    string;

  metadata?:
    Record<
      string,
      unknown
    >;
}) {
  const {
    error,
  } =
    await supabase
      .from(
        "activity_logs"
      )
      .insert({
        user_id:
          userId,

        action,

        entity_type:
          "automation",

        entity_id:
          automationId,

        title,

        description,

        metadata: {
          source:
            "automation_api",

          automation_id:
            automationId,

          automation_name:
            automationName,

          ...metadata,
        },
      });

  if (error) {
    console.error(
      "Automation activity log error:",
      error
    );
  }
}

/*
============================================================
GET
Single automation
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

    if (!id) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Automation ID is required.",
        },
        {
          status: 400,
        }
      );
    }

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
      data:
        automation,

      error,
    } =
      await supabase
        .from(
          "automations"
        )
        .select(
          automationSelect
        )
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (error) {
      console.error(
        "Automation GET by ID error:",
        error
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "Could not load automation.",
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
            "Automation not found.",
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
            ascending: true,
          }
        );

    if (stepsError) {
      console.error(
        "Automation steps GET error:",
        stepsError
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
      "Automation GET by ID fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "J10 could not load the automation.",
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
Update / Pause / Resume / Archive
============================================================
*/

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
    } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Automation ID is required.",
        },
        {
          status: 400,
        }
      );
    }

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
      data:
        existingAutomation,

      error:
        existingError,
    } =
      await supabase
        .from(
          "automations"
        )
        .select(
          automationSelect
        )
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (existingError) {
      console.error(
        "Automation lookup error:",
        existingError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "Could not verify automation.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !existingAutomation
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Automation not found.",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      (await request.json()) as UpdateAutomationBody;

    /*
    ============================================================
    ACTION VALIDATION
    ============================================================
    */

    if (
      body.action &&
      !allowedActions.includes(
        body.action
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Invalid automation action.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    ============================================================
    DETERMINE STATUS
    ============================================================
    */

    let nextStatus:
      AutomationStatus =
        existingAutomation.status as AutomationStatus;

    if (
      body.action ===
      "pause"
    ) {
      if (
        existingAutomation.status !==
        "active"
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Only active automations can be paused.",
          },
          {
            status: 409,
          }
        );
      }

      nextStatus =
        "paused";
    }

    if (
      body.action ===
      "resume"
    ) {
      if (
        existingAutomation.status !==
          "paused" &&
        existingAutomation.status !==
          "draft"
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Only paused or draft automations can be activated.",
          },
          {
            status: 409,
          }
        );
      }

      nextStatus =
        "active";
    }

    if (
      body.action ===
      "archive"
    ) {
      if (
        existingAutomation.status ===
        "archived"
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Automation is already archived.",
          },
          {
            status: 409,
          }
        );
      }

      nextStatus =
        "archived";
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        !allowedStatuses.includes(
          body.status
        )
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "Invalid automation status.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        !body.action
      ) {
        nextStatus =
          body.status;
      }
    }

    /*
    ============================================================
    FIELD VALUES
    ============================================================
    */

    const nextName =
      body.name !==
      undefined
        ? body.name.trim()
        : existingAutomation.name;

    if (!nextName) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Automation name is required.",
        },
        {
          status: 400,
        }
      );
    }

    const nextDescription =
      body.description !==
      undefined
        ? body.description?.trim() ||
          null
        : existingAutomation.description;

    const nextTriggerType =
      body.triggerType !==
      undefined
        ? body.triggerType
        : existingAutomation.trigger_type;

    if (
      !allowedTriggerTypes.includes(
        nextTriggerType as AutomationTriggerType
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Invalid automation trigger.",
        },
        {
          status: 400,
        }
      );
    }

    const nextTriggerConfig =
      body.triggerConfig !==
      undefined
        ? body.triggerConfig
        : existingAutomation.trigger_config;

    const nextScheduleExpression =
      body.scheduleExpression !==
      undefined
        ? body.scheduleExpression?.trim() ||
          null
        : existingAutomation.schedule_expression;

    const nextTimezone =
      body.timezone !==
      undefined
        ? body.timezone.trim()
        : existingAutomation.timezone;

    if (
      !nextTimezone
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Timezone is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      nextTriggerType ===
        "schedule" &&
      !nextScheduleExpression
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Scheduled automations require a schedule expression.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    ============================================================
    UPDATE
    ============================================================
    */

    const {
      data:
        automation,

      error:
        updateError,
    } =
      await supabase
        .from(
          "automations"
        )
        .update({
          name:
            nextName,

          description:
            nextDescription,

          status:
            nextStatus,

          trigger_type:
            nextTriggerType,

          trigger_config:
            nextTriggerConfig,

          schedule_expression:
            nextScheduleExpression,

          timezone:
            nextTimezone,
        })
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .select(
          automationSelect
        )
        .single();

    if (
      updateError ||
      !automation
    ) {
      console.error(
        "Automation PATCH error:",
        updateError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "Could not update automation.",
        },
        {
          status: 500,
        }
      );
    }

    /*
    ============================================================
    ACTIVITY
    ============================================================
    */

    let activityAction =
      "automation_updated";

    let activityTitle =
      `${automation.name} updated`;

    let activityDescription =
      `${automation.name} configuration was updated.`;

    if (
      body.action ===
      "pause"
    ) {
      activityAction =
        "automation_paused";

      activityTitle =
        `${automation.name} paused`;

      activityDescription =
        `${automation.name} was paused.`;
    }

    if (
      body.action ===
      "resume"
    ) {
      activityAction =
        "automation_resumed";

      activityTitle =
        `${automation.name} activated`;

      activityDescription =
        `${automation.name} is now active.`;
    }

    if (
      body.action ===
      "archive"
    ) {
      activityAction =
        "automation_archived";

      activityTitle =
        `${automation.name} archived`;

      activityDescription =
        `${automation.name} was archived.`;
    }

    await recordAutomationActivity({
      supabase,

      userId:
        user.id,

      automationId:
        automation.id,

      automationName:
        automation.name,

      action:
        activityAction,

      title:
        activityTitle,

      description:
        activityDescription,

      metadata: {
        previous_status:
          existingAutomation.status,

        status:
          automation.status,

        trigger_type:
          automation.trigger_type,

        action:
          body.action ??
          "update",
      },
    });

    return NextResponse.json({
      success: true,

      action:
        body.action ??
        "update",

      message:
        body.action ===
        "pause"
          ? "Automation paused successfully."
          : body.action ===
              "resume"
            ? "Automation activated successfully."
            : body.action ===
                "archive"
              ? "Automation archived successfully."
              : "Automation updated successfully.",

      automation,
    });
  } catch (error) {
    console.error(
      "Automation PATCH fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "J10 could not update the automation.",
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
Permanent delete
============================================================
*/

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      id,
    } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Automation ID is required.",
        },
        {
          status: 400,
        }
      );
    }

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
      data:
        automation,

      error:
        lookupError,
    } =
      await supabase
        .from(
          "automations"
        )
        .select(
          `
          id,
          user_id,
          name,
          status,
          trigger_type
          `
        )
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (lookupError) {
      console.error(
        "Automation delete lookup error:",
        lookupError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "Could not verify automation.",
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
            "Automation not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
    ============================================================
    SAFETY
    Active automations must be paused or archived first.
    ============================================================
    */

    if (
      automation.status ===
      "active"
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "Pause or archive this automation before deleting it.",
        },
        {
          status: 409,
        }
      );
    }

    /*
    Log BEFORE deletion because entity IDs may disappear
    after cascade cleanup.
    */

    await recordAutomationActivity({
      supabase,

      userId:
        user.id,

      automationId:
        automation.id,

      automationName:
        automation.name,

      action:
        "automation_deleted",

      title:
        `${automation.name} deleted`,

      description:
        `${automation.name} was permanently deleted.`,

      metadata: {
        previous_status:
          automation.status,

        trigger_type:
          automation.trigger_type,
      },
    });

    const {
      error:
        deleteError,
    } =
      await supabase
        .from(
          "automations"
        )
        .delete()
        .eq(
          "id",
          id
        )
        .eq(
          "user_id",
          user.id
        );

    if (deleteError) {
      console.error(
        "Automation DELETE error:",
        deleteError
      );

      return NextResponse.json(
        {
          success: false,

          error:
            "Could not delete automation.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,

      message:
        "Automation permanently deleted.",

      deletedAutomation: {
        id:
          automation.id,

        name:
          automation.name,
      },
    });
  } catch (error) {
    console.error(
      "Automation DELETE fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "J10 could not delete the automation.",
      },
      {
        status: 500,
      }
    );
  }
}