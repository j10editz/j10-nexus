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

import type {
  J10FlowGraph,
} from "@/types/automation-graph";

import {
  compileJ10FlowGraph,
  type CompiledAutomationStepInput,
} from "@/lib/automation/graph-compiler";

import {
  isJ10FlowGraph,
  validateJ10FlowGraph,
} from "@/lib/automation/graph-contract";

import {
  validateJ10FlowIntegrationReadiness,
} from "@/lib/automation/graph-readiness";

import {
  validateAutomationStepConfig,
} from "@/lib/automation/failure-policy";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PublishWorkflowBody = {
  graph?: unknown;
  activate?: boolean;
};

type RuntimeSwitchResult = {
  success?: boolean;
  automationId?: string;
  automationVersionId?: string;
  versionNumber?: number;
  stepCount?: number;
  activated?: boolean;
};

type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  draft_graph?: unknown;
  published_version_id?: string | null;
};

type EmployeeRow = {
  id: string;
  name: string;
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

async function getAuthenticatedUser() {
  const supabase = await getSupabase();

  const {
    data: {
      user,
    },
    error,
  } = await supabase.auth.getUser();

  return {
    supabase,
    user,
    error,
  };
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  let createdVersionId: string | null = null;

  try {
    const {
      id,
    } = await context.params;

    const {
      supabase,
      user,
      error: userError,
    } = await getAuthenticatedUser();

    if (userError || !user) {
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

    const {
      data: automation,
      error: automationError,
    } = await supabase
      .from("automations")
      .select(
        `
        id,
        user_id,
        name,
        description,
        status,
        draft_graph,
        published_version_id
        `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (automationError) {
      console.error(
        "Publish automation lookup error:",
        automationError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Could not verify workflow.",
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
          error: "Workflow not found.",
        },
        {
          status: 404,
        }
      );
    }

    const automationRow =
      automation as AutomationRow;

    if (automationRow.status === "archived") {
      return NextResponse.json(
        {
          success: false,
          error: "Archived workflows cannot be published.",
        },
        {
          status: 409,
        }
      );
    }

    const body = await parsePublishBody(request);

    const graph = resolveGraphForPublish(
      body.graph,
      automationRow.draft_graph
    );

    if (!graph) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A valid J10 Flow graph is required before publishing.",
        },
        {
          status: 400,
        }
      );
    }

    const graphValidation =
      validateJ10FlowGraph(graph);

    if (!graphValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error:
            graphValidation.errors[0]?.message ??
            "Workflow graph validation failed.",
          code: "J10_FLOW_GRAPH_INVALID",
          errors: graphValidation.errors,
          warnings: graphValidation.warnings,
        },
        {
          status: 400,
        }
      );
    }

    const compiled = compileJ10FlowGraph(graph);

    if (compiled.steps.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A published workflow must contain at least one executable node.",
        },
        {
          status: 400,
        }
      );
    }

    for (const step of compiled.steps) {
      const validation =
        validateAutomationStepConfig(step.config);

      if (!validation.valid) {
        return NextResponse.json(
          {
            success: false,
            error:
              validation.error ??
              `Invalid step config for node ${step.sourceNodeId}.`,
          },
          {
            status: 400,
          }
        );
      }
    }

    const readiness =
      await validateJ10FlowIntegrationReadiness({
        supabase,
        userId: user.id,
        graph,
      });

    if (!readiness.ready) {
      return NextResponse.json(
        {
          success: false,
          error:
            readiness.errors[0]?.message ??
            "Workflow integrations are not ready for publication.",
          code: "J10_FLOW_READINESS_BLOCKED",
          errors: readiness.errors,
          warnings: readiness.warnings,
        },
        {
          status: 409,
        }
      );
    }

    const publicationWarnings = [
      ...compiled.warnings,
      ...readiness.warnings,
    ];

    const employeeNames =
      await loadEmployeeNames(
        supabase,
        user.id,
        compiled.steps
      );

    const versionNumber =
      await getNextVersionNumber(
        supabase,
        automationRow.id,
        user.id
      );

    const now = new Date().toISOString();

    const {
      data: version,
      error: versionError,
    } = await supabase
      .from("automation_versions")
      .insert({
        automation_id: automationRow.id,
        user_id: user.id,
        version_number: versionNumber,
        status: "draft",
        graph_version: graph.version,
        graph_snapshot: graph,
        compiled_trigger_type:
          compiled.automation.triggerType,
        compiled_trigger_config:
          compiled.automation.triggerConfig,
        compiled_schedule_expression:
          compiled.automation.scheduleExpression,
        compiled_timezone:
          compiled.automation.timezone,
        validation_errors: [],
        validation_warnings: publicationWarnings,
      })
      .select(
        `
        id,
        version_number,
        status,
        published_at
        `
      )
      .single();

    if (versionError || !version) {
      console.error(
        "Publish version create error:",
        versionError
      );

      return NextResponse.json(
        {
          success: false,
          error: "Could not create workflow version.",
        },
        {
          status: 500,
        }
      );
    }

    createdVersionId = version.id;

    const versionStepRows =
      compiled.steps.map((step) =>
        toVersionStepRow({
          automationId: automationRow.id,
          userId: user.id,
          versionId: version.id,
          step,
          employeeNames,
        })
      );

    const {
      error: versionStepsError,
    } = await supabase
      .from("automation_version_steps")
      .insert(versionStepRows);

    if (versionStepsError) {
      console.error(
        "Publish version steps create error:",
        versionStepsError
      );

      await archiveVersion(
        supabase,
        createdVersionId,
        user.id
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not snapshot workflow version steps.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      data: publishedVersion,
      error: publishVersionError,
    } = await supabase
      .from("automation_versions")
      .update({
        status: "published",
        published_at: now,
      })
      .eq("id", version.id)
      .eq("user_id", user.id)
      .select(
        `
        id,
        version_number,
        status,
        published_at
        `
      )
      .single();

    if (
      publishVersionError ||
      !publishedVersion
    ) {
      console.error(
        "Publish version status error:",
        publishVersionError
      );

      await archiveVersion(
        supabase,
        createdVersionId,
        user.id
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not mark workflow version as published.",
        },
        {
          status: 500,
        }
      );
    }

    const activateRuntime =
      body.activate !== false;

    const {
      data: runtimeSwitch,
      error: runtimeSwitchError,
    } = await supabase.rpc(
      "publish_automation_version_runtime",
      {
        p_automation_id: automationRow.id,
        p_automation_version_id: publishedVersion.id,
        p_activate: activateRuntime,
      }
    );

    if (runtimeSwitchError) {
      console.error(
        "Publish runtime switch error:",
        {
          code: runtimeSwitchError.code,
          message: runtimeSwitchError.message,
          details: runtimeSwitchError.details,
          hint: runtimeSwitchError.hint,
        }
      );

      await archiveVersion(
        supabase,
        createdVersionId,
        user.id
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow version was created, but J10 could not switch runtime steps atomically.",
        },
        {
          status: 500,
        }
      );
    }

    const runtimeSwitchResult =
      runtimeSwitch as RuntimeSwitchResult | null;

    const {
      data: updatedAutomation,
      error: updatedAutomationError,
    } = await supabase
      .from("automations")
      .select(
        `
        id,
        name,
        description,
        status,
        trigger_type,
        trigger_config,
        schedule_expression,
        timezone,
        published_version_id,
        draft_graph_version,
        last_published_at
        `
      )
      .eq("id", automationRow.id)
      .eq("user_id", user.id)
      .single();

    if (
      updatedAutomationError ||
      !updatedAutomation
    ) {
      console.error(
        "Publish automation reload error:",
        updatedAutomationError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Workflow runtime switched, but J10 could not reload publish metadata.",
        },
        {
          status: 500,
        }
      );
    }

    await recordPublishActivity({
      supabase,
      userId: user.id,
      automationId: automationRow.id,
      automationName: automationRow.name,
      versionId: publishedVersion.id,
      versionNumber: publishedVersion.version_number,
      graph,
      stepCount: compiled.steps.length,
      activated: body.activate !== false,
    });

    return NextResponse.json({
      success: true,
      message:
        "Workflow version published and runtime steps switched atomically.",
      automation: updatedAutomation,
      version: publishedVersion,
      stepCount: compiled.steps.length,
      runtimeSwitch: runtimeSwitchResult,
      runtimeSwitchRequired: false,
      warnings: publicationWarnings,
    });
  } catch (error) {
    console.error(
      "Publish workflow fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "J10 could not publish this workflow.",
      },
      {
        status: 500,
      }
    );
  }
}

