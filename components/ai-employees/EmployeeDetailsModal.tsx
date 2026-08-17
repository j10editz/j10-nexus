"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardPlus,
  FileText,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import type { Employee } from "@/components/types/employee";

import SalesAgentCRMPanel from "@/components/ai-employees/SalesAgentCRMPanel";

import { createClient } from "@/lib/supabase";

/*
============================================================
PROPS
============================================================
*/

type Props = {
  employee: Employee | null;

  open: boolean;

  onClose: () => void;

  onPause: (
    employee: Employee
  ) => void;

  onResume: (
    employee: Employee
  ) => void;

  onDelete: (
    employee: Employee
  ) => void;

  onUpdate: (
    employee: Employee
  ) => void;
};

/*
============================================================
ACTIVITY
============================================================
*/

type ActivityItem = {
  id: string;

  action: string;

  entity_type: string;

  entity_id: string | null;

  title: string;

  description:
    | string
    | null;

  metadata: Record<
    string,
    unknown
  > | null;

  created_at: string;
};

/*
============================================================
AI TASK
============================================================
*/

type AITask = {
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

  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";

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

type CreateTaskResponse = {
  success: boolean;

  message?: string;

  task?: AITask;

  employee?: {
    id: string;
    name: string;
    role: string;
    status: string;
    model: string;
  };

  error?: string;
};

type TaskListResponse = {
  success: boolean;

  summary?: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };

  tasks?: AITask[];

  error?: string;
};

type RunTaskResponse = {
  success: boolean;

  message?: string;

  binding?: {
    mode: string;
    verified: boolean;
    employeeId: string;
    taskId: string;
  };

  runtime?: {
    executionMode: string;
    simulated: boolean;
    apiCalled: boolean;
    targetModel: string;
    displayModel: string;
    workload: string;
    reasoningEffort: string;
    reasoningMode: string;
    estimatedCostUSD: number;
  };

  task?: AITask;

  error?: string;
};

/*
============================================================
MAIN COMPONENT
============================================================
*/

