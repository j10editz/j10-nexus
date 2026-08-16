import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type WorkflowAction = {
  order: number;
  type: string;
  label: string;
  config?: Record<string, unknown>;
};

type WorkflowBlueprint = {
  name: string;
  description: string;
  triggerType: string;
  triggerLabel: string;
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    if (!prompt) {
      return NextResponse.json(
        {
          error: "Prompt is required.",
        },
        {
          status: 400,
        }
      );
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(
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
                ({ name, value, options }) => {
                  cookieStore.set(
                    name,
                    value,
                    options
                  );
                }
              );
            } catch {
              // Cookie writes may not be available
              // in every server context.
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const lowerPrompt =
      prompt.toLowerCase();

    /*
    ============================================================
    INTENT SIGNALS
    ============================================================
    */

    const explicitlyRequestsEmployee =
      lowerPrompt.includes("ai employee") ||
      lowerPrompt.includes("employee") ||
      lowerPrompt.includes("agent") ||
      lowerPrompt.includes("assistant");

    const explicitlyRequestsAutomation =
      lowerPrompt.includes("automate") ||
      lowerPrompt.includes("automation") ||
      lowerPrompt.includes("workflow") ||
      lowerPrompt.includes("automatically") ||
      lowerPrompt.includes("follow up") ||
      lowerPrompt.includes("follow-up") ||
      lowerPrompt.includes("schedule") ||
      lowerPrompt.includes("trigger");

    const isWhatsAppRequest =
      lowerPrompt.includes("whatsapp") ||
      lowerPrompt.includes("anti-link") ||
      lowerPrompt.includes("anti link") ||
      lowerPrompt.includes("whatsapp group");

    const isMarketingRequest =
      lowerPrompt.includes("marketing") ||
      lowerPrompt.includes("campaign") ||
      lowerPrompt.includes("ads");

    const isWebsiteRequest =
      lowerPrompt.includes("website") ||
      lowerPrompt.includes("landing page");

    const isSalesRequest =
      lowerPrompt.includes("sales") ||
      lowerPrompt.includes("lead") ||
      lowerPrompt.includes("prospect");

    const isSupportRequest =
      lowerPrompt.includes("support") ||
      lowerPrompt.includes("customer service") ||
      lowerPrompt.includes("customer support");

    const isEmailRequest =
      lowerPrompt.includes("email") ||
      lowerPrompt.includes("inbox");

    const isScheduledRequest =
      lowerPrompt.includes("daily") ||
      lowerPrompt.includes("every day") ||
      lowerPrompt.includes("weekly") ||
      lowerPrompt.includes("every week") ||
      lowerPrompt.includes("schedule");

    /*
    ============================================================
    INTENT
    ============================================================
    */

    let intent =
      "general_business_request";

    const recommendedTools: string[] =
      [];

    if (explicitlyRequestsEmployee) {
      intent = "ai_employee";

      if (isSalesRequest) {
        recommendedTools.push(
          "AI Sales Agent",
          "CRM",
          "Lead Follow-up Automation",
          "Knowledge Hub",
          "Automation Hub"
        );
      } else if (isSupportRequest) {
        recommendedTools.push(
          "AI Customer Support Agent",
          "Knowledge Hub",
          "CRM",
          "Automation Hub"
        );
      } else if (isMarketingRequest) {
        recommendedTools.push(
          "AI Marketing Agent",
          "Marketing AI",
          "Content Automation",
          "Analytics"
        );
      } else {
        recommendedTools.push(
          "AI Employee",
          "Knowledge Hub",
          "Automation Hub"
        );
      }
    } else if (
      explicitlyRequestsAutomation ||
      isWhatsAppRequest
    ) {
      intent = "workflow";

      if (isWhatsAppRequest) {
        recommendedTools.push(
          "WhatsApp Business AI",
          "WhatsApp Automation",
          "Automation Hub",
          "Workflow Builder"
        );
      } else if (isSalesRequest) {
        recommendedTools.push(
          "Lead Follow-up Automation",
          "CRM",
          "Automation Hub",
          "Workflow Builder"
        );
      } else if (isMarketingRequest) {
        recommendedTools.push(
          "Marketing Automation",
          "Content Automation",
          "Analytics",
          "Automation Hub"
        );
      } else if (isSupportRequest) {
        recommendedTools.push(
          "Customer Support Automation",
          "CRM",
          "Automation Hub",
          "Workflow Builder"
        );
      } else {
        recommendedTools.push(
          "Automation Hub",
          "Workflow Builder",
          "Business Integrations"
        );
      }
    } else if (isMarketingRequest) {
      intent = "workflow";

      recommendedTools.push(
        "Marketing Automation",
        "Content Automation",
        "Analytics",
        "Automation Hub"
      );
    } else if (isWebsiteRequest) {
      intent = "website";

      recommendedTools.push(
        "Website Builder",
        "AI Copywriting",
        "Lead Capture"
      );
    } else if (isSalesRequest) {
      intent = "ai_employee";

      recommendedTools.push(
        "AI Sales Agent",
        "CRM",
        "Knowledge Hub",
        "Automation Hub"
      );
    } else {
      recommendedTools.push(
        "J10 AI",
        "Automation Hub",
        "Business Intelligence"
      );
    }

    /*
    ============================================================
    WORKFLOW BLUEPRINT
    ============================================================
    */

    let workflowBlueprint:
      | WorkflowBlueprint
      | null = null;

    if (intent === "workflow") {
      workflowBlueprint =
        createWorkflowBlueprint({
          prompt,
          lowerPrompt,
          isSalesRequest,
          isWhatsAppRequest,
          isMarketingRequest,
          isSupportRequest,
          isEmailRequest,
          isScheduledRequest,
        });
    }

    /*
    ============================================================
    EXECUTION PLAN
    ============================================================
    */

    const isWorkflowIntent =
      intent === "workflow";

    const isEmployeeIntent =
      intent === "ai_employee";

    const plan = isWorkflowIntent
      ? [
          {
            step: 1,
            title:
              "Understand the automation",
            description:
              "Analyze the business process, trigger and desired outcome.",
          },
          {
            step: 2,
            title:
              "Configure the trigger",
            description:
              "Define exactly when this workflow should begin.",
          },
          {
            step: 3,
            title:
              "Configure workflow actions",
            description:
              "Prepare the actions J10 NEXUS will execute in sequence.",
          },
          {
            step: 4,
            title:
              "Review before execution",
            description:
              "Show the exact workflow blueprint before it is created.",
          },
        ]
      : isEmployeeIntent
        ? [
            {
              step: 1,
              title:
                "Understand the role",
              description:
                "Analyze the business goal and determine the AI employee responsibilities.",
            },
            {
              step: 2,
              title:
                "Configure the employee",
              description:
                "Prepare the employee role, department, model and required tools.",
            },
            {
              step: 3,
              title:
                "Connect business capabilities",
              description:
                "Prepare the knowledge and systems required by the AI employee.",
            },
            {
              step: 4,
              title:
                "Review before execution",
              description:
                "Show the proposed AI employee before creating it.",
            },
          ]
        : [
            {
              step: 1,
              title:
                "Understand the request",
              description:
                "Analyze the business goal and identify the required J10 NEXUS capabilities.",
            },
            {
              step: 2,
              title:
                "Configure the system",
              description:
                "Prepare the appropriate tools and business modules.",
            },
            {
              step: 3,
              title:
                "Build the solution",
              description:
                "Connect the required systems, data and capabilities.",
            },
            {
              step: 4,
              title:
                "Review before execution",
              description:
                "Show the proposed system before deployment.",
            },
          ];

    return NextResponse.json({
      success: true,

      request: prompt,

      intent,

      userId: user.id,

      response: isWorkflowIntent
        ? "J10 AI designed an automation blueprint for your request."
        : isEmployeeIntent
          ? "J10 AI identified the AI employee your business needs and can prepare it for deployment."
          : "J10 AI understands your request and can prepare a J10 NEXUS system for it.",

      recommendedTools: [
        ...new Set(
          recommendedTools
        ),
      ],

      workflowBlueprint,

      plan,

      executionReady: false,

      nextAction:
        "Review the proposed J10 NEXUS system before deployment.",
    });
  } catch (error) {
    console.error(
      "J10 AI API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "J10 AI could not process the request.",
      },
      {
        status: 500,
      }
    );
  }
}

