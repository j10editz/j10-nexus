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

import {
  getNextScheduledRun,
  isScheduleDue,
} from "@/lib/automation/schedule";

/*
============================================================
J10 AUTOMATION SCHEDULER
12J-A2

Authenticated scheduler scanner.

Responsibilities:
- Find active scheduled workflows.
- Initialize missing next_run_at values.
- Detect workflows that are due.
- Claim due schedules before execution.
- Execute the existing J10 workflow runtime.
- Advance next_run_at to the next future occurrence.
- Preserve human approval and execution history.
============================================================
*/

type ScheduledAutomation = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  trigger_type: string;
  schedule_expression: string | null;
  timezone: string;
  last_run_at: string | null;
  next_run_at: string | null;
};

type WorkflowRunResponse = {
  success: boolean;
  error?: string;
  message?: string;

  status?: string;

  awaitingApproval?: boolean;

  run?: {
    id: string;
    automationId?: string;
    currentStepOrder?: number | null;
    completedSteps?: number;
    apiCalled?: boolean;
    totalCostUSD?: number;
    executionMode?: string;
  };
};

type SchedulerResult = {
  automationId: string;
  automationName: string;

  status:
    | "initialized"
    | "not_due"
    | "completed"
    | "awaiting_approval"
    | "failed"
    | "skipped";

  scheduledFor:
    | string
    | null;

  nextRunAt:
    | string
    | null;

  runId:
    | string
    | null;

  message: string;
};

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
            Cookie mutation may not be available
            in every route-handler context.
            */
          }
        },
      },
    }
  );
}

/*
============================================================
JSON HELPER
============================================================
*/

async function parseJsonResponse<T>(
  response: Response
): Promise<T> {
  const text =
    await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(
      text
    ) as T;
  } catch {
    throw new Error(
      `J10 scheduler received an invalid workflow response (${response.status}).`
    );
  }
}

/*
============================================================
POST
SCAN + EXECUTE DUE SCHEDULES
============================================================
*/

