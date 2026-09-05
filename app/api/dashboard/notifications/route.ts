import {
  NextRequest,
  NextResponse,
} from "next/server";
import { createServerSupabaseClient } from "@/lib/auth";
import { requireApiWorkspaceContext } from "@/lib/workspaces/server";

type AutomationRunRow = {
  id: string;
  automation_id: string;
  status: string;
  result_summary: string | null;
  error_message: string | null;
  execution_mode: string;
  started_at: string | null;
  completed_at: string | null;
};

type AutomationRow = {
  id: string;
  name: string;
};

function getLimit(request: NextRequest) {
  const requested = Number(
    request.nextUrl.searchParams.get("limit") ?? 25
  );

  if (!Number.isFinite(requested)) {
    return 25;
  }

  return Math.min(
    Math.max(Math.floor(requested), 1),
    100
  );
}

function getNotificationCopy(
  run: AutomationRunRow,
  automationName: string
) {
  switch (run.status) {
    case "awaiting_approval":
      return {
        kind: "approval",
        title: `${automationName} needs approval`,
        message:
          run.result_summary ??
          "A protected workflow action is waiting for your decision.",
      };

    case "failed":
      return {
        kind: "failure",
        title: `${automationName} failed`,
        message:
          run.error_message ??
          "The workflow stopped before it completed.",
      };

    case "completed":
      return {
        kind: "success",
        title: `${automationName} completed`,
        message:
          run.result_summary ??
          "The workflow completed successfully.",
      };

    case "running":
      return {
        kind: "running",
        title: `${automationName} is running`,
        message:
          "J10 is currently processing this workflow.",
      };

    case "queued":
      return {
        kind: "queued",
        title: `${automationName} is queued`,
        message:
          "The workflow is waiting to begin execution.",
      };

    default:
      return {
        kind: "information",
        title: `${automationName}: ${run.status}`,
        message:
          run.result_summary ??
          run.error_message ??
          "The workflow execution status changed.",
      };
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiWorkspaceContext("viewer");
    if (auth.error) {
      return auth.error;
    }
    const { context } = auth;
    const supabase = createServerSupabaseClient();

    const limit = getLimit(request);

    const {
      data: rawRuns,
      error: runsError,
    } = await supabase
      .from("automation_runs")
      .select(
        `
        id,
        automation_id,
        status,
        result_summary,
        error_message,
        execution_mode,
        started_at,
        completed_at
        `
      )
      .eq("workspace_id", context.workspace.id)
      .order("started_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit);

    if (runsError) {
      console.error(
        "Notification run query error:",
        runsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load workflow notifications.",
        },
        {
          status: 500,
        }
      );
    }

    const runs =
      (rawRuns ?? []) as AutomationRunRow[];
    const automationIds = Array.from(
      new Set(
        runs.map((run) => run.automation_id)
      )
    );

    let automations: AutomationRow[] = [];

    if (automationIds.length > 0) {
      const {
        data: rawAutomations,
        error: automationsError,
      } = await supabase
        .from("automations")
        .select("id, name")
        .eq("workspace_id", context.workspace.id)
        .in("id", automationIds);

      if (automationsError) {
        console.error(
          "Notification workflow-name query error:",
          automationsError
        );
      } else {
        automations =
          (rawAutomations ?? []) as AutomationRow[];
      }
    }

    const automationNames = new Map(
      automations.map((automation) => [
        automation.id,
        automation.name,
      ])
    );

    const notifications = runs.map((run) => {
      const automationName =
        automationNames.get(run.automation_id) ??
        "J10 Workflow";
      const copy = getNotificationCopy(
        run,
        automationName
      );

      return {
        id: `automation-run:${run.id}`,
        kind: copy.kind,
        title: copy.title,
        message: copy.message,
        status: run.status,
        automationId: run.automation_id,
        runId: run.id,
        executionMode: run.execution_mode,
        occurredAt:
          run.completed_at ?? run.started_at,
        needsAttention:
          run.status === "failed" ||
          run.status === "awaiting_approval",
        href: `/dashboard/automation/flow/${run.automation_id}`,
      };
    });

    return NextResponse.json({
      success: true,
      summary: {
        total: notifications.length,
        attention: notifications.filter(
          (notification) =>
            notification.needsAttention
        ).length,
        approvals: runs.filter(
          (run) =>
            run.status === "awaiting_approval"
        ).length,
        failed: runs.filter(
          (run) => run.status === "failed"
        ).length,
        completed: runs.filter(
          (run) => run.status === "completed"
        ).length,
        active: runs.filter(
          (run) =>
            run.status === "running" ||
            run.status === "queued"
        ).length,
      },
      notifications,
    });
  } catch (error) {
    console.error(
      "Dashboard notifications API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not load notifications.",
      },
      {
        status: 500,
      }
    );
  }
}
