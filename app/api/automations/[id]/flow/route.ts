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
  AutomationTriggerType,
} from "@/types/automation";

import type {
  J10FlowGraph,
} from "@/types/automation-graph";

import {
  isJ10FlowGraph,
  validateJ10FlowGraph,
} from "@/lib/automation/graph-contract";

import {
  buildJ10FlowGraphFromRuntime,
  type RuntimeStepForGraph,
} from "@/lib/automation/graph-from-runtime";

import {
  listIntegrationConnections,
} from "@/lib/integrations/database";

import {
  serializeIntegrationConnection,
} from "@/lib/integrations/api";

import {
  evaluateIntegrationReadiness,
} from "@/lib/integrations/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown> | null;
  schedule_expression: string | null;
  timezone: string | null;
  draft_graph: unknown;
  draft_graph_version: string | null;
  draft_revision: number | null;
  draft_updated_at: string | null;
  published_version_id: string | null;
  last_published_at: string | null;
  updated_at: string;
};

type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
};

const STRUCTURAL_DRAFT_ERROR_CODES = new Set([
  "invalid_graph",
  "unsupported_graph_version",
  "graph_too_large",
  "graph_not_serializable",
  "invalid_nodes",
  "invalid_edges",
  "too_many_nodes",
  "too_many_edges",
  "invalid_node",
  "missing_node_id",
  "duplicate_node_id",
  "unknown_node_type",
  "unsupported_node_version",
  "invalid_node_position",
  "invalid_node_enabled_state",
  "invalid_edge",
  "missing_edge_id",
  "duplicate_edge_id",
  "credential_material_forbidden",
]);

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
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Cookie writes may be unavailable in read-only route contexts.
          }
        },
      },
    },
  );
}