export async function POST(
  request: NextRequest
) {
  try {
    const supabase =
      await getSupabase();

    const {
      data: {
        user,
      },

      error:
        userError,
    } =
      await supabase.auth.getUser();

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

    const schedulerStartedAt =
      new Date();

    const schedulerStartedISO =
      schedulerStartedAt.toISOString();

    /*
    ============================================================
    LOAD ACTIVE SCHEDULED WORKFLOWS
    ============================================================
    */

    const {
      data:
        rawAutomations,

      error:
        automationError,
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
          trigger_type,
          schedule_expression,
          timezone,
          last_run_at,
          next_run_at
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "status",
          "active"
        )
        .eq(
          "trigger_type",
          "schedule"
        )
        .order(
          "next_run_at",
          {
            ascending:
              true,

            nullsFirst:
              true,
          }
        );

    if (
      automationError
    ) {
      console.error(
        "J10 scheduler workflow lookup error:",
        automationError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load scheduled workflows.",
        },
        {
          status: 500,
        }
      );
    }

    const automations =
      (rawAutomations ??
        []) as ScheduledAutomation[];

    /*
    ============================================================
    NOTHING TO SCAN
    ============================================================
    */

    if (
      automations.length ===
      0
    ) {
      return NextResponse.json({
        success: true,

        message:
          "No active scheduled workflows found.",

        scheduler: {
          checkedAt:
            schedulerStartedISO,

          scanned:
            0,

          due:
            0,

          initialized:
            0,

          executed:
            0,

          completed:
            0,

          awaitingApproval:
            0,

          failed:
            0,

          skipped:
            0,
        },

        results: [],
      });
    }

    /*
    ============================================================
    INTERNAL WORKFLOW REQUEST CONTEXT
    ============================================================
    */

    const origin =
      request.nextUrl.origin;

    const cookieHeader =
      request.headers.get(
        "cookie"
      ) ?? "";

    const results:
      SchedulerResult[] = [];

    let dueCount =
      0;

    let initializedCount =
      0;

    let executedCount =
      0;

    let completedCount =
      0;

    let awaitingApprovalCount =
      0;

    let failedCount =
      0;

    let skippedCount =
      0;

    /*
    ============================================================
    PROCESS WORKFLOWS
    ============================================================
    */

    for (
      const automation of
        automations
    ) {
      /*
      ==========================================================
      VALIDATE SCHEDULE
      ==========================================================
      */

      const expression =
        automation.schedule_expression?.trim() ??
        "";

      const timezone =
        automation.timezone?.trim() ||
        "UTC";

      if (!expression) {
        skippedCount +=
          1;

        results.push({
          automationId:
            automation.id,

          automationName:
            automation.name,

          status:
            "skipped",

          scheduledFor:
            automation.next_run_at,

          nextRunAt:
            automation.next_run_at,

          runId:
            null,

          message:
            "Scheduled workflow has no schedule expression.",
        });

        continue;
      }

      /*
      ==========================================================
      INITIALIZE NEXT RUN

      New scheduled workflows do not execute immediately.
      J10 calculates their first future occurrence.
      ==========================================================
      */

      if (
        !automation.next_run_at
      ) {
        try {
          const schedule =
            getNextScheduledRun(
              expression,
              timezone,
              schedulerStartedAt
            );

          const {
            error:
              initializeError,
          } =
            await supabase
              .from(
                "automations"
              )
              .update({
                next_run_at:
                  schedule.nextRunAt,

                updated_at:
                  schedulerStartedISO,
              })
              .eq(
                "id",
                automation.id
              )
              .eq(
                "user_id",
                user.id
              )
              .eq(
                "status",
                "active"
              )
              .eq(
                "trigger_type",
                "schedule"
              );

          if (
            initializeError
          ) {
            throw initializeError;
          }

          initializedCount +=
            1;

          results.push({
            automationId:
              automation.id,

            automationName:
              automation.name,

            status:
              "initialized",

            scheduledFor:
              null,

            nextRunAt:
              schedule.nextRunAt,

            runId:
              null,

            message:
              "Schedule initialized successfully.",
          });
        } catch (error) {
          failedCount +=
            1;

          results.push({
            automationId:
              automation.id,

            automationName:
              automation.name,

            status:
              "failed",

            scheduledFor:
              null,

            nextRunAt:
              null,

            runId:
              null,

            message:
              error instanceof Error
                ? error.message
                : "Could not initialize the workflow schedule.",
          });
        }

        continue;
      }

      /*
      ==========================================================
      CHECK DUE
      ==========================================================
      */

      if (
        !isScheduleDue(
          automation.next_run_at,
          schedulerStartedAt
        )
      ) {
        results.push({
          automationId:
            automation.id,

          automationName:
            automation.name,

          status:
            "not_due",

          scheduledFor:
            automation.next_run_at,

          nextRunAt:
            automation.next_run_at,

          runId:
            null,

          message:
            "Workflow is not due yet.",
        });

        continue;
      }

      dueCount +=
        1;

      const scheduledFor =
        automation.next_run_at;

      /*
      ==========================================================
      CALCULATE NEXT FUTURE RUN

      We calculate from NOW instead of repeatedly replaying every
      missed schedule if the scheduler was offline for a while.
      ==========================================================
      */

      let nextRunAt:
        string;

      try {
        nextRunAt =
          getNextScheduledRun(
            expression,
            timezone,
            schedulerStartedAt
          ).nextRunAt;
      } catch (error) {
        failedCount +=
          1;

        results.push({
          automationId:
            automation.id,

          automationName:
            automation.name,

          status:
            "failed",

          scheduledFor,

          nextRunAt:
            automation.next_run_at,

          runId:
            null,

          message:
            error instanceof Error
              ? error.message
              : "Could not calculate the following scheduled run.",
        });

        continue;
      }

      /*
      ==========================================================
      CLAIM DUE WORKFLOW

      Conditional next_run_at match prevents two scheduler scans
      from executing the same scheduled occurrence.
      ==========================================================
      */

      const {
        data:
          claimedRows,

        error:
          claimError,
      } =
        await supabase
          .from(
            "automations"
          )
          .update({
            next_run_at:
              nextRunAt,

            updated_at:
              schedulerStartedISO,
          })
          .eq(
            "id",
            automation.id
          )
          .eq(
            "user_id",
            user.id
          )
          .eq(
            "status",
            "active"
          )
          .eq(
            "trigger_type",
            "schedule"
          )
          .eq(
            "next_run_at",
            scheduledFor
          )
          .select(
            `
            id
            `
          );

      if (
        claimError
      ) {
        failedCount +=
          1;

        results.push({
          automationId:
            automation.id,

          automationName:
            automation.name,

          status:
            "failed",

          scheduledFor,

          nextRunAt:
            automation.next_run_at,

          runId:
            null,

          message:
            "J10 could not claim the scheduled workflow.",
        });

        continue;
      }

      if (
        !claimedRows ||
        claimedRows.length ===
          0
      ) {
        skippedCount +=
          1;

        results.push({
          automationId:
            automation.id,

          automationName:
            automation.name,

          status:
            "skipped",

          scheduledFor,

          nextRunAt,

          runId:
            null,

          message:
            "Scheduled occurrence was already claimed by another scheduler scan.",
        });

        continue;
      }

      /*
      ==========================================================
      EXECUTE EXISTING J10 WORKFLOW ENGINE
      ==========================================================
      */

      executedCount +=
        1;

      try {
        const runResponse =
          await fetch(
            `${origin}/api/automations/${encodeURIComponent(
              automation.id
            )}/run`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                cookie:
                  cookieHeader,
              },

              cache:
                "no-store",

              body:
                JSON.stringify({
                  triggerSource:
                    "schedule",

                  triggerPayload: {
                    source:
                      "j10_scheduler",

                    scheduledFor,

                    schedulerCheckedAt:
                      schedulerStartedISO,

                    scheduleExpression:
                      expression,

                    timezone,
                  },
                }),
            }
          );

        const runResult =
          await parseJsonResponse<WorkflowRunResponse>(
            runResponse
          );

        if (
          !runResponse.ok ||
          !runResult.success
        ) {
          failedCount +=
            1;

          results.push({
            automationId:
              automation.id,

            automationName:
              automation.name,

            status:
              "failed",

            scheduledFor,

            nextRunAt,

            runId:
              runResult.run?.id ??
              null,

            message:
              runResult.error ||
              "Scheduled workflow execution failed.",
          });

          continue;
        }

        if (
          runResult.awaitingApproval ||
          runResult.status ===
            "awaiting_approval"
        ) {
          awaitingApprovalCount +=
            1;

          results.push({
            automationId:
              automation.id,

            automationName:
              automation.name,

            status:
              "awaiting_approval",

            scheduledFor,

            nextRunAt,

            runId:
              runResult.run?.id ??
              null,

            message:
              runResult.message ||
              "Scheduled workflow is waiting for human approval.",
          });

          continue;
        }

        completedCount +=
          1;

        results.push({
          automationId:
            automation.id,

          automationName:
            automation.name,

          status:
            "completed",

          scheduledFor,

          nextRunAt,

          runId:
            runResult.run?.id ??
            null,

          message:
            runResult.message ||
            "Scheduled workflow completed successfully.",
        });
      } catch (error) {
        failedCount +=
          1;

        results.push({
          automationId:
            automation.id,

          automationName:
            automation.name,

          status:
            "failed",

          scheduledFor,

          nextRunAt,

          runId:
            null,

          message:
            error instanceof Error
              ? error.message
              : "Scheduled workflow execution failed.",
        });
      }
    }

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    return NextResponse.json({
      success: true,

      message:
        dueCount > 0
          ? "J10 scheduler scan completed."
          : "J10 scheduler scan completed. No workflows were due.",

      scheduler: {
        checkedAt:
          schedulerStartedISO,

        scanned:
          automations.length,

        due:
          dueCount,

        initialized:
          initializedCount,

        executed:
          executedCount,

        completed:
          completedCount,

        awaitingApproval:
          awaitingApprovalCount,

        failed:
          failedCount,

        skipped:
          skippedCount,
      },

      results,
    });
  } catch (error) {
    console.error(
      "J10 scheduler fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "J10 scheduler failed.",
      },
      {
        status: 500,
      }
    );
  }
}