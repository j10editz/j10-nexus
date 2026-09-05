import {
  NextRequest,
  NextResponse,
} from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

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
  | "schedule"
  | "integration_event";

type CreateAutomationBody = {
  name?: string;
  description?: string;
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
  "integration_event",
];

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const {
      data,
      error,
    } =
      await supabase
        .from(
          "automations"
        )
        .select(
          `
          id,
          workspace_id,
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
          `
        )
        .eq(
          "workspace_id",
          context.workspace.id
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        );

    if (error) {
      console.error(
        "Automation GET error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load automations.",
        },
        {
          status: 500,
        }
      );
    }

    const automations =
      data ?? [];

    const summary = {
      total:
        automations.length,

      active:
        automations.filter(
          (
            automation
          ) =>
            automation.status ===
            "active"
        ).length,

      paused:
        automations.filter(
          (
            automation
          ) =>
            automation.status ===
            "paused"
        ).length,

      draft:
        automations.filter(
          (
            automation
          ) =>
            automation.status ===
            "draft"
        ).length,

      totalExecutions:
        automations.reduce(
          (
            total,
            automation
          ) =>
            total +
            Number(
              automation.total_executions ??
                0
            ),
          0
        ),

      awaitingApproval:
        automations.reduce(
          (
            total,
            automation
          ) =>
            total +
            Number(
              automation.awaiting_approval_executions ??
                0
            ),
          0
        ),
    };

    return NextResponse.json({
      success: true,
      summary,
      automations,
    });
  } catch (error) {
    console.error(
      "Automation GET fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not load automations.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const auth = await requireApiWorkspaceContext("manager");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const body =
      (await request.json()) as CreateAutomationBody;

    const name =
      body.name?.trim();

    const description =
      body.description?.trim() ||
      null;

    const status =
      body.status ??
      "draft";

    const triggerType =
      body.triggerType ??
      "manual";

    const triggerConfig =
      body.triggerConfig ??
      {};

    const scheduleExpression =
      body.scheduleExpression?.trim() ||
      null;

    const timezone =
      body.timezone?.trim() ||
      "UTC";

    if (!name) {
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

    if (
      !allowedStatuses.includes(
        status
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
      !allowedTriggerTypes.includes(
        triggerType
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

    if (
      triggerType ===
        "schedule" &&
      !scheduleExpression
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
        .insert({
          workspace_id:
            context.workspace.id,
          user_id:
            context.user.id,
          name,
          description,
          status,
          trigger_type:
            triggerType,
          trigger_config:
            triggerConfig,
          schedule_expression:
            scheduleExpression,
          timezone,
        })
        .select(
          `
          id,
          workspace_id,
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
          `
        )
        .single();

    if (
      automationError ||
      !automation
    ) {
      console.error(
        "Automation POST error:",
        automationError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not create automation.",
        },
        {
          status: 500,
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
          workspace_id:
            context.workspace.id,
          user_id:
            context.user.id,
          action:
            "automation_created",
          entity_type:
            "automation",
          entity_id:
            automation.id,
          title:
            `${automation.name} created`,
          description:
            `Automation created with ${automation.trigger_type} trigger.`,
          metadata: {
            source:
              "automation_api",
            automation_id:
              automation.id,
            automation_name:
              automation.name,
            trigger_type:
              automation.trigger_type,
            status:
              automation.status,
          },
        });

    if (activityError) {
      console.error(
        "Automation activity log error:",
        activityError
      );
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "Automation created successfully.",
        automation,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Automation POST fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 could not create the automation.",
      },
      {
        status: 500,
      }
    );
  }
}