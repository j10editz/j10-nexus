import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

export async function GET() {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    // EMPLOYEES
    const {
      data: employees,
      error: employeesError,
    } = await supabase
      .from("employees")
      .select(
        `
        id,
        status,
        tasks_completed,
        revenue_generated
        `
      )
      .eq("workspace_id", context.workspace.id);

    if (employeesError) {
      console.error(
        "Dashboard employee stats error:",
        employeesError
      );

      return NextResponse.json(
        {
          error:
            "Could not load dashboard statistics.",
        },
        {
          status: 500,
        }
      );
    }

    // AUTOMATIONS / WORKFLOWS
    let workflowList: Array<{ id: string; status: string; runs_count?: number }> = [];
    const {
      data: automationsData,
      error: automationsError,
    } = await supabase
      .from("automations")
      .select(
        `
        id,
        status,
        runs_count
        `
      )
      .eq("workspace_id", context.workspace.id);

    if (!automationsError && automationsData) {
      workflowList = automationsData;
    } else {
      const { data: wfData } = await supabase
        .from("workflows")
        .select("id, status, runs_count")
        .eq("workspace_id", context.workspace.id);
      workflowList = wfData ?? [];
    }

    const employeeList =
      employees ?? [];

    const totalEmployees =
      employeeList.length;

    const runningEmployees =
      employeeList.filter(
        (employee) =>
          employee.status === "Running"
      ).length;

    const pausedEmployees =
      employeeList.filter(
        (employee) =>
          employee.status === "Paused"
      ).length;

    const offlineEmployees =
      employeeList.filter(
        (employee) =>
          employee.status === "Offline"
      ).length;

    const tasksCompleted =
      employeeList.reduce(
        (total, employee) =>
          total +
          Number(
            employee.tasks_completed ?? 0
          ),
        0
      );

    const revenueGenerated =
      employeeList.reduce(
        (total, employee) =>
          total +
          Number(
            employee.revenue_generated ?? 0
          ),
        0
      );

    const totalWorkflows =
      workflowList.length;

    const runningWorkflows =
      workflowList.filter(
        (workflow) =>
          workflow.status === "Running"
      ).length;

    const pausedWorkflows =
      workflowList.filter(
        (workflow) =>
          workflow.status === "Paused"
      ).length;

    const draftWorkflows =
      workflowList.filter(
        (workflow) =>
          workflow.status === "Draft"
      ).length;

    const errorWorkflows =
      workflowList.filter(
        (workflow) =>
          workflow.status === "Error"
      ).length;

    const workflowRuns =
      workflowList.reduce(
        (total, workflow) =>
          total +
          Number(
            workflow.runs_count ?? 0
          ),
        0
      );

    return NextResponse.json({
      success: true,

      stats: {
        aiEmployees: {
          total: totalEmployees,
          running: runningEmployees,
          paused: pausedEmployees,
          offline: offlineEmployees,
        },

        automations: {
          total: totalWorkflows,
          running: runningWorkflows,
          paused: pausedWorkflows,
          draft: draftWorkflows,
          error: errorWorkflows,
          runs: workflowRuns,
        },

        tasksCompleted,

        revenueGenerated,
      },
    });
  } catch (error) {
    console.error(
      "Dashboard stats API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "J10 NEXUS could not load dashboard statistics.",
      },
      {
        status: 500,
      }
    );
  }
}