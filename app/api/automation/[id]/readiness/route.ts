import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type WorkflowAction = {
  order: number;
  type: string;
  label: string;
  config?: Record<string, unknown>;
};

type Requirement = {
  id: string;
  name: string;
  type: "integration" | "system";
  provider?: string;
  ready: boolean;
  reason: string;
};

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
            // Ignore cookie write errors
            // in read-only server contexts.
          }
        },
      },
    }
  );
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    const supabase =
      await getSupabase();

    /*
    ============================================================
    AUTH
    ============================================================
    */

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /*
    ============================================================
    LOAD WORKFLOW
    ============================================================
    */

    const {
      data: workflow,
      error: workflowError,
    } = await supabase
      .from("workflows")
      .select(
        `
        id,
        name,
        status,
        trigger_type,
        trigger_config,
        actions
        `
      )
      .eq("id", id)
      .eq(
        "user_id",
        user.id
      )
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

    /*
    ============================================================
    LOAD USER INTEGRATIONS
    ============================================================
    */

    const {
      data: integrationRows,
      error: integrationError,
    } = await supabase
      .from("integrations")
      .select(
        `
        id,
        provider,
        status,
        account_label,
        connected_at
        `
      )
      .eq(
        "user_id",
        user.id
      );

    if (integrationError) {
      console.error(
        "Integration readiness error:",
        integrationError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not check integrations.",
        },
        {
          status: 500,
        }
      );
    }

    const integrations =
      integrationRows ?? [];

    const actions =
      getWorkflowActions(
        workflow.actions
      );

    /*
    ============================================================
    DISCOVER REQUIREMENTS
    ============================================================
    */

    const requirements:
      Requirement[] = [];

    /*
    ------------------------------------------------------------
    TRIGGER REQUIREMENTS
    ------------------------------------------------------------
    */

    const triggerConfig =
      isRecord(
        workflow.trigger_config
      )
        ? workflow.trigger_config
        : {};

    const triggerEvent =
      typeof triggerConfig.event ===
      "string"
        ? triggerConfig.event.toLowerCase()
        : "";

    if (
      triggerEvent.includes(
        "whatsapp"
      )
    ) {
      addIntegrationRequirement({
        requirements,
        integrations,
        provider: "whatsapp",
        name:
          "WhatsApp Business",
        reason:
          "This workflow begins when a WhatsApp event occurs.",
      });
    }

    if (
      triggerEvent.includes(
        "email"
      )
    ) {
      addIntegrationRequirement({
        requirements,
        integrations,
        provider: "email",
        name:
          "Email",
        reason:
          "This workflow begins when an email event occurs.",
      });
    }

    if (
      workflow.trigger_type ===
      "Schedule"
    ) {
      addSystemRequirement(
        requirements,
        {
          id:
            "workflow_scheduler",
          name:
            "Workflow Scheduler",
          ready: false,
          reason:
            "Scheduled execution runtime has not been enabled yet.",
        }
      );
    }

    /*
    ------------------------------------------------------------
    ACTION REQUIREMENTS
    ------------------------------------------------------------
    */

    for (
      const action of actions
    ) {
      const type =
        action.type;

      const label =
        action.label.toLowerCase();

      const channel =
        typeof action.config
          ?.channel ===
        "string"
          ? action.config.channel.toLowerCase()
          : "";

      /*
      WHATSAPP
      */

      if (
        (
          type ===
            "receive_message" ||
          type ===
            "send_message"
        ) &&
        (
          channel ===
            "whatsapp" ||
          label.includes(
            "whatsapp"
          )
        )
      ) {
        addIntegrationRequirement({
          requirements,
          integrations,
          provider:
            "whatsapp",
          name:
            "WhatsApp Business",
          reason:
            `"${action.label}" requires a connected WhatsApp account.`,
        });

        continue;
      }

      /*
      EMAIL
      */

      if (
        type ===
          "send_email" ||
        type ===
          "analyze_email" ||
        channel === "email"
      ) {
        addIntegrationRequirement({
          requirements,
          integrations,
          provider: "email",
          name: "Email",
          reason:
            `"${action.label}" requires a connected email account.`,
        });

        continue;
      }

      /*
      CRM
      */

      if (
        type ===
          "check_response"
      ) {
        addIntegrationRequirement({
          requirements,
          integrations,
          provider: "crm",
          name: "CRM",
          reason:
            `"${action.label}" requires CRM data.`,
        });

        continue;
      }

      /*
      MARKETING
      */

      if (
        [
          "launch_campaign",
          "analyze_results",
        ].includes(type)
      ) {
        addIntegrationRequirement({
          requirements,
          integrations,
          provider:
            "marketing",
          name:
            "Marketing Platform",
          reason:
            `"${action.label}" requires a marketing integration.`,
        });

        continue;
      }

      /*
      NOTIFICATIONS
      */

      if (
        type === "notify"
      ) {
        addIntegrationRequirement({
          requirements,
          integrations,
          provider:
            "notifications",
          name:
            "Notification Service",
          reason:
            `"${action.label}" requires a notification provider.`,
        });

        continue;
      }

      /*
      AI RUNTIME
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
        ].includes(type)
      ) {
        addSystemRequirement(
          requirements,
          {
            id:
              "j10_ai_runtime",
            name:
              "J10 AI Execution Runtime",

            /*
             * We haven't connected
             * real AI execution to
             * workflows yet.
             */
            ready: false,

            reason:
              `"${action.label}" requires the J10 AI execution runtime.`,
          }
        );

        continue;
      }

      /*
      WAIT / ASYNC
      */

      if (
        type === "wait"
      ) {
        addSystemRequirement(
          requirements,
          {
            id:
              "async_scheduler",
            name:
              "Asynchronous Scheduler",
            ready: false,
            reason:
              `"${action.label}" requires delayed workflow execution.`,
          }
        );

        continue;
      }

      /*
      GENERIC BUSINESS EXECUTION
      */

      if (
        type ===
          "execute_task"
      ) {
        addSystemRequirement(
          requirements,
          {
            id:
              "business_executor",
            name:
              "Business Task Executor",
            ready: false,
            reason:
              `"${action.label}" requires a configured business executor.`,
          }
        );
      }
    }

    /*
    ============================================================
    READINESS
    ============================================================
    */

    const missingRequirements =
      requirements.filter(
        (requirement) =>
          !requirement.ready
      );

    const missingIntegrations =
      missingRequirements.filter(
        (requirement) =>
          requirement.type ===
          "integration"
      );

    const missingSystemCapabilities =
      missingRequirements.filter(
        (requirement) =>
          requirement.type ===
          "system"
      );

    const ready =
      missingRequirements.length ===
      0;

    let readinessStatus:
      | "Ready"
      | "Integration Required"
      | "System Capability Required";

    if (ready) {
      readinessStatus =
        "Ready";
    } else if (
      missingIntegrations.length >
      0
    ) {
      readinessStatus =
        "Integration Required";
    } else {
      readinessStatus =
        "System Capability Required";
    }

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    return NextResponse.json({
      success: true,

      workflow: {
        id:
          workflow.id,

        name:
          workflow.name,

        status:
          workflow.status,

        triggerType:
          workflow.trigger_type,

        actionCount:
          actions.length,
      },

      readiness: {
        ready,

        status:
          readinessStatus,

        requirementCount:
          requirements.length,

        missingCount:
          missingRequirements.length,

        requirements,

        missingIntegrations,

        missingSystemCapabilities,
      },
    });
  } catch (error) {
    console.error(
      "Workflow readiness API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not determine workflow readiness.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
INTEGRATION REQUIREMENT
============================================================
*/

function addIntegrationRequirement({
  requirements,
  integrations,
  provider,
  name,
  reason,
}: {
  requirements: Requirement[];

  integrations: {
    provider: string;
    status: string;
  }[];

  provider: string;

  name: string;

  reason: string;
}) {
  /*
   * Avoid duplicates.
   */

  const existing =
    requirements.find(
      (requirement) =>
        requirement.type ===
          "integration" &&
        requirement.provider ===
          provider
    );

  if (existing) {
    return;
  }

  const integration =
    integrations.find(
      (item) =>
        item.provider.toLowerCase() ===
        provider.toLowerCase()
    );

  const connected =
    integration?.status ===
    "Connected";

  requirements.push({
    id:
      `integration_${provider}`,

    name,

    type:
      "integration",

    provider,

    ready:
      connected,

    reason:
      connected
        ? `${name} is connected.`
        : reason,
  });
}

/*
============================================================
SYSTEM REQUIREMENT
============================================================
*/

function addSystemRequirement(
  requirements: Requirement[],
  requirement: {
    id: string;
    name: string;
    ready: boolean;
    reason: string;
  }
) {
  const exists =
    requirements.some(
      (item) =>
        item.id ===
        requirement.id
    );

  if (exists) {
    return;
  }

  requirements.push({
    ...requirement,
    type: "system",
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
          isRecord(
            configValue
          )
            ? configValue
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
OBJECT CHECK
============================================================
*/

function isRecord(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}