async function parsePublishBody(
  request: NextRequest
): Promise<PublishWorkflowBody> {
  try {
    const body = await request.json();

    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body)
    ) {
      return body as PublishWorkflowBody;
    }
  } catch {
    return {};
  }

  return {};
}

function resolveGraphForPublish(
  bodyGraph: unknown,
  draftGraph: unknown
): J10FlowGraph | null {
  if (isJ10FlowGraph(bodyGraph)) {
    return bodyGraph;
  }

  if (isJ10FlowGraph(draftGraph)) {
    return draftGraph;
  }

  return null;
}

async function getNextVersionNumber(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  automationId: string,
  userId: string
): Promise<number> {
  const {
    data,
    error,
  } = await supabase
    .from("automation_versions")
    .select("version_number")
    .eq("automation_id", automationId)
    .eq("user_id", userId)
    .order("version_number", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "Publish version number lookup error:",
      error
    );

    throw new Error(
      "Could not determine next workflow version number."
    );
  }

  return Number(data?.version_number ?? 0) + 1;
}

async function loadEmployeeNames(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  userId: string,
  steps: CompiledAutomationStepInput[]
): Promise<Map<string, string>> {
  const employeeIds = Array.from(
    new Set(
      steps
        .map((step) => step.employeeId)
        .filter(
          (employeeId): employeeId is string =>
            Boolean(employeeId)
        )
    )
  );

  if (employeeIds.length === 0) {
    return new Map();
  }

  const {
    data,
    error,
  } = await supabase
    .from("employees")
    .select("id, name")
    .eq("user_id", userId)
    .in("id", employeeIds);

  if (error) {
    console.error(
      "Publish employee lookup error:",
      error
    );

    throw new Error(
      "Could not verify workflow AI employees."
    );
  }

  const employees =
    (data ?? []) as EmployeeRow[];

  if (employees.length !== employeeIds.length) {
    throw new Error(
      "One or more workflow AI employees could not be verified."
    );
  }

  return new Map(
    employees.map((employee) => [
      employee.id,
      employee.name,
    ])
  );
}