function createWorkflowBlueprint({
  prompt,
  lowerPrompt,
  isSalesRequest,
  isWhatsAppRequest,
  isMarketingRequest,
  isSupportRequest,
  isEmailRequest,
  isScheduledRequest,
}: {
  prompt: string;
  lowerPrompt: string;
  isSalesRequest: boolean;
  isWhatsAppRequest: boolean;
  isMarketingRequest: boolean;
  isSupportRequest: boolean;
  isEmailRequest: boolean;
  isScheduledRequest: boolean;
}): WorkflowBlueprint {
  /*
  ============================================================
  LEAD FOLLOW-UP
  ============================================================
  */

  if (
    isSalesRequest &&
    (
      lowerPrompt.includes("follow") ||
      lowerPrompt.includes(
        "automatically"
      )
    )
  ) {
    return {
      name:
        "Lead Follow-Up Automation",

      description:
        "Automatically follow up with new sales leads and notify the sales team when human attention is needed.",

      triggerType:
        "Event",

      triggerLabel:
        "New Lead Created",

      triggerConfig: {
        event:
          "new_lead_created",
      },

      actions: [
        {
          order: 1,

          type:
            "send_message",

          label:
            "Send initial lead follow-up",

          config: {
            channel:
              "configured_channel",
          },
        },
        {
          order: 2,

          type: "wait",

          label:
            "Wait 24 hours",

          config: {
            duration:
              "24_hours",
          },
        },
        {
          order: 3,

          type:
            "check_response",

          label:
            "Check lead response",
        },
        {
          order: 4,

          type: "notify",

          label:
            "Notify sales team if needed",
        },
      ],
    };
  }

  /*
  ============================================================
  WHATSAPP
  ============================================================
  */

  if (isWhatsAppRequest) {
    return {
      name:
        "WhatsApp Customer Automation",

      description:
        "Automatically process incoming WhatsApp messages and prepare intelligent responses.",

      triggerType:
        "Event",

      triggerLabel:
        "WhatsApp Message Received",

      triggerConfig: {
        event:
          "whatsapp_message_received",
      },

      actions: [
        {
          order: 1,

          type:
            "receive_message",

          label:
            "Receive WhatsApp message",
        },
        {
          order: 2,

          type:
            "analyze_message",

          label:
            "Analyze customer request",
        },
        {
          order: 3,

          type:
            "generate_response",

          label:
            "Generate intelligent response",
        },
        {
          order: 4,

          type:
            "send_message",

          label:
            "Send WhatsApp response",

          config: {
            channel:
              "whatsapp",
          },
        },
      ],
    };
  }

  /*
  ============================================================
  MARKETING
  ============================================================
  */

  if (isMarketingRequest) {
    return {
      name:
        "Marketing Campaign Automation",

      description:
        "Prepare, launch and analyze an automated marketing campaign.",

      triggerType:
        "Manual",

      triggerLabel:
        "Manual Launch",

      triggerConfig: {},

      actions: [
        {
          order: 1,

          type:
            "analyze_audience",

          label:
            "Analyze target audience",
        },
        {
          order: 2,

          type:
            "generate_content",

          label:
            "Generate campaign content",
        },
        {
          order: 3,

          type:
            "launch_campaign",

          label:
            "Launch marketing campaign",
        },
        {
          order: 4,

          type:
            "analyze_results",

          label:
            "Analyze campaign performance",
        },
      ],
    };
  }

  /*
  ============================================================
  CUSTOMER SUPPORT
  ============================================================
  */

  if (isSupportRequest) {
    return {
      name:
        "Customer Support Automation",

      description:
        "Automatically process incoming customer support requests and escalate when necessary.",

      triggerType:
        "Event",

      triggerLabel:
        "Support Request Created",

      triggerConfig: {
        event:
          "support_request_created",
      },

      actions: [
        {
          order: 1,

          type:
            "classify_request",

          label:
            "Classify support request",
        },
        {
          order: 2,

          type:
            "generate_response",

          label:
            "Generate support response",
        },
        {
          order: 3,

          type:
            "respond_or_escalate",

          label:
            "Respond or escalate",
        },
      ],
    };
  }

  /*
  ============================================================
  EMAIL
  ============================================================
  */

  if (isEmailRequest) {
    return {
      name:
        "Email Automation",

      description:
        "Automatically analyze business emails and prepare appropriate responses.",

      triggerType:
        "Event",

      triggerLabel:
        "New Email Received",

      triggerConfig: {
        event:
          "email_received",
      },

      actions: [
        {
          order: 1,

          type:
            "analyze_email",

          label:
            "Analyze incoming email",
        },
        {
          order: 2,

          type:
            "generate_response",

          label:
            "Generate response",
        },
        {
          order: 3,

          type:
            "send_email",

          label:
            "Send email response",
        },
      ],
    };
  }

  /*
  ============================================================
  SCHEDULED
  ============================================================
  */

  if (isScheduledRequest) {
    const weekly =
      lowerPrompt.includes(
        "weekly"
      ) ||
      lowerPrompt.includes(
        "every week"
      );

    return {
      name:
        weekly
          ? "Weekly Business Automation"
          : "Daily Business Automation",

      description:
        prompt,

      triggerType:
        "Schedule",

      triggerLabel:
        weekly
          ? "Every Week"
          : "Every Day",

      triggerConfig: {
        schedule:
          weekly
            ? "weekly"
            : "daily",
      },

      actions: [
        {
          order: 1,

          type:
            "execute_task",

          label:
            "Execute scheduled business task",
        },
        {
          order: 2,

          type:
            "record_result",

          label:
            "Record execution result",
        },
      ],
    };
  }

  /*
  ============================================================
  GENERIC AUTOMATION
  ============================================================
  */

  return {
    name:
      createWorkflowName(
        prompt
      ),

    description:
      prompt,

    triggerType:
      "Manual",

    triggerLabel:
      "Manual Launch",

    triggerConfig: {},

    actions: [
      {
        order: 1,

        type:
          "analyze_request",

        label:
          "Analyze business task",
      },
      {
        order: 2,

        type:
          "execute_task",

        label:
          "Execute business task",
      },
      {
        order: 3,

        type:
          "record_result",

        label:
          "Record workflow result",
      },
    ],
  };
}

function createWorkflowName(
  request: string
) {
  const cleanRequest =
    request
      .replace(
        /\b(create|build|make|automate|automation|workflow|for me|please)\b/gi,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();

  if (!cleanRequest) {
    return "J10 AI Automation";
  }

  const words =
    cleanRequest
      .split(" ")
      .slice(0, 5)
      .map((word) => {
        return (
          word
            .charAt(0)
            .toUpperCase() +
          word.slice(1)
        );
      });

  return `${words.join(
    " "
  )} Workflow`;
}