export default function EmployeeDetailsModal({
  employee,
  open,
  onClose,
  onPause,
  onResume,
  onDelete,
  onUpdate,
}: Props) {
  const [supabase] =
    useState(() =>
      createClient()
    );

  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    viewingActivity,
    setViewingActivity,
  ] = useState(false);

  const [
    assigningTask,
    setAssigningTask,
  ] = useState(false);

  const [
    name,
    setName,
  ] = useState("");

  const [
    role,
    setRole,
  ] = useState("");

  const [
    department,
    setDepartment,
  ] = useState("");

  const [
    model,
    setModel,
  ] = useState("");

  /*
  ============================================================
  TASK FORM
  ============================================================
  */

  const [
    taskTitle,
    setTaskTitle,
  ] = useState("");

  const [
    taskType,
    setTaskType,
  ] = useState(
    "general"
  );

  const [
    taskInstructions,
    setTaskInstructions,
  ] = useState("");

  const [
    taskInput,
    setTaskInput,
  ] = useState("");

  const [
    taskSubmitting,
    setTaskSubmitting,
  ] = useState(false);

  const [
    taskError,
    setTaskError,
  ] = useState("");

  const [
    taskSuccess,
    setTaskSuccess,
  ] = useState("");

  const [
    createdTask,
    setCreatedTask,
  ] =
    useState<AITask | null>(
      null
    );

  /*
  ============================================================
  TASK LIST
  ============================================================
  */

  const [
    tasks,
    setTasks,
  ] =
    useState<AITask[]>([]);

  const [
    tasksLoading,
    setTasksLoading,
  ] = useState(false);

  const [
    tasksError,
    setTasksError,
  ] = useState("");

  const [
    runningTaskId,
    setRunningTaskId,
  ] = useState("");

  /*
  ============================================================
  ACTIVITY
  ============================================================
  */

  const [
    activity,
    setActivity,
  ] =
    useState<ActivityItem[]>(
      []
    );

  const [
    activityLoading,
    setActivityLoading,
  ] = useState(false);

  const [
    activityError,
    setActivityError,
  ] = useState("");

  const [
    activityRefreshKey,
    setActivityRefreshKey,
  ] = useState(0);

  /*
  ============================================================
  RESET
  ============================================================
  */

  useEffect(() => {
    if (!employee) {
      return;
    }

    setName(
      employee.name
    );

    setRole(
      employee.role
    );

    setDepartment(
      employee.department
    );

    setModel(
      employee.model
    );

    setEditing(false);

    setViewingActivity(
      false
    );

    setAssigningTask(
      false
    );

    setActivity([]);

    setActivityError("");

    setTasks([]);

    setTasksError("");

    setRunningTaskId("");

    setTaskTitle("");

    setTaskInstructions("");

    setTaskInput("");

    setTaskType(
      getDefaultTaskType(
        employee
      )
    );

    setTaskSubmitting(
      false
    );

    setTaskError("");

    setTaskSuccess("");

    setCreatedTask(
      null
    );
  }, [employee]);

  /*
  ============================================================
  LOAD ACTIVITY
  ============================================================
  */

  useEffect(() => {
    if (
      !employee ||
      !viewingActivity
    ) {
      return;
    }

    let cancelled =
      false;

    async function loadActivity() {
      if (!employee) {
        return;
      }

      setActivityLoading(
        true
      );

      setActivityError("");

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            "activity_logs"
          )
          .select(
            `
            id,
            action,
            entity_type,
            entity_id,
            title,
            description,
            metadata,
            created_at
            `
          )
          .eq(
            "entity_id",
            employee.id
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          )
          .limit(30);

        if (cancelled) {
          return;
        }

        if (error) {
          console.error(
            "Employee activity error:",
            error
          );

          setActivityError(
            "Could not load employee activity."
          );

          return;
        }

        setActivity(
          (data ??
            []) as ActivityItem[]
        );
      } catch (error) {
        console.error(
          "Employee activity error:",
          error
        );

        if (!cancelled) {
          setActivityError(
            "Could not load employee activity."
          );
        }
      } finally {
        if (!cancelled) {
          setActivityLoading(
            false
          );
        }
      }
    }

    void loadActivity();

    return () => {
      cancelled = true;
    };
  }, [
    employee,
    viewingActivity,
    activityRefreshKey,
    supabase,
  ]);

  /*
  ============================================================
  CLOSED
  ============================================================
  */

  if (
    !open ||
    !employee
  ) {
    return null;
  }

  /*
  ============================================================
  DETECTION
  ============================================================
  */

  const employeeIdentity =
    `${employee.name} ${employee.role} ${employee.department}`
      .toLowerCase();

  const isSalesAgent =
    employeeIdentity.includes(
      "sales"
    );

  const isResearchEmployee =
    employeeIdentity.includes(
      "research"
    );

  const isRunning =
    employee.status ===
    "Running";

  const isPaused =
    employee.status ===
    "Paused";

  /*
  ============================================================
  SAVE EDIT
  ============================================================
  */

  function saveChanges() {
    if (
      !employee ||
      !name.trim() ||
      !role.trim()
    ) {
      return;
    }

    const updatedEmployee: Employee = {
      ...employee,

      name: name.trim(),

      role: role.trim(),

      department,

      model,

      lastActive:
        "Just now",

      avatar: name
        .trim()
        .charAt(0)
        .toUpperCase(),
    };

    onUpdate(
      updatedEmployee
    );

    setEditing(false);
  }

  /*
  ============================================================
  LOAD TASKS
  ============================================================
  */

  async function loadTasks(
    currentEmployee: Employee
  ) {
    setTasksLoading(
      true
    );

    setTasksError("");

    try {
      const response =
        await fetch(
          `/api/ai-tasks?employeeId=${encodeURIComponent(
            currentEmployee.id
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const result =
        (await response.json()) as TaskListResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Could not load AI tasks."
        );
      }

      setTasks(
        result.tasks ??
          []
      );
    } catch (error) {
      console.error(
        "Load AI tasks error:",
        error
      );

      setTasksError(
        error instanceof Error
          ? error.message
          : "Could not load AI tasks."
      );
    } finally {
      setTasksLoading(
        false
      );
    }
  }

  /*
  ============================================================
  OPEN TASK WORKSPACE
  ============================================================
  */

  function openTaskWorkspace() {
    const currentEmployee =
      employee;

    if (!currentEmployee) {
      return;
    }

    setTaskError("");

    setTaskSuccess("");

    setCreatedTask(null);

    setAssigningTask(true);

    void loadTasks(
      currentEmployee
    );
  }

  /*
  ============================================================
  CREATE TASK
  ============================================================
  */

  async function createTask() {
    const currentEmployee =
      employee;

    if (
      !currentEmployee ||
      taskSubmitting
    ) {
      return;
    }

    const cleanTitle =
      taskTitle.trim();

    const cleanInstructions =
      taskInstructions.trim();

    const cleanInput =
      taskInput.trim();

    if (!cleanTitle) {
      setTaskError(
        "Task title is required."
      );

      return;
    }

    if (
      !cleanInstructions
    ) {
      setTaskError(
        "Task instructions are required."
      );

      return;
    }

    setTaskSubmitting(
      true
    );

    setTaskError("");

    setTaskSuccess("");

    setCreatedTask(null);

    try {
      const response =
        await fetch(
          "/api/ai-tasks",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                employeeId:
                  currentEmployee.id,

                title:
                  cleanTitle,

                taskType,

                instructions:
                  cleanInstructions,

                inputText:
                  cleanInput,
              }),
          }
        );

      const result =
        (await response.json()) as CreateTaskResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "Could not create the AI task."
        );
      }

      if (
        result.employee &&
        result.employee.id !==
          currentEmployee.id
      ) {
        throw new Error(
          "J10 NEXUS blocked an AI employee task-binding mismatch."
        );
      }

      if (!result.task) {
        throw new Error(
          "Task was created but J10 NEXUS did not receive the task record."
        );
      }

      setCreatedTask(
        result.task
      );

      setTaskSuccess(
        `Task assigned to ${currentEmployee.name}.`
      );

      setTaskTitle("");

      setTaskInstructions("");

      setTaskInput("");

      setActivityRefreshKey(
        (current) =>
          current + 1
      );

      await loadTasks(
        currentEmployee
      );
    } catch (error) {
      console.error(
        "Create AI task error:",
        error
      );

      setTaskError(
        error instanceof Error
          ? error.message
          : "J10 NEXUS could not create the AI task."
      );
    } finally {
      setTaskSubmitting(
        false
      );
    }
  }

  /*
  ============================================================
  RUN TASK
  ============================================================
  */

  async function runTask(
    taskId: string
  ) {
    const currentEmployee =
      employee;

    if (
      !currentEmployee ||
      runningTaskId
    ) {
      return;
    }

    setRunningTaskId(
      taskId
    );

    setTaskError("");

    setTaskSuccess("");

    try {
      const response =
        await fetch(
          `/api/ai-tasks/${encodeURIComponent(
            taskId
          )}/run`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );

      const result =
        (await response.json()) as RunTaskResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ||
            "J10 NEXUS could not execute the task."
        );
      }

      if (
        result.binding &&
        result.binding.employeeId !==
          currentEmployee.id
      ) {
        throw new Error(
          "J10 NEXUS blocked an AI employee execution mismatch."
        );
      }

      if (!result.task) {
        throw new Error(
          "Task execution completed but no task result was returned."
        );
      }

      setCreatedTask(
        result.task
      );

      setTaskSuccess(
        `${currentEmployee.name} completed the task.`
      );

      setActivityRefreshKey(
        (current) =>
          current + 1
      );

      await loadTasks(
        currentEmployee
      );
    } catch (error) {
      console.error(
        "Run AI task error:",
        error
      );

      setTaskError(
        error instanceof Error
          ? error.message
          : "J10 NEXUS could not execute the AI task."
      );

      await loadTasks(
        currentEmployee
      );
    } finally {
      setRunningTaskId("");
    }
  }

  /*
  ============================================================
  ACTIVITY VIEW
  ============================================================
  */

  if (viewingActivity) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
        <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">
          <div className="sticky top-0 z-20 flex items-start justify-between border-b border-white/10 bg-[#0b0b0e]/95 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() =>
                  setViewingActivity(
                    false
                  )
                }
                className="mt-1 rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
              >
                <ArrowLeft
                  size={18}
                />
              </button>

              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-violet-400">
                  J10 NEXUS WORKFORCE
                </p>

                <h2 className="mt-2 text-2xl font-bold text-white">
                  Employee Activity
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {employee.name}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">
                  Activity History
                </h3>

                <p className="mt-1 text-xs text-zinc-600">
                  Recorded actions performed by this employee.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setActivityRefreshKey(
                    (current) =>
                      current + 1
                  )
                }
                disabled={
                  activityLoading
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 transition hover:text-white disabled:opacity-40"
              >
                <RefreshCw
                  size={15}
                  className={
                    activityLoading
                      ? "animate-spin"
                      : ""
                  }
                />
              </button>
            </div>

            {activityError && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                {activityError}
              </div>
            )}

            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(
                  (item) => (
                    <div
                      key={item}
                      className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
                    />
                  )
                )}
              </div>
            ) : activity.length ===
              0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] px-6 py-14 text-center">
                <Activity
                  size={22}
                  className="mx-auto text-zinc-700"
                />

                <p className="mt-4 text-sm text-zinc-500">
                  No activity recorded yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map(
                  (item) => (
                    <ActivityRow
                      key={item.id}
                      item={item}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /*
  ============================================================
  TASK WORKSPACE
  ============================================================
  */

  if (assigningTask) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
        <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">
          {/* HEADER */}

          <div className="sticky top-0 z-30 flex items-start justify-between border-b border-white/10 bg-[#0b0b0e]/95 p-6 backdrop-blur">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() =>
                  setAssigningTask(
                    false
                  )
                }
                className="mt-1 rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
              >
                <ArrowLeft
                  size={18}
                />
              </button>

              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-violet-400">
                  J10 NEXUS WORKFORCE
                </p>

                <h2 className="mt-2 text-2xl font-bold text-white">
                  Task Workspace
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {employee.name} Â·{" "}
                  {employee.role}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-6 p-6">
            {/* EXACT EMPLOYEE */}

            <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.05] p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={17}
                  className="mt-0.5 shrink-0 text-violet-400"
                />

                <div>
                  <p className="text-sm font-medium text-white">
                    Exact Employee Binding
                  </p>

                  <p className="mt-1 text-xs text-zinc-500">
                    Tasks in this workspace
                    belong only to{" "}
                    {employee.name}.
                  </p>

                  <p className="mt-2 break-all text-[10px] text-zinc-700">
                    {employee.id}
                  </p>
                </div>
              </div>
            </div>

            {/* TASK LIST */}

            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-400">
                    Assigned Work
                  </p>

                  <h3 className="mt-1 text-lg font-semibold text-white">
                    Employee Tasks
                  </h3>
                </div>

                <button
                  type="button"
                  disabled={
                    tasksLoading
                  }
                  onClick={() =>
                    void loadTasks(
                      employee
                    )
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 transition hover:text-white disabled:opacity-40"
                >
                  <RefreshCw
                    size={15}
                    className={
                      tasksLoading
                        ? "animate-spin"
                        : ""
                    }
                  />
                </button>
              </div>

              {tasksError && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                  {tasksError}
                </div>
              )}

              {tasksLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(
                    (item) => (
                      <div
                        key={item}
                        className="h-32 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02]"
                      />
                    )
                  )}
                </div>
              ) : tasks.length ===
                0 ? (
                <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center">
                  <FileText
                    size={20}
                    className="mx-auto text-zinc-700"
                  />

                  <p className="mt-3 text-sm text-zinc-500">
                    No tasks assigned yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map(
                    (task) => (
                      <TaskCard
                        key={
                          task.id
                        }
                        task={
                          task
                        }
                        running={
                          runningTaskId ===
                          task.id
                        }
                        executionBusy={
                          Boolean(
                            runningTaskId
                          )
                        }
                        employeeRunning={
                          isRunning
                        }
                        onRun={() =>
                          void runTask(
                            task.id
                          )
                        }
                      />
                    )
                  )}
                </div>
              )}
            </div>

            {/* CREATE TASK */}

            <div className="border-t border-white/[0.07] pt-6">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-400">
                  New Assignment
                </p>

                <h3 className="mt-1 text-lg font-semibold text-white">
                  Assign New Task
                </h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <InfoBox
                  label="Initial Status"
                  value="Pending"
                />

                <InfoBox
                  label="Execution"
                  value="Manual Run"
                />

                <InfoBox
                  label="Development Cost"
                  value="$0"
                />
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Task Title
                  </label>

                  <input
                    value={
                      taskTitle
                    }
                    onChange={(
                      event
                    ) => {
                      setTaskTitle(
                        event
                          .target
                          .value
                      );

                      if (
                        taskError
                      ) {
                        setTaskError(
                          ""
                        );
                      }
                    }}
                    placeholder="Example: Research J10 NEXUS competitors"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Task Type
                  </label>

                  <select
                    value={
                      taskType
                    }
                    onChange={(
                      event
                    ) =>
                      setTaskType(
                        event
                          .target
                          .value
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
                  >
                    <option value="general">
                      General
                    </option>

                    <option value="research">
                      Research
                    </option>

                    <option value="analysis">
                      Analysis
                    </option>

                    <option value="writing">
                      Writing
                    </option>

                    <option value="planning">
                      Planning
                    </option>

                    <option value="operations">
                      Operations
                    </option>

                    <option value="sales">
                      Sales
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Task Instructions
                  </label>

                  <textarea
                    value={
                      taskInstructions
                    }
                    onChange={(
                      event
                    ) => {
                      setTaskInstructions(
                        event
                          .target
                          .value
                      );

                      if (
                        taskError
                      ) {
                        setTaskError(
                          ""
                        );
                      }
                    }}
                    rows={5}
                    placeholder="Explain exactly what this employee should do..."
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Optional Input
                  </label>

                  <textarea
                    value={
                      taskInput
                    }
                    onChange={(
                      event
                    ) =>
                      setTaskInput(
                        event
                          .target
                          .value
                      )
                    }
                    rows={4}
                    placeholder="Paste data, notes, context or other information..."
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-500"
                  />
                </div>
              </div>
            </div>

            {/* ERROR */}

            {taskError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {taskError}
              </div>
            )}

            {/* SUCCESS */}

            {taskSuccess &&
              createdTask && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      size={17}
                      className="mt-0.5 shrink-0 text-emerald-400"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-emerald-400">
                        {taskSuccess}
                      </p>

                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        <TaskResultItem
                          label="Status"
                          value={
                            createdTask.status
                          }
                        />

                        <TaskResultItem
                          label="Mode"
                          value={
                            createdTask.execution_mode
                          }
                        />

                        <TaskResultItem
                          label="API"
                          value={
                            createdTask.api_called
                              ? "Called"
                              : "Not Called"
                          }
                        />

                        <TaskResultItem
                          label="Cost"
                          value={`$${Number(
                            createdTask.estimated_cost_usd ??
                              0
                          )}`}
                        />
                      </div>

                      {createdTask.result_text && (
                        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                            Task Result
                          </p>

                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                            {
                              createdTask.result_text
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* CREATE BUTTON */}

            <div className="flex justify-end border-t border-white/[0.07] pt-5">
              <button
                type="button"
                disabled={
                  taskSubmitting
                }
                onClick={() =>
                  void createTask()
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {taskSubmitting ? (
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <Send
                    size={16}
                  />
                )}

                {taskSubmitting
                  ? "Creating Task..."
                  : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /*
  ============================================================
  MAIN EMPLOYEE MODAL
  ============================================================
  */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl ${
          isSalesAgent
            ? "max-w-6xl"
            : "max-w-xl"
        }`}
      >
        <div className="sticky top-0 z-30 flex items-start justify-between border-b border-white/10 bg-[#0b0b0e]/95 p-6 backdrop-blur">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <Bot size={19} />
            </div>

            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-violet-400">
                J10 NEXUS WORKFORCE
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-white">
                  {employee.name}
                </h2>

                {isSalesAgent && (
                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet-400">
                    CRM Access
                  </span>
                )}

                {isResearchEmployee && (
                  <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-blue-400">
                    Research
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-zinc-500">
                {employee.role}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {editing ? (
          <div className="space-y-4 p-6">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Employee Name
              </label>

              <input
                value={name}
                onChange={(
                  event
                ) =>
                  setName(
                    event
                      .target
                      .value
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Role
              </label>

              <input
                value={role}
                onChange={(
                  event
                ) =>
                  setRole(
                    event
                      .target
                      .value
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Department
                </label>

                <select
                  value={
                    department
                  }
                  onChange={(
                    event
                  ) =>
                    setDepartment(
                      event
                        .target
                        .value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
                >
                  <option>Sales</option>
                  <option>Revenue</option>
                  <option>Customer Support</option>
                  <option>Human Resources</option>
                  <option>HR</option>
                  <option>Marketing</option>
                  <option>Finance</option>
                  <option>Operations</option>
                  <option>Research</option>
                  <option>Legal</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  AI Model
                </label>

                <select
                  value={model}
                  onChange={(
                    event
                  ) =>
                    setModel(
                      event
                        .target
                        .value
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
                >
                  <option>Automatic</option>
                  <option>GPT-5.6 Sol</option>
                  <option>GPT-5.6 Terra</option>
                  <option>GPT-5.6 Luna</option>
                  <option>GPT-5</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() =>
                  setEditing(false)
                }
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  saveChanges
                }
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
              >
                <Save size={16} />
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`grid gap-4 p-6 ${
                isSalesAgent
                  ? "sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-2"
              }`}
            >
              <InfoBox
                label="Department"
                value={
                  employee.department
                }
              />

              <InfoBox
                label="AI Model"
                value={
                  employee.model
                }
              />

              <InfoBox
                label="Status"
                value={
                  employee.status
                }
              />

              <InfoBox
                label="Tasks Completed"
                value={String(
                  employee.tasksCompleted
                )}
              />

              <InfoBox
                label="Revenue"
                value={`$${employee.revenueGenerated.toLocaleString()}`}
              />

              <InfoBox
                label="Last Active"
                value={
                  employee.lastActive
                }
              />
            </div>

            <div className="border-t border-white/10 p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Employee Controls
              </p>

              <div
                className={`grid gap-3 ${
                  isSalesAgent
                    ? "sm:grid-cols-2 lg:grid-cols-5"
                    : "grid-cols-2"
                }`}
              >
                <ActionButton
                  icon={
                    <ClipboardPlus
                      size={16}
                    />
                  }
                  label="Task Workspace"
                  onClick={
                    openTaskWorkspace
                  }
                />

                <ActionButton
                  icon={
                    <Pause
                      size={16}
                    />
                  }
                  label="Pause Employee"
                  disabled={
                    !isRunning
                  }
                  onClick={() =>
                    onPause(
                      employee
                    )
                  }
                />

                <ActionButton
                  icon={
                    <Play
                      size={16}
                    />
                  }
                  label="Resume Employee"
                  disabled={
                    !isPaused
                  }
                  onClick={() =>
                    onResume(
                      employee
                    )
                  }
                />

                <ActionButton
                  icon={
                    <Pencil
                      size={16}
                    />
                  }
                  label="Edit Employee"
                  onClick={() =>
                    setEditing(true)
                  }
                />

                <ActionButton
                  icon={
                    <Activity
                      size={16}
                    />
                  }
                  label="View Activity"
                  onClick={() =>
                    setViewingActivity(
                      true
                    )
                  }
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  onDelete(
                    employee
                  )
                }
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
              >
                <Trash2
                  size={16}
                />

                Delete Employee
              </button>
            </div>

            {isSalesAgent && (
              <div className="border-t border-white/[0.07] p-6">
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                    SALES INTELLIGENCE
                  </p>

                  <h3 className="mt-2 text-xl font-semibold text-white">
                    CRM Execution Workspace
                  </h3>

                  <p className="mt-1 text-sm text-zinc-600">
                    Controlled CRM access for this exact AI Sales Agent.
                  </p>
                </div>

                <SalesAgentCRMPanel
                  employeeId={
                    employee.id
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/*
============================================================
TASK CARD
============================================================
*/

function TaskCard({
  task,
  running,
  executionBusy,
  employeeRunning,
  onRun,
}: {
  task: AITask;

  running: boolean;

  executionBusy: boolean;

  employeeRunning: boolean;

  onRun: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">
              {task.title}
            </p>

            <TaskStatusBadge
              status={
                task.status
              }
            />
          </div>

          <p className="mt-1 text-xs capitalize text-zinc-600">
            {task.task_type}
          </p>
        </div>

        {task.status ===
          "pending" && (
          <button
            type="button"
            disabled={
              executionBusy ||
              !employeeRunning
            }
            onClick={
              onRun
            }
            className="flex items-center justify-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? (
              <RefreshCw
                size={14}
                className="animate-spin"
              />
            ) : (
              <Zap size={14} />
            )}

            {running
              ? "Running..."
              : "Run Task"}
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <TaskResultItem
          label="Mode"
          value={
            task.execution_mode
          }
        />

        <TaskResultItem
          label="API"
          value={
            task.api_called
              ? "Called"
              : "Not Called"
          }
        />

        <TaskResultItem
          label="Model"
          value={
            task.display_model ||
            "Not Run"
          }
        />

        <TaskResultItem
          label="Cost"
          value={`$${Number(
            task.estimated_cost_usd ??
              0
          )}`}
        />
      </div>

      {task.result_text && (
        <div className="mt-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.04] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-500">
            Result
          </p>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
            {task.result_text}
          </p>
        </div>
      )}

      {task.error_message && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.07] p-4 text-xs text-red-400">
          {task.error_message}
        </div>
      )}
    </div>
  );
}

/*
============================================================
TASK STATUS
============================================================
*/

function TaskStatusBadge({
  status,
}: {
  status: AITask["status"];
}) {
  const styles: Record<
    AITask["status"],
    string
  > = {
    pending:
      "border-amber-500/20 bg-amber-500/10 text-amber-400",

    running:
      "border-blue-500/20 bg-blue-500/10 text-blue-400",

    completed:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",

    failed:
      "border-red-500/20 bg-red-500/10 text-red-400",

    cancelled:
      "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
  };

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/*
============================================================
DEFAULT TASK TYPE
============================================================
*/

function getDefaultTaskType(
  employee: Employee
) {
  const identity =
    `${employee.name} ${employee.role} ${employee.department}`
      .toLowerCase();

  if (
    identity.includes(
      "research"
    )
  ) {
    return "research";
  }

  if (
    identity.includes(
      "sales"
    )
  ) {
    return "sales";
  }

  if (
    identity.includes(
      "marketing"
    )
  ) {
    return "analysis";
  }

  if (
    identity.includes(
      "operations"
    )
  ) {
    return "operations";
  }

  return "general";
}

/*
============================================================
TASK RESULT ITEM
============================================================
*/

function TaskResultItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-zinc-700">
        {label}
      </p>

      <p className="mt-1 break-words text-xs font-medium text-zinc-300">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
INFO BOX
============================================================
*/

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-zinc-500">
        {label}
      </p>

      <p className="mt-1 break-words font-medium text-white">
        {value}
      </p>
    </div>
  );
}

/*
============================================================
ACTION BUTTON
============================================================
*/

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;

  label: string;

  onClick: () => void;

  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {icon}

      {label}
    </button>
  );
}

/*
============================================================
ACTIVITY ROW
============================================================
*/

function ActivityRow({
  item,
}: {
  item: ActivityItem;
}) {
  const {
    icon,
    iconClass,
  } =
    getActivityAppearance(
      item.action
    );

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] ${iconClass}`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">
          {item.title}
        </p>

        {item.description && (
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {
              item.description
            }
          </p>
        )}

        <p className="mt-2 text-[10px] text-zinc-700">
          {formatRelativeTime(
            item.created_at
          )}
        </p>
      </div>
    </div>
  );
}

/*
============================================================
ACTIVITY ICON
============================================================
*/

function getActivityAppearance(
  action: string
) {
  const normalized =
    action.toLowerCase();

  if (
    normalized.includes(
      "task"
    )
  ) {
    return {
      icon: (
        <FileText
          size={15}
        />
      ),

      iconClass:
        "text-violet-400",
    };
  }

  if (
    normalized.includes(
      "paused"
    )
  ) {
    return {
      icon: (
        <Pause size={15} />
      ),

      iconClass:
        "text-amber-400",
    };
  }

  if (
    normalized.includes(
      "resumed"
    ) ||
    normalized.includes(
      "started"
    )
  ) {
    return {
      icon: (
        <Play size={15} />
      ),

      iconClass:
        "text-emerald-400",
    };
  }

  if (
    normalized.includes(
      "deleted"
    )
  ) {
    return {
      icon: (
        <Trash2
          size={15}
        />
      ),

      iconClass:
        "text-red-400",
    };
  }

  if (
    normalized.includes(
      "edited"
    ) ||
    normalized.includes(
      "updated"
    )
  ) {
    return {
      icon: (
        <Pencil
          size={15}
        />
      ),

      iconClass:
        "text-violet-400",
    };
  }

  if (
    normalized.includes(
      "sales"
    )
  ) {
    return {
      icon: (
        <CheckCircle2
          size={15}
        />
      ),

      iconClass:
        "text-blue-400",
    };
  }

  return {
    icon: (
      <Activity
        size={15}
      />
    ),

    iconClass:
      "text-zinc-400",
  };
}

/*
============================================================
RELATIVE TIME
============================================================
*/

function formatRelativeTime(
  value: string
) {
  const date =
    new Date(value);

  const difference =
    Date.now() -
    date.getTime();

  if (
    Number.isNaN(
      difference
    )
  ) {
    return "";
  }

  const seconds =
    Math.floor(
      difference / 1000
    );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `${minutes} ${
      minutes === 1
        ? "minute"
        : "minutes"
    } ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    } ago`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  return `${days} ${
    days === 1
      ? "day"
      : "days"
  } ago`;
}