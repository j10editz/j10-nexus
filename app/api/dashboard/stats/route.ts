import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  try {
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
              // Server context may not allow cookie writes.
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
      );

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

    // WORKFLOWS
    const {
      data: workflows,
      error: workflowsError,
    } = await supabase
      .from("workflows")
      .select(
        `
        id,
        status,
        runs_count
        `
      );

    if (workflowsError) {
      console.error(
        "Dashboard workflow stats error:",
        workflowsError
      );

      return NextResponse.json(
        {
          error:
            "Could not load automation statistics.",
        },
        {
          status: 500,
        }
      );
    }

    const employeeList =
      employees ?? [];

    const workflowList =
      workflows ?? [];

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