async function getAuthorizedWorkflow(context: RouteContext) {
  const { id } = await context.params;
  const supabase = await getSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Unauthorized." },
        { status: 401 },
      ),
    } as const;
  }

  const { data, error } = await supabase
    .from("automations")
    .select(
      `
      id,
      user_id,
      name,
      description,
      status,
      trigger_type,
      trigger_config,
      schedule_expression,
      timezone,
      draft_graph,
      draft_graph_version,
      draft_revision,
      draft_updated_at,
      published_version_id,
      last_published_at,
      updated_at
      `,
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("J10 Flow workflow lookup error:", error);
    return {
      response: NextResponse.json(
        { success: false, error: "Could not load this workflow." },
        { status: 500 },
      ),
    } as const;
  }

  if (!data) {
    return {
      response: NextResponse.json(
        { success: false, error: "Workflow not found." },
        { status: 404 },
      ),
    } as const;
  }

  return {
    supabase,
    user,
    automation: data as AutomationRow,
  } as const;
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const authorized = await getAuthorizedWorkflow(context);

    if ("response" in authorized) {
      return authorized.response;
    }

    const { supabase, user, automation } = authorized;
    const { data: rawSteps, error: stepsError } = await supabase
      .from("automation_steps")
      .select(
        `
        id,
        step_order,
        name,
        step_type,
        action_type,
        employee_id,
        task_type,
        instructions,
        config,
        condition_config,
        requires_approval,
        on_success_step_id,
        on_failure_step_id,
        is_enabled
        `,
      )
      .eq("automation_id", automation.id)
      .eq("user_id", user.id)
      .order("step_order", { ascending: true });

    if (stepsError) {
      console.error("J10 Flow runtime-step lookup error:", stepsError);
      return NextResponse.json(
        { success: false, error: "Could not load workflow steps." },
        { status: 500 },
      );
    }

    const graph: J10FlowGraph = isJ10FlowGraph(automation.draft_graph)
      ? automation.draft_graph
      : buildJ10FlowGraphFromRuntime(
          {
            id: automation.id,
            name: automation.name,
            description: automation.description,
            trigger_type: automation.trigger_type,
            trigger_config: automation.trigger_config,
            schedule_expression: automation.schedule_expression,
            timezone: automation.timezone,
          },
          (rawSteps ?? []) as RuntimeStepForGraph[],
        );

    const [connections, employeesResult] = await Promise.all([
      listIntegrationConnections(supabase, user.id),
      supabase
        .from("employees")
        .select("id, name, role, department, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (employeesResult.error) {
      console.error("J10 Flow employee lookup error:", employeesResult.error);
    }

    const safeConnections = connections
      .filter((connection) => connection.providerId !== "whatsapp-business")
      .map((connection) => ({
        ...serializeIntegrationConnection(connection),
        readiness: evaluateIntegrationReadiness(connection),
      }));

    return NextResponse.json({
      success: true,
      automation: {
        id: automation.id,
        name: automation.name,
        description: automation.description,
        status: automation.status,
        publishedVersionId: automation.published_version_id,
        lastPublishedAt: automation.last_published_at,
        updatedAt: automation.updated_at,
      },
      draft: {
        graph,
        revision: Number(automation.draft_revision ?? 0),
        updatedAt: automation.draft_updated_at,
        validation: validateJ10FlowGraph(graph),
      },
      connections: safeConnections,
      employees: ((employeesResult.data ?? []) as EmployeeRow[]).map(
        (employee) => ({
          id: employee.id,
          name: employee.name,
          role: employee.role,
          department: employee.department,
          status: employee.status,
        }),
      ),
    });
  } catch (error) {
    console.error("J10 Flow load fatal error:", error);
    return NextResponse.json(
      { success: false, error: "J10 could not load the workflow builder." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
) {
  try {
    const authorized = await getAuthorizedWorkflow(context);

    if ("response" in authorized) {
      return authorized.response;
    }

    if (authorized.automation.status === "archived") {
      return NextResponse.json(
        { success: false, error: "Archived workflows cannot be edited." },
        { status: 409 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body contains invalid JSON." },
        { status: 400 },
      );
    }

    if (!isRecord(body) || !isJ10FlowGraph(body.graph)) {
      return NextResponse.json(
        { success: false, error: "A J10 Flow graph is required." },
        { status: 400 },
      );
    }

    if (
      typeof body.expectedRevision !== "number" ||
      !Number.isInteger(body.expectedRevision) ||
      body.expectedRevision < 0
    ) {
      return NextResponse.json(
        { success: false, error: "A valid draft revision is required." },
        { status: 400 },
      );
    }

    const graph = body.graph;
    const validation = validateJ10FlowGraph(graph);
    const structuralError = validation.errors.find((issue) =>
      STRUCTURAL_DRAFT_ERROR_CODES.has(issue.code),
    );

    if (structuralError) {
      return NextResponse.json(
        {
          success: false,
          error: structuralError.message,
          code: "J10_FLOW_DRAFT_UNSAFE",
          validation,
        },
        { status: 400 },
      );
    }

    const { data, error } = await authorized.supabase.rpc(
      "save_automation_draft_graph",
      {
        p_automation_id: authorized.automation.id,
        p_graph: graph,
        p_graph_version: graph.version,
        p_expected_revision: body.expectedRevision,
      },
    );

    if (error) {
      const conflict = error.code === "40001";
      console.error("J10 Flow draft save error:", {
        code: error.code,
        message: error.message,
      });

      return NextResponse.json(
        {
          success: false,
          error: conflict
            ? "This draft changed in another session. Refresh before saving again."
            : "J10 could not save this workflow draft.",
          code: conflict
            ? "J10_FLOW_DRAFT_CONFLICT"
            : "J10_FLOW_DRAFT_SAVE_FAILED",
        },
        { status: conflict ? 409 : 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: validation.valid
        ? "Workflow draft saved and ready for publication."
        : "Workflow draft saved with validation issues.",
      draft: data,
      validation,
    });
  } catch (error) {
    console.error("J10 Flow save fatal error:", error);
    return NextResponse.json(
      { success: false, error: "J10 could not save this workflow draft." },
      { status: 500 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
