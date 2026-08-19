import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { runJ10AI } from "@/lib/ai/runtime";

import {
  dispatchAutomationEvent,
  getAutomationEventDepth,
} from "@/lib/automation/event-trigger-engine";

import type {
  J10ModelPreference,
  J10TaskType,
} from "@/lib/ai/model-router";

/*
============================================================
TYPES
============================================================
*/

type AITaskRecord = {
  id: string;

  user_id: string;

  employee_id: string;

  employee_name: string;

  title: string;

  task_type: string;

  instructions: string;

  input_text:
    | string
    | null;

  status: string;

  result_text:
    | string
    | null;

  error_message:
    | string
    | null;

  execution_mode: string;

  api_called: boolean;

  target_model:
    | string
    | null;

  display_model:
    | string
    | null;

  estimated_cost_usd:
    | number
    | string;

  started_at:
    | string
    | null;

  completed_at:
    | string
    | null;

  created_at: string;

  updated_at: string;
};

type EmployeeRecord = {
  id: string;

  name: string;

  role: string;

  department: string;

  status: string;

  model: string;

  tasks_completed: number;

  last_active:
    | string
    | null;
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
POST - EXECUTE TASK
============================================================
*/

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const {
    id,
  } = await params;

  const taskId =
    id?.trim();

  if (!taskId) {
    return NextResponse.json(
      {
        success: false,

        error:
          "Task ID is required.",
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

        error:
          "Unauthorized.",
      },
      {
        status: 401,
      }
    );
  }

  /*
  ============================================================
  LOAD EXACT TASK
  ============================================================
  */

  const {
    data:
      taskData,

    error:
      taskError,
  } =
    await supabase
      .from("ai_tasks")
      .select("*")
      .eq(
        "id",
        taskId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (taskError) {
    console.error(
      "AI task lookup error:",
      taskError
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Could not load the AI task.",
      },
      {
        status: 500,
      }
    );
  }

  if (!taskData) {
    return NextResponse.json(
      {
        success: false,

        error:
          "AI task was not found.",
      },
      {
        status: 404,
      }
    );
  }

  const task =
    taskData as AITaskRecord;

  /*
  ============================================================
  TASK STATE PROTECTION
  ============================================================
  */

  if (
    task.status !==
    "pending"
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          `Only Pending tasks can be executed. Current status: ${task.status}.`,

        taskStatus:
          task.status,
      },
      {
        status: 409,
      }
    );
  }

  /*
  ============================================================
  LOAD EXACT EMPLOYEE
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
        model,
        tasks_completed,
        last_active
        `
      )
      .eq(
        "id",
        task.employee_id
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
          "Could not verify the AI employee assigned to this task.",
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
          "The AI employee assigned to this task no longer exists.",
      },
      {
        status: 404,
      }
    );
  }

  const employee =
    employeeData as EmployeeRecord;

  /*
  ============================================================
  EXACT BINDING CHECK
  ============================================================
  */

  if (
    employee.id !==
    task.employee_id
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          "J10 NEXUS blocked an AI employee task-binding mismatch.",
      },
      {
        status: 403,
      }
    );
  }

  /*
  ============================================================
  EMPLOYEE MUST BE RUNNING
  ============================================================
  */

  if (
    employee.status !==
    "Running"
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          `${employee.name} must be Running before this task can execute.`,

        employeeStatus:
          employee.status,
      },
      {
        status: 409,
      }
    );
  }

  /*
  ============================================================
  LOCK TASK AS RUNNING
  ============================================================
  */

  const startedAt =
    new Date().toISOString();

  const {
    data:
      runningTask,

    error:
      runningError,
  } =
    await supabase
      .from("ai_tasks")
      .update({
        status:
          "running",

        started_at:
          startedAt,

        completed_at:
          null,

        error_message:
          null,

        updated_at:
          startedAt,
      })
      .eq(
        "id",
        task.id
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "status",
        "pending"
      )
      .select("*")
      .maybeSingle();

  if (runningError) {
    console.error(
      "AI task start error:",
      runningError
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "J10 NEXUS could not start this AI task.",
      },
      {
        status: 500,
      }
    );
  }

  /*
  Prevent two requests from executing
  the same task simultaneously.
  */

  if (!runningTask) {
    return NextResponse.json(
      {
        success: false,

        error:
          "This task is no longer available for execution.",
      },
      {
        status: 409,
      }
    );
  }

  /*
  ============================================================
  RECORD START ACTIVITY
  ============================================================
  */

  const {
    error:
      startActivityError,
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
          "ai_task_started",

        title:
          `${employee.name} started ${task.title}`,

        description:
          `J10 Workforce started task execution.`,

        metadata: {
          source:
            "ai_workforce_task_engine",

          task_id:
            task.id,

          task_title:
            task.title,

          task_type:
            task.task_type,

          employee_id:
            employee.id,

          employee_name:
            employee.name,

          exact_employee_binding:
            true,

          started_at:
            startedAt,
        },
      });

  if (startActivityError) {
    console.error(
      "AI task start activity error:",
      startActivityError
    );
  }

  /*
  ============================================================
  EXECUTION
  ============================================================
  */

  try {
    const j10TaskType =
      resolveTaskType(
        task.task_type
      );

    const preference =
      resolveModelPreference(
        employee.model
      );

    const runtimeInput =
      buildRuntimeInput({
        task,
        employee,
      });

    /*
    ==========================================================
    J10 AI RUNTIME
    ==========================================================

    DEVELOPMENT MODE:
    - No OpenAI request
    - $0
    - Simulated result

    LIVE MODE:
    - Uses configured J10 model router
    - May call OpenAI
    ==========================================================
    */

    const result =
      await runJ10AI({
        task:
          j10TaskType,

        input:
          runtimeInput,

        preference,

        instructions: `
You are ${employee.name}, an AI employee inside J10 NEXUS.

Role:
${employee.role}

Department:
${employee.department}

Complete the assigned task using only the supplied context.

Rules:

1. Do not claim that external research, browsing,
emails, CRM changes, financial transactions or
other external actions occurred unless J10 NEXUS
actually executed them.

2. Clearly distinguish facts from assumptions.

3. Follow the task instructions exactly.

4. Produce a useful business result.

5. Keep sensitive actions human-controlled.
`,

        maxOutputTokens:
          6000,
      });

    /*
    ============================================================
    COMPLETE TASK
    ============================================================
    */

    const completedAt =
      new Date().toISOString();

    const {
      data:
        completedTask,

      error:
        completeError,
    } =
      await supabase
        .from("ai_tasks")
        .update({
          status:
            "completed",

          result_text:
            result.text,

          error_message:
            null,

          execution_mode:
            result.executionMode,

          api_called:
            result.apiCalled,

          target_model:
            result.model,

          display_model:
            result.displayModel,

          estimated_cost_usd:
            result.estimatedCostUSD ??
            0,

          completed_at:
            completedAt,

          updated_at:
            completedAt,
        })
        .eq(
          "id",
          task.id
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "employee_id",
          employee.id
        )
        .eq(
          "status",
          "running"
        )
        .select("*")
        .single();

    if (
      completeError ||
      !completedTask
    ) {
      throw new Error(
        "J10 NEXUS generated the task result but could not save the completed task."
      );
    }

    /*
    ============================================================
    INCREMENT EMPLOYEE TASK COUNT
    ============================================================
    */

    const {
      error:
        employeeUpdateError,
    } =
      await supabase
        .from("employees")
        .update({
          tasks_completed:
            Number(
              employee.tasks_completed ??
                0
            ) + 1,

          last_active:
            "Just now",
        })
        .eq(
          "id",
          employee.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (
      employeeUpdateError
    ) {
      console.error(
        "AI employee task counter error:",
        employeeUpdateError
      );
    }

    /*
    ============================================================
    COMPLETION ACTIVITY
    ============================================================
    */

    const {
      error:
        completionActivityError,
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
            "ai_task_completed",

          title:
            `${employee.name} completed ${task.title}`,

          description:
            "AI Workforce task completed successfully.",

          metadata: {
            source:
              "ai_workforce_task_engine",

            task_id:
              task.id,

            task_title:
              task.title,

            task_type:
              task.task_type,

            employee_id:
              employee.id,

            employee_name:
              employee.name,

            employee_role:
              employee.role,

            exact_employee_binding:
              true,

            execution_mode:
              result.executionMode,

            simulated:
              result.simulated,

            api_called:
              result.apiCalled,

            target_model:
              result.model,

            display_model:
              result.displayModel,

            workload:
              result.workload,

            reasoning_effort:
              result.reasoningEffort,

            reasoning_mode:
              result.reasoningMode,

            estimated_cost_usd:
              result.estimatedCostUSD ??
              0,

            completed_at:
              completedAt,
          },
        });

    if (
      completionActivityError
    ) {
      console.error(
        "AI task completion activity error:",
        completionActivityError
      );
    }

    /*
    ============================================================
    AI TASK COMPLETED AUTOMATION EVENT

    If this AI task was created by another workflow, recover
    the parent workflow/event context so J10 can prevent direct
    self-trigger loops and cap chained event depth.
    ============================================================
    */

    const {
      data:
        originRunStep,
    } =
      await supabase
        .from(
          "automation_run_steps"
        )
        .select(
          `
          run_id,
          automation_id
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "ai_task_id",
          task.id
        )
        .limit(1)
        .maybeSingle();

    let originAutomationId:
      | string
      | null =
      originRunStep?.automation_id ??
      null;

    let parentDepth =
      0;

    if (
      originRunStep?.run_id
    ) {
      const {
        data:
          originRun,
      } =
        await supabase
          .from(
            "automation_runs"
          )
          .select(
            `
            trigger_payload
            `
          )
          .eq(
            "id",
            originRunStep.run_id
          )
          .eq(
            "user_id",
            user.id
          )
          .maybeSingle();

      if (
        originRun?.trigger_payload &&
        typeof originRun.trigger_payload ===
          "object" &&
        !Array.isArray(
          originRun.trigger_payload
        )
      ) {
        parentDepth =
          getAutomationEventDepth(
            originRun.trigger_payload as Record<
              string,
              unknown
            >
          );
      }
    }

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
          "ai_task_completed",

        originAutomationId,

        parentDepth,

        payload: {
          task: {
            id:
              completedTask.id,

            title:
              completedTask.title,

            taskType:
              completedTask.task_type,

            status:
              completedTask.status,

            resultText:
              completedTask.result_text,

            employeeId:
              completedTask.employee_id,

            employeeName:
              completedTask.employee_name,

            executionMode:
              completedTask.execution_mode,

            apiCalled:
              completedTask.api_called,

            targetModel:
              completedTask.target_model,

            displayModel:
              completedTask.display_model,

            estimatedCostUSD:
              completedTask.estimated_cost_usd,

            completedAt:
              completedTask.completed_at,
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
    SUCCESS RESPONSE
    ============================================================
    */

    return NextResponse.json({
      success:
        true,

      automationEvent,

      message:
        `${employee.name} completed the task.`,

      binding: {
        mode:
          "exact_employee",

        verified:
          true,

        employeeId:
          employee.id,

        taskId:
          task.id,
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

        status:
          employee.status,
      },

      runtime: {
        executionMode:
          result.executionMode,

        simulated:
          result.simulated,

        apiCalled:
          result.apiCalled,

        targetModel:
          result.model,

        displayModel:
          result.displayModel,

        workload:
          result.workload,

        reasoningEffort:
          result.reasoningEffort,

        reasoningMode:
          result.reasoningMode,

        estimatedCostUSD:
          result.estimatedCostUSD ??
          0,
      },

      task:
        completedTask,
    });
  } catch (error) {
    /*
    ============================================================
    FAILURE
    ============================================================
    */

    const message =
      error instanceof Error
        ? error.message
        : "Unknown AI task execution error.";

    console.error(
      "AI task execution error:",
      error
    );

    const failedAt =
      new Date().toISOString();

    const {
      error:
        failedUpdateError,
    } =
      await supabase
        .from("ai_tasks")
        .update({
          status:
            "failed",

          error_message:
            message,

          completed_at:
            failedAt,

          updated_at:
            failedAt,
        })
        .eq(
          "id",
          task.id
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "employee_id",
          employee.id
        );

    if (
      failedUpdateError
    ) {
      console.error(
        "AI failed-task update error:",
        failedUpdateError
      );
    }

    const {
      error:
        failedActivityError,
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
            "ai_task_failed",

          title:
            `${employee.name} failed ${task.title}`,

          description:
            message,

          metadata: {
            source:
              "ai_workforce_task_engine",

            task_id:
              task.id,

            task_title:
              task.title,

            employee_id:
              employee.id,

            employee_name:
              employee.name,

            exact_employee_binding:
              true,

            failed_at:
              failedAt,
          },
        });

    if (
      failedActivityError
    ) {
      console.error(
        "AI failed-task activity error:",
        failedActivityError
      );
    }

    return NextResponse.json(
      {
        success:
          false,

        error:
          message,

        taskStatus:
          "failed",
      },
      {
        status: 500,
      }
    );
  }
}

/*
============================================================
TASK TYPE ROUTER
============================================================
*/

function resolveTaskType(
  taskType: string
): J10TaskType {
  switch (
    taskType
      .trim()
      .toLowerCase()
  ) {
    case "research":
      return "research";

    case "analysis":
      return "business_intelligence";

    case "writing":
      return "content_generation";

    case "planning":
      return "automation_planning";

    case "operations":
      return "business_intelligence";

    case "sales":
      return "sales_decision";

    case "general":
    default:
      return "business_intelligence";
  }
}

/*
============================================================
MODEL PREFERENCE
============================================================
*/

function resolveModelPreference(
  model: string
): J10ModelPreference {
  switch (
    model?.trim()
  ) {
    case "GPT-5.6 Sol":
      return "GPT-5.6 Sol";

    case "GPT-5.6 Terra":
      return "GPT-5.6 Terra";

    case "GPT-5.6 Luna":
      return "GPT-5.6 Luna";

    case "Automatic":
    default:
      return "Automatic";
  }
}

/*
============================================================
BUILD RUNTIME INPUT
============================================================
*/

function buildRuntimeInput({
  task,
  employee,
}: {
  task: AITaskRecord;

  employee: EmployeeRecord;
}) {
  return `
J10 NEXUS AI WORKFORCE TASK

AI EMPLOYEE

Name:
${employee.name}

Role:
${employee.role}

Department:
${employee.department}


TASK

Title:
${task.title}

Task Type:
${task.task_type}

Instructions:
${task.instructions}


SUPPLIED INPUT

${
  task.input_text?.trim() ||
  "No additional input was supplied."
}


EXECUTION RULE

Complete only the assigned task.

Do not claim external actions occurred unless
J10 NEXUS actually executed them.
`.trim();
}