function toVersionStepRow({
  automationId,
  userId,
  versionId,
  step,
  employeeNames,
}: {
  automationId: string;
  userId: string;
  versionId: string;
  step: CompiledAutomationStepInput;
  employeeNames: Map<string, string>;
}) {
  const routing = getGraphRouting(step);

  return {
    automation_version_id: versionId,
    automation_id: automationId,
    source_step_id: null,
    user_id: userId,
    graph_node_id: step.sourceNodeId,
    step_order: step.stepOrder,
    name: step.name,
    step_type: step.stepType,
    action_type: step.actionType,
    employee_id: step.employeeId,
    employee_name: step.employeeId
      ? employeeNames.get(step.employeeId) ?? null
      : null,
    task_type: step.taskType,
    instructions: step.instructions,
    config: step.config,
    condition_config: step.conditionConfig,
    requires_approval: step.requiresApproval,
    approval_type: step.approvalType,
    on_success_node_id:
      routing.successNodeId,
    on_failure_node_id:
      routing.failureNodeId,
    on_success_step_order:
      routing.successStepOrder,
    on_failure_step_order:
      routing.failureStepOrder,
    is_enabled: step.isEnabled,
  };
}

function getGraphRouting(
  step: CompiledAutomationStepInput
) {
  const config = step.config;

  if (!isRecord(config)) {
    return emptyRouting();
  }

  const j10Flow = config.j10Flow;

  if (!isRecord(j10Flow)) {
    return emptyRouting();
  }

  const outgoing = j10Flow.outgoing;

  if (!Array.isArray(outgoing)) {
    return emptyRouting();
  }

  const successEdge =
    outgoing.find((edge) =>
      isRoutingEdge(edge) &&
      (
        edge.kind === "success" ||
        edge.kind === "next" ||
        edge.kind === "true"
      )
    ) ?? null;

  const failureEdge =
    outgoing.find((edge) =>
      isRoutingEdge(edge) &&
      (
        edge.kind === "failure" ||
        edge.kind === "false"
      )
    ) ?? null;

  return {
    successNodeId:
      isRoutingEdge(successEdge)
        ? successEdge.targetNodeId
        : null,
    failureNodeId:
      isRoutingEdge(failureEdge)
        ? failureEdge.targetNodeId
        : null,
    successStepOrder:
      isRoutingEdge(successEdge)
        ? successEdge.targetStepOrder
        : null,
    failureStepOrder:
      isRoutingEdge(failureEdge)
        ? failureEdge.targetStepOrder
        : null,
  };
}

function emptyRouting() {
  return {
    successNodeId: null,
    failureNodeId: null,
    successStepOrder: null,
    failureStepOrder: null,
  };
}

function isRoutingEdge(
  value: unknown
): value is {
  targetNodeId: string;
  targetStepOrder: number;
  kind: string;
} {
  return (
    isRecord(value) &&
    typeof value.targetNodeId === "string" &&
    typeof value.targetStepOrder === "number" &&
    typeof value.kind === "string"
  );
}

async function archiveVersion(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  versionId: string | null,
  userId: string
) {
  if (!versionId) {
    return;
  }

  const {
    error,
  } = await supabase
    .from("automation_versions")
    .update({
      status: "archived",
      retired_at: new Date().toISOString(),
    })
    .eq("id", versionId)
    .eq("user_id", userId);

  if (error) {
    console.error(
      "Publish version archive cleanup error:",
      error
    );
  }
}

async function recordPublishActivity({
  supabase,
  userId,
  automationId,
  automationName,
  versionId,
  versionNumber,
  graph,
  stepCount,
  activated,
}: {
  supabase: Awaited<ReturnType<typeof getSupabase>>;
  userId: string;
  automationId: string;
  automationName: string;
  versionId: string;
  versionNumber: number;
  graph: J10FlowGraph;
  stepCount: number;
  activated: boolean;
}) {
  const {
    error,
  } = await supabase
    .from("activity_logs")
    .insert({
      user_id: userId,
      action: "automation_version_published",
      entity_type: "automation",
      entity_id: automationId,
      title: `${automationName} version published`,
      description:
        `Workflow version ${versionNumber} was published from J10 Flow.`,
      metadata: {
        source: "j10_flow_publish",
        automation_id: automationId,
        automation_version_id: versionId,
        version_number: versionNumber,
        graph_version: graph.version,
        node_count: graph.nodes.length,
        edge_count: graph.edges.length,
        step_count: stepCount,
        runtime_switch_required: false,
        activated,
      },
    });

  if (error) {
    console.error(
      "Publish activity log error:",
      error
    );
  }
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
