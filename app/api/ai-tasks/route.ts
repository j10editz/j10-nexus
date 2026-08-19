import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  getJ10AIMode,
} from "@/lib/ai/runtime";

import {
  dispatchAutomationEvent,
} from "@/lib/automation/event-trigger-engine";

/*
============================================================
TYPES
============================================================
*/

type CreateTaskRequest = {
  employeeId?: string;
  title?: string;
  taskType?: string;
  instructions?: string;
  inputText?: string;

  automationContext?: {
    sourceWorkflowId?: string;
    eventDepth?: number;
  };
};

type Employee = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  model: string;
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
            Cookie writes may not be available
            in every server context.
            */
          }
        },
      },
    }
  );
}

/*
============================================================
AUTH
============================================================
*/

async function getAuthenticatedUser() {
  const supabase =
    await getSupabase();

  const {
    data: { user },
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
GET TASKS
============================================================
*/

export async function GET(
  request: Request
) {
  try {
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
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    const employeeId =
      url.searchParams
        .get("employeeId")
        ?.trim();

    let query =
      supabase
        .from("ai_tasks")
        .select(
          `
          id,
          user_id,
          employee_id,
          employee_name,
          title,
          task_type,
          instructions,
          input_text,
          status,
          result_text,
          error_message,
          execution_mode,
          api_called,
          target_model,
          display_model,
          estimated_cost_usd,
          started_at,
          completed_at,
          created_at,
          updated_at
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    if (employeeId) {
      query =
        query.eq(
          "employee_id",
          employeeId
        );
    }

    const {
      data,
      error,
    } =
      await query;

    if (error) {
      console.error(
        "AI tasks GET error:",
        error
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not load AI tasks.",
        },
        {
          status: 500,
        }
      );
    }

    const tasks =
      data ?? [];

    return NextResponse.json({
      success: true,

      summary: {
        total:
          tasks.length,

        pending:
          tasks.filter(
            (task) =>
              task.status ===
              "pending"
          ).length,

        running:
          tasks.filter(
            (task) =>
              task.status ===
              "running"
          ).length,

        completed:
          tasks.filter(
            (task) =>
              task.status ===
              "completed"
          ).length,

        failed:
          tasks.filter(
            (task) =>
              task.status ===
              "failed"
          ).length,
      },

      tasks,
    });
  } catch (error) {
    console.error(
      "AI tasks GET fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not load AI tasks.",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
CREATE TASK
============================================================
*/

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as CreateTaskRequest;

    const employeeId =
      typeof body.employeeId ===
      "string"
        ? body.employeeId.trim()
        : "";

    const title =
      typeof body.title ===
      "string"
        ? body.title.trim()
        : "";

    const taskType =
      typeof body.taskType ===
      "string" &&
      body.taskType.trim()
        ? body.taskType.trim()
        : "general";

    const instructions =
      typeof body.instructions ===
      "string"
        ? body.instructions.trim()
        : "";

    const inputText =
      typeof body.inputText ===
      "string"
        ? body.inputText.trim()
        : "";

    /*
    ============================================================
    VALIDATION
    ============================================================
    */

    if (!employeeId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Employee ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Task title is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!instructions) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Task instructions are required.",
        },
        {
          status: 400,
        }
      );
    }

    /*
    ============================================================
    AUTH
    ============================================================
    */

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
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /*
    ============================================================
    VERIFY EXACT EMPLOYEE
    ============================================================
    */

    const {
      data:
        employeeData,

      error:
        employeeError,
    } =
      await supabase
        .from("employees")
        .select(
          `
          id,
          name,
          role,
          department,
          status,
          model
          `
        )
        .eq(
          "id",
          employeeId
        )
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (employeeError) {
      console.error(
        "AI task employee lookup error:",
        employeeError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not verify the selected AI employee.",
        },
        {
          status: 500,
        }
      );
    }

    if (!employeeData) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selected AI employee was not found.",
        },
        {
          status: 404,
        }
      );
    }

    const employee =
      employeeData as Employee;

    /*
    ============================================================
    CREATE PENDING TASK
    ============================================================
    */

    const executionMode =
      getJ10AIMode();

    const {
      data:
        task,

      error:
        taskError,
    } =
      await supabase
        .from("ai_tasks")
        .insert({
          user_id:
            user.id,

          employee_id:
            employee.id,

          employee_name:
            employee.name,

          title,

          task_type:
            taskType,

          instructions,

          input_text:
            inputText ||
            null,

          status:
            "pending",

          execution_mode:
            executionMode,

          api_called:
            false,

          estimated_cost_usd:
            0,
        })
        .select("*")
        .single();

    if (
      taskError ||
      !task
    ) {
      console.error(
        "AI task create error:",
        taskError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Could not create the AI task.",
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

    const {
      error:
        activityError,
    } =
      await supabase
        .from(
          "activity_logs"
        )
        .insert({
          user_id:
            user.id,

          entity_type:
            "ai_employee",

          entity_id:
            employee.id,

          action:
            "ai_task_created",

          title:
            `Task assigned to ${employee.name}`,

          description:
            title,

          metadata: {
            source:
              "ai_workforce_task_engine",

            task_id:
              task.id,

            task_title:
              title,

            task_type:
              taskType,

            employee_id:
              employee.id,

            employee_name:
              employee.name,

            employee_role:
              employee.role,

            execution_mode:
              executionMode,

            api_called:
              false,

            estimated_cost_usd:
              0,
          },
        });

    if (activityError) {
      console.error(
        "AI task activity error:",
        activityError
      );
    }

    /*
    ============================================================
    NEW AI TASK AUTOMATION EVENT
    ============================================================
    */

    const automationContext =
      body.automationContext &&
      typeof body.automationContext ===
        "object"
        ? body.automationContext
        : {};

    const sourceWorkflowId =
      typeof automationContext.sourceWorkflowId ===
        "string" &&
      automationContext.sourceWorkflowId.trim()
        ? automationContext.sourceWorkflowId.trim()
        : null;

    const parentDepth =
      Number.isFinite(
        Number(
          automationContext.eventDepth ??
            0
        )
      )
        ? Math.max(
            0,
            Math.floor(
              Number(
                automationContext.eventDepth ??
                  0
              )
            )
          )
        : 0;

    const automationEvent =
      await dispatchAutomationEvent({
        supabase,

        userId:
          user.id,

        origin:
          new URL(
            request.url
          ).origin,

        cookieHeader:
          request.headers.get(
            "cookie"
          ) ?? "",

        triggerType:
          "new_ai_task",

        originAutomationId:
          sourceWorkflowId,

        parentDepth,

        payload: {
          task: {
            id:
              task.id,

            title:
              task.title,

            taskType:
              task.task_type,

            status:
              task.status,

            employeeId:
              task.employee_id,

            employeeName:
              task.employee_name,

            executionMode:
              task.execution_mode,

            createdAt:
              task.created_at,
          },

          employee: {
            id:
              employee.id,

            name:
              employee.name,

            role:
              employee.role,

            department:
              employee.department,
          },
        },
      });

    /*
    ============================================================
    RESPONSE
    ============================================================
    */

    return NextResponse.json(
      {
        success: true,

        message:
          "AI task created and assigned.",

        automationEvent,

        employee: {
          id:
            employee.id,

          name:
            employee.name,

          role:
            employee.role,

          status:
            employee.status,

          model:
            employee.model,
        },

        task,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "AI tasks POST fatal error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "J10 NEXUS could not create the AI task.",
      },
      {
        status: 500,
      }
    );
  }
}