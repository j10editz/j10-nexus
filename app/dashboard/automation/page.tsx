"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Edit3,
  GitBranch,
  History,
  ListChecks,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Workflow,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import WorkflowReadinessPanel from "@/components/automation/WorkflowReadinessPanel";

type WorkflowStatus =
  | "Draft"
  | "Running"
  | "Paused"
  | "Error";

type WorkflowAction = {
  order: number;
  type: string;
  label: string;
  config?: Record<string, unknown>;
};

type WorkflowItem = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: unknown[];
  runs_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type AutomationResponse = {
  success: boolean;
  workflows?: WorkflowItem[];
  workflow?: WorkflowItem;
  message?: string;
  error?: string;
};

type RunStatus =
  | "Running"
  | "Completed"
  | "Blocked"
  | "Failed";

type StepStatus =
  | "Pending"
  | "Running"
  | "Completed"
  | "Blocked"
  | "Skipped"
  | "Failed";

type WorkflowRunStep = {
  id: string;
  run_id: string;
  workflow_id: string;
  user_id: string;
  step_order: number;
  action_type: string;
  action_label: string;
  status: StepStatus;
  output: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type WorkflowRun = {
  id: string;
  workflow_id: string;
  user_id: string;
  status: RunStatus;
  trigger_type: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  steps: WorkflowRunStep[];
};

type RunSummary = {
  total: number;
  completed: number;
  blocked: number;
  failed: number;
  running: number;
};

type RunsResponse = {
  success: boolean;

  runs?: WorkflowRun[];

  latestExecution?:
    | WorkflowRun
    | null;

  summary?: RunSummary;

  error?: string;
};

const statusOptions = [
  "All",
  "Draft",
  "Running",
  "Paused",
  "Error",
];

export default function AutomationPage() {
  const [workflows, setWorkflows] =
    useState<WorkflowItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [search, setSearch] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("All");

  const [
    createOpen,
    setCreateOpen,
  ] = useState(false);

  const [
    selectedWorkflow,
    setSelectedWorkflow,
  ] =
    useState<WorkflowItem | null>(
      null
    );

  const [name, setName] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    triggerType,
    setTriggerType,
  ] = useState("Manual");

  const [
    creating,
    setCreating,
  ] = useState(false);

  async function loadWorkflows() {
    setLoading(true);
    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/automation",
          {
            method: "GET",
            cache: "no-store",
          }
        );

      const data =
        (await response.json()) as AutomationResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not load workflows."
        );
      }

      setWorkflows(
        data.workflows ?? []
      );
    } catch (error) {
      console.error(
        "Automation load error:",
        error
      );

      setErrorMessage(
        "Could not load workflows."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkflows();
  }, []);

  const filteredWorkflows =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return workflows.filter(
        (workflow) => {
          const matchesSearch =
            workflow.name
              .toLowerCase()
              .includes(query) ||
            (
              workflow.description ??
              ""
            )
              .toLowerCase()
              .includes(query) ||
            workflow.trigger_type
              .toLowerCase()
              .includes(query);

          const matchesStatus =
            statusFilter ===
              "All" ||
            workflow.status ===
              statusFilter;

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      workflows,
      search,
      statusFilter,
    ]);

  const stats = useMemo(() => {
    const total =
      workflows.length;

    const running =
      workflows.filter(
        (workflow) =>
          workflow.status ===
          "Running"
      ).length;

    const paused =
      workflows.filter(
        (workflow) =>
          workflow.status ===
          "Paused"
      ).length;

    const runs =
      workflows.reduce(
        (
          totalRuns,
          workflow
        ) =>
          totalRuns +
          Number(
            workflow.runs_count ??
              0
          ),
        0
      );

    return {
      total,
      running,
      paused,
      runs,
    };
  }, [workflows]);

  async function createWorkflow() {
    const cleanName =
      name.trim();

    if (
      !cleanName ||
      creating
    ) {
      return;
    }

    setCreating(true);
    setErrorMessage("");

    try {
      const response =
        await fetch(
          "/api/automation",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              name: cleanName,

              description:
                description.trim(),

              triggerType,

              triggerConfig: {},

              actions: [],
            }),
          }
        );

      const data =
        (await response.json()) as AutomationResponse;

      if (
        !response.ok ||
        !data.success ||
        !data.workflow
      ) {
        throw new Error(
          data.error ||
            "Could not create workflow."
        );
      }

      setWorkflows(
        (current) => [
          data.workflow!,
          ...current,
        ]
      );

      setName("");
      setDescription("");
      setTriggerType(
        "Manual"
      );
      setCreateOpen(false);
    } catch (error) {
      console.error(
        "Workflow creation error:",
        error
      );

      setErrorMessage(
        "Could not create workflow."
      );
    } finally {
      setCreating(false);
    }
  }

  function updateWorkflowInState(
    workflow: WorkflowItem
  ) {
    setWorkflows(
      (current) =>
        current.map(
          (item) =>
            item.id ===
            workflow.id
              ? workflow
              : item
        )
    );

    setSelectedWorkflow(
      workflow
    );
  }

  function removeWorkflowFromState(
    workflowId: string
  ) {
    setWorkflows(
      (current) =>
        current.filter(
          (item) =>
            item.id !==
            workflowId
        )
    );

    setSelectedWorkflow(null);
  }

  return (
    <div className="min-h-full bg-[#09090B] text-white">
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              Automation Hub
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Business Automation
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Build, manage and
              monitor intelligent
              workflows across your
              business.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setCreateOpen(true)
            }
            className="group flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-zinc-200"
          >
            <Plus size={16} />

            New Workflow

            <ChevronRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Workflows"
            value={
              loading
                ? "..."
                : String(
                    stats.total
                  )
            }
            icon={Workflow}
          />

          <StatCard
            label="Running"
            value={
              loading
                ? "..."
                : String(
                    stats.running
                  )
            }
            icon={Play}
            accent="running"
          />

          <StatCard
            label="Paused"
            value={
              loading
                ? "..."
                : String(
                    stats.paused
                  )
            }
            icon={Pause}
            accent="paused"
          />

          <StatCard
            label="Total Runs"
            value={
              loading
                ? "..."
                : stats.runs.toLocaleString()
            }
            icon={Activity}
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search workflows..."
              className="w-full rounded-xl border border-white/[0.07] bg-[#111216] py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-blue-500/30"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
              className="rounded-xl border border-white/[0.07] bg-[#111216] px-4 py-3 text-sm text-zinc-300 outline-none"
            >
              {statusOptions.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status === "All"
                      ? "All Statuses"
                      : status}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              onClick={
                loadWorkflows
              }
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-[#111216] text-zinc-500 transition-all hover:border-blue-500/20 hover:text-blue-400"
            >
              <RefreshCw
                size={16}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map(
                (item) => (
                  <div
                    key={item}
                    className="h-[260px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]"
                  />
                )
              )}
            </div>
          ) : filteredWorkflows.length ===
            0 ? (
            <EmptyState
              onCreate={() =>
                setCreateOpen(
                  true
                )
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredWorkflows.map(
                (
                  workflow
                ) => (
                  <WorkflowCard
                    key={
                      workflow.id
                    }
                    workflow={
                      workflow
                    }
                    onManage={() =>
                      setSelectedWorkflow(
                        workflow
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateWorkflowModal
          name={name}
          description={
            description
          }
          triggerType={
            triggerType
          }
          creating={creating}
          onNameChange={
            setName
          }
          onDescriptionChange={
            setDescription
          }
          onTriggerTypeChange={
            setTriggerType
          }
          onCreate={
            createWorkflow
          }
          onClose={() =>
            setCreateOpen(false)
          }
        />
      )}

      {selectedWorkflow && (
        <ManageWorkflowModal
          workflow={
            selectedWorkflow
          }
          onClose={() =>
            setSelectedWorkflow(
              null
            )
          }
          onUpdate={
            updateWorkflowInState
          }
          onDelete={
            removeWorkflowFromState
          }
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent = "default",
}: {
  label: string;
  value: string;
  icon: typeof Workflow;
  accent?:
    | "default"
    | "running"
    | "paused";
}) {
  const iconStyles = {
    default:
      "bg-blue-500/10 text-blue-400",

    running:
      "bg-emerald-500/10 text-emerald-400",

    paused:
      "bg-amber-500/10 text-amber-400",
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-5">
      <div className="flex items-center justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconStyles[accent]}`}
        >
          <Icon size={17} />
        </div>

        <MoreHorizontal
          size={17}
          className="text-zinc-700"
        />
      </div>

      <p className="mt-5 text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onManage,
}: {
  workflow: WorkflowItem;
  onManage: () => void;
}) {
  const statusStyles: Record<
    WorkflowStatus,
    string
  > = {
    Draft:
      "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",

    Running:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",

    Paused:
      "border-amber-500/20 bg-amber-500/10 text-amber-400",

    Error:
      "border-red-500/20 bg-red-500/10 text-red-400",
  };

  const StatusIcon =
    workflow.status ===
    "Running"
      ? Play
      : workflow.status ===
          "Paused"
        ? Pause
        : workflow.status ===
            "Error"
          ? XCircle
          : Clock3;

  const actions =
    getWorkflowActions(
      workflow.actions
    );

  return (
    <div className="group rounded-2xl border border-white/[0.07] bg-[#111216] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/20 hover:bg-[#14161b]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-gradient-to-br from-blue-500/10 to-violet-500/10">
          <Workflow
            size={18}
            className="text-blue-400"
          />
        </div>

        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusStyles[workflow.status]}`}
        >
          <StatusIcon
            size={11}
          />

          {workflow.status}
        </span>
      </div>

      <h2 className="mt-5 text-base font-semibold text-white">
        {workflow.name}
      </h2>

      <p className="mt-2 min-h-[40px] text-sm leading-5 text-zinc-500">
        {workflow.description ||
          "No description provided."}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <InfoBox
          label="Trigger"
          value={
            workflow.trigger_type
          }
        />

        <InfoBox
          label="Steps"
          value={String(
            actions.length
          )}
        />

        <InfoBox
          label="Runs"
          value={String(
            workflow.runs_count
          )}
        />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
        <div>
          <p className="text-[10px] text-zinc-600">
            Last run
          </p>

          <p className="mt-1 text-xs text-zinc-400">
            {formatLastRun(
              workflow.last_run_at
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onManage}
          className="group/button flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-zinc-400 transition-all hover:border-blue-500/20 hover:bg-blue-500/10 hover:text-blue-400"
        >
          Manage

          <ChevronRight
            size={13}
            className="transition-transform group-hover/button:translate-x-0.5"
          />
        </button>
      </div>
    </div>
  );
}

function ManageWorkflowModal({
  workflow,
  onClose,
  onUpdate,
  onDelete,
}: {
  workflow: WorkflowItem;

  onClose: () => void;

  onUpdate: (
    workflow: WorkflowItem
  ) => void;

  onDelete: (
    workflowId: string
  ) => void;
}) {
  const [
    actionLoading,
    setActionLoading,
  ] = useState("");

  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    editName,
    setEditName,
  ] = useState(
    workflow.name
  );

  const [
    editDescription,
    setEditDescription,
  ] = useState(
    workflow.description ?? ""
  );

  const [
    editTriggerType,
    setEditTriggerType,
  ] = useState(
    workflow.trigger_type
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    runsLoading,
    setRunsLoading,
  ] = useState(true);

  const [
    runsError,
    setRunsError,
  ] = useState("");

  const [
    runs,
    setRuns,
  ] = useState<WorkflowRun[]>(
    []
  );

  const [
    latestExecution,
    setLatestExecution,
  ] =
    useState<WorkflowRun | null>(
      null
    );

  const [
    runSummary,
    setRunSummary,
  ] = useState<RunSummary>({
    total: 0,
    completed: 0,
    blocked: 0,
    failed: 0,
    running: 0,
  });

  const actions =
    getWorkflowActions(
      workflow.actions
    );

  const triggerLabel =
    getTriggerLabel(
      workflow.trigger_type,
      workflow.trigger_config
    );

  const loadExecutionHistory =
    useCallback(async () => {
      setRunsLoading(true);
      setRunsError("");

      try {
        const response =
          await fetch(
            `/api/automation/${workflow.id}/runs`,
            {
              method: "GET",
              cache:
                "no-store",
            }
          );

        const data =
          (await response.json()) as RunsResponse;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.error ||
              "Could not load workflow executions."
          );
        }

        setRuns(
          data.runs ?? []
        );

        setLatestExecution(
          data.latestExecution ??
            null
        );

        setRunSummary(
          data.summary ?? {
            total: 0,
            completed: 0,
            blocked: 0,
            failed: 0,
            running: 0,
          }
        );
      } catch (error) {
        console.error(
          "Run history error:",
          error
        );

        setRunsError(
          "Could not load execution history."
        );
      } finally {
        setRunsLoading(false);
      }
    }, [workflow.id]);

  useEffect(() => {
    void loadExecutionHistory();
  }, [loadExecutionHistory]);

  async function performAction(
    action:
      | "start"
      | "pause"
      | "resume"
      | "run"
      | "update"
  ) {
    if (actionLoading) {
      return;
    }

    setActionLoading(
      action
    );

    setErrorMessage("");

    try {
      const body: Record<
        string,
        unknown
      > = {
        action,
      };

      if (
        action === "update"
      ) {
        body.name =
          editName.trim();

        body.description =
          editDescription.trim();

        body.triggerType =
          editTriggerType;
      }

      const response =
        await fetch(
          `/api/automation/${workflow.id}`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(
              body
            ),
          }
        );

      const data =
        (await response.json()) as AutomationResponse;

      if (
        !response.ok ||
        !data.success ||
        !data.workflow
      ) {
        throw new Error(
          data.error ||
            "Could not update workflow."
        );
      }

      onUpdate(
        data.workflow
      );

      if (
        action === "update"
      ) {
        setEditing(false);
      }

      if (
        action === "run"
      ) {
        await loadExecutionHistory();
      }
    } catch (error) {
      console.error(
        "Workflow action error:",
        error
      );

      setErrorMessage(
        "Could not update workflow."
      );
    } finally {
      setActionLoading("");
    }
  }

  async function deleteWorkflow() {
    if (actionLoading) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete ${workflow.name}?`
      );

    if (!confirmed) {
      return;
    }

    setActionLoading(
      "delete"
    );

    setErrorMessage("");

    try {
      const response =
        await fetch(
          `/api/automation/${workflow.id}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        (await response.json()) as AutomationResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not delete workflow."
        );
      }

      onDelete(
        workflow.id
      );
    } catch (error) {
      console.error(
        "Workflow delete error:",
        error
      );

      setErrorMessage(
        "Could not delete workflow."
      );
    } finally {
      setActionLoading("");
    }
  }

  const isRunning =
    workflow.status ===
    "Running";

  const isPaused =
    workflow.status ===
    "Paused";

  const canStart =
    workflow.status ===
      "Draft" ||
    workflow.status ===
      "Error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0e] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/[0.07] bg-[#0b0b0e]/95 p-6 backdrop-blur-xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
              Automation Control
            </p>

            <h2 className="mt-2 text-xl font-semibold text-white">
              {workflow.name}
            </h2>

            <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
              {workflow.description ||
                "Manage workflow configuration and execution."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        {editing ? (
          <div className="space-y-4 p-6">
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Workflow Name
              </label>

              <input
                value={
                  editName
                }
                onChange={(event) =>
                  setEditName(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/50"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Description
              </label>

              <textarea
                rows={3}
                value={
                  editDescription
                }
                onChange={(event) =>
                  setEditDescription(
                    event.target.value
                  )
                }
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none focus:border-violet-500/50"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Trigger
              </label>

              <select
                value={
                  editTriggerType
                }
                onChange={(event) =>
                  setEditTriggerType(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3 text-sm text-white outline-none"
              >
                <option value="Manual">
                  Manual
                </option>

                <option value="Schedule">
                  Schedule
                </option>

                <option value="Webhook">
                  Webhook
                </option>

                <option value="Event">
                  Event
                </option>

                <option value="AI">
                  AI Decision
                </option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() =>
                  setEditing(false)
                }
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.05]"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  !editName.trim() ||
                  actionLoading ===
                    "update"
                }
                onClick={() =>
                  performAction(
                    "update"
                  )
                }
                className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-40"
              >
                <Save
                  size={15}
                />

                {actionLoading ===
                "update"
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <InfoBox
                label="Status"
                value={
                  workflow.status
                }
              />

              <InfoBox
                label="Trigger"
                value={
                  workflow.trigger_type
                }
              />

              <InfoBox
                label="Total Runs"
                value={String(
                  workflow.runs_count
                )}
              />

              <InfoBox
                label="Last Run"
                value={formatLastRun(
                  workflow.last_run_at
                )}
              />
            </div>

            {/* WORKFLOW ARCHITECTURE */}
            <div className="border-t border-white/[0.07] px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
                  <GitBranch
                    size={16}
                    className="text-violet-400"
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold text-white">
                    Workflow Architecture
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    The real trigger
                    and execution steps
                    stored for this
                    automation.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                    <CircleDot
                      size={15}
                      className="text-blue-400"
                    />
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400">
                      Trigger
                    </p>

                    <p className="mt-1 text-sm font-medium text-zinc-200">
                      {triggerLabel}
                    </p>

                    <p className="mt-1 text-xs text-zinc-600">
                      {
                        workflow.trigger_type
                      }
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Workflow Steps
                    </p>

                    <p className="mt-1 text-xs text-zinc-700">
                      {actions.length}{" "}
                      {actions.length ===
                      1
                        ? "action"
                        : "actions"}
                    </p>
                  </div>

                  <ListChecks
                    size={17}
                    className="text-zinc-700"
                  />
                </div>

                {actions.length ===
                0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-white/[0.07] bg-white/[0.015] px-5 py-8 text-center">
                    <Workflow
                      size={18}
                      className="mx-auto text-zinc-700"
                    />

                    <p className="mt-3 text-sm font-medium text-zinc-400">
                      No workflow steps configured
                    </p>

                    <p className="mt-1 text-xs text-zinc-600">
                      This workflow was created without execution actions.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {actions.map(
                      (
                        action,
                        index
                      ) => (
                        <WorkflowStep
                          key={`${action.order}-${action.type}-${index}`}
                          action={
                            action
                          }
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* EXECUTION READINESS */}
            <WorkflowReadinessPanel
              workflowId={workflow.id}
            />

            {/* EXECUTION HISTORY */}
            <ExecutionHistoryPanel
              workflow={workflow}
              loading={
                runsLoading
              }
              error={
                runsError
              }
              latestExecution={
                latestExecution
              }
              runs={runs}
              summary={
                runSummary
              }
              onRefresh={
                loadExecutionHistory
              }
            />

            {/* WORKFLOW CONTROLS */}
            <div className="border-t border-white/[0.07] p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Workflow Controls
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <ControlButton
                  icon={Play}
                  label="Start Workflow"
                  disabled={
                    !canStart ||
                    Boolean(
                      actionLoading
                    )
                  }
                  loading={
                    actionLoading ===
                    "start"
                  }
                  onClick={() =>
                    performAction(
                      "start"
                    )
                  }
                />

                <ControlButton
                  icon={Pause}
                  label="Pause Workflow"
                  disabled={
                    !isRunning ||
                    Boolean(
                      actionLoading
                    )
                  }
                  loading={
                    actionLoading ===
                    "pause"
                  }
                  onClick={() =>
                    performAction(
                      "pause"
                    )
                  }
                />

                <ControlButton
                  icon={Play}
                  label="Resume Workflow"
                  disabled={
                    !isPaused ||
                    Boolean(
                      actionLoading
                    )
                  }
                  loading={
                    actionLoading ===
                    "resume"
                  }
                  onClick={() =>
                    performAction(
                      "resume"
                    )
                  }
                />

                <ControlButton
                  icon={Zap}
                  label="Run Now"
                  disabled={Boolean(
                    actionLoading
                  )}
                  loading={
                    actionLoading ===
                    "run"
                  }
                  onClick={() =>
                    performAction(
                      "run"
                    )
                  }
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing(true)
                }
                disabled={Boolean(
                  actionLoading
                )}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 transition-all hover:bg-white/[0.07] disabled:opacity-40"
              >
                <Edit3
                  size={15}
                />

                Edit Workflow
              </button>

              <button
                type="button"
                onClick={
                  deleteWorkflow
                }
                disabled={Boolean(
                  actionLoading
                )}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-40"
              >
                <Trash2
                  size={15}
                />

                {actionLoading ===
                "delete"
                  ? "Deleting..."
                  : "Delete Workflow"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExecutionHistoryPanel({
  workflow,
  loading,
  error,
  latestExecution,
  runs,
  summary,
  onRefresh,
}: {
  workflow: WorkflowItem;
  loading: boolean;
  error: string;
  latestExecution:
    | WorkflowRun
    | null;
  runs: WorkflowRun[];
  summary: RunSummary;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="border-t border-white/[0.07] px-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
            <History
              size={16}
              className="text-blue-400"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-white">
              Execution History
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Real workflow runs
              and individual step
              results.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void onRefresh();
          }}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-500 transition-all hover:text-white disabled:opacity-40"
        >
          <RefreshCw
            size={14}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-5 space-y-3">
          {[1, 2, 3].map(
            (item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-xl border border-white/[0.05] bg-white/[0.02]"
              />
            )
          )}
        </div>
      ) : runs.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/[0.07] bg-white/[0.015] px-6 py-10 text-center">
          <Activity
            size={19}
            className="mx-auto text-zinc-700"
          />

          <p className="mt-3 text-sm font-medium text-zinc-400">
            No executions yet
          </p>

          <p className="mt-1 text-xs text-zinc-600">
            Use Run Now to create
            the first real workflow
            execution.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ExecutionStat
              label="Executions"
              value={
                summary.total
              }
            />

            <ExecutionStat
              label="Completed"
              value={
                summary.completed
              }
              status="Completed"
            />

            <ExecutionStat
              label="Blocked"
              value={
                summary.blocked
              }
              status="Blocked"
            />

            <ExecutionStat
              label="Failed"
              value={
                summary.failed
              }
              status="Failed"
            />
          </div>

          {latestExecution && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Latest Execution
              </p>

              <div className="mt-3 rounded-2xl border border-white/[0.07] bg-[#101116] p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">
                        Run #
                        {
                          workflow.runs_count
                        }
                      </p>

                      <ExecutionStatusBadge
                        status={
                          latestExecution.status
                        }
                      />
                    </div>

                    <p className="mt-2 text-xs text-zinc-600">
                      Started{" "}
                      {formatRunTime(
                        latestExecution.started_at
                      )}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-[10px] text-zinc-600">
                      Trigger
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      {latestExecution.trigger_type ||
                        "Unknown"}
                    </p>
                  </div>
                </div>

                {latestExecution.error_message && (
                  <div className="mt-4 flex gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
                    <AlertTriangle
                      size={16}
                      className="mt-0.5 shrink-0 text-amber-400"
                    />

                    <div>
                      <p className="text-xs font-medium text-amber-400">
                        Execution stopped
                      </p>

                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        {
                          latestExecution.error_message
                        }
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-5 space-y-2">
                  {latestExecution.steps.map(
                    (step) => (
                      <ExecutionStep
                        key={
                          step.id
                        }
                        step={
                          step
                        }
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Run History
            </p>

            <p className="mt-1 text-xs text-zinc-700">
              Latest{" "}
              {runs.length}{" "}
              execution
              {runs.length === 1
                ? ""
                : "s"}
            </p>

            <div className="mt-3 space-y-2">
              {runs.map(
                (
                  run,
                  index
                ) => {
                  const runNumber =
                    Math.max(
                      workflow.runs_count -
                        index,
                      1
                    );

                  return (
                    <RunHistoryRow
                      key={
                        run.id
                      }
                      run={
                        run
                      }
                      runNumber={
                        runNumber
                      }
                    />
                  );
                }
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExecutionStep({
  step,
}: {
  step: WorkflowRunStep;
}) {
  const statusStyle =
    getStepStatusStyle(
      step.status
    );

  const StatusIcon =
    getStepStatusIcon(
      step.status
    );

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-semibold text-violet-400">
          {String(
            step.step_order
          ).padStart(
            2,
            "0"
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-zinc-200">
                {
                  step.action_label
                }
              </p>

              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                {formatActionType(
                  step.action_type
                )}
              </p>
            </div>

            <span
              className={`flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusStyle}`}
            >
              <StatusIcon
                size={11}
              />

              {step.status}
            </span>
          </div>

          {step.error_message && (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              {
                step.error_message
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RunHistoryRow({
  run,
  runNumber,
}: {
  run: WorkflowRun;
  runNumber: number;
}) {
  const [
    expanded,
    setExpanded,
  ] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (current) =>
              !current
          )
        }
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.025]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
          <Activity
            size={15}
            className="text-zinc-500"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-zinc-200">
              Run #{runNumber}
            </p>

            <ExecutionStatusBadge
              status={
                run.status
              }
            />
          </div>

          <p className="mt-1 text-xs text-zinc-600">
            {formatRunTime(
              run.started_at
            )}
          </p>
        </div>

        <ChevronRight
          size={15}
          className={`text-zinc-700 transition-transform ${
            expanded
              ? "rotate-90"
              : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-white/[0.05] p-4">
          <div className="space-y-2">
            {run.steps.map(
              (step) => (
                <ExecutionStep
                  key={
                    step.id
                  }
                  step={step}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionStat({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status?: RunStatus;
}) {
  let valueClass =
    "text-white";

  if (
    status ===
    "Completed"
  ) {
    valueClass =
      "text-emerald-400";
  }

  if (
    status ===
    "Blocked"
  ) {
    valueClass =
      "text-amber-400";
  }

  if (
    status ===
    "Failed"
  ) {
    valueClass =
      "text-red-400";
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-3">
      <p className="text-[10px] text-zinc-600">
        {label}
      </p>

      <p
        className={`mt-1 text-lg font-semibold ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function ExecutionStatusBadge({
  status,
}: {
  status: RunStatus;
}) {
  const styles: Record<
    RunStatus,
    string
  > = {
    Running:
      "border-blue-500/20 bg-blue-500/10 text-blue-400",

    Completed:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",

    Blocked:
      "border-amber-500/20 bg-amber-500/10 text-amber-400",

    Failed:
      "border-red-500/20 bg-red-500/10 text-red-400",
  };

  const Icon =
    status === "Completed"
      ? CheckCircle2
      : status ===
          "Blocked"
        ? Ban
        : status ===
            "Failed"
          ? XCircle
          : RefreshCw;

  return (
    <span
      className={`flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${styles[status]}`}
    >
      <Icon
        size={11}
      />

      {status}
    </span>
  );
}

function WorkflowStep({
  action,
}: {
  action: WorkflowAction;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-xs font-semibold text-violet-400">
          {String(
            action.order
          ).padStart(
            2,
            "0"
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-200">
            {action.label}
          </p>

          <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
            {formatActionType(
              action.type
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  disabled,
  loading,
  onClick,
}: {
  icon: typeof Workflow;
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {loading ? (
        <RefreshCw
          size={15}
          className="animate-spin"
        />
      ) : (
        <Icon size={15} />
      )}

      {loading
        ? "Processing..."
        : label}
    </button>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-black/20 p-3">
      <p className="text-[10px] text-zinc-600">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-zinc-300">
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#111216] px-6 py-16 text-center">
      <Workflow
        size={20}
        className="mx-auto text-violet-400"
      />

      <h2 className="mt-5 text-lg font-semibold">
        No workflows found
      </h2>

      <button
        type="button"
        onClick={onCreate}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"
      >
        <Plus size={15} />
        Create Workflow
      </button>
    </div>
  );
}

function CreateWorkflowModal({
  name,
  description,
  triggerType,
  creating,
  onNameChange,
  onDescriptionChange,
  onTriggerTypeChange,
  onCreate,
  onClose,
}: {
  name: string;
  description: string;
  triggerType: string;
  creating: boolean;

  onNameChange: (
    value: string
  ) => void;

  onDescriptionChange: (
    value: string
  ) => void;

  onTriggerTypeChange: (
    value: string
  ) => void;

  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0b0e] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Create Workflow
          </h2>

          <button
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <input
            value={name}
            onChange={(event) =>
              onNameChange(
                event.target.value
              )
            }
            placeholder="Workflow name"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          />

          <textarea
            value={
              description
            }
            onChange={(event) =>
              onDescriptionChange(
                event.target.value
              )
            }
            placeholder="Description"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          />

          <select
            value={
              triggerType
            }
            onChange={(event) =>
              onTriggerTypeChange(
                event.target.value
              )
            }
            className="w-full rounded-xl border border-white/10 bg-[#111114] px-4 py-3"
          >
            <option>
              Manual
            </option>
            <option>
              Event
            </option>
            <option>
              Schedule
            </option>
            <option>
              Webhook
            </option>
            <option>
              AI
            </option>
          </select>
        </div>

        <button
          type="button"
          onClick={onCreate}
          disabled={
            creating ||
            !name.trim()
          }
          className="mt-6 w-full rounded-xl bg-white px-4 py-3 font-semibold text-black disabled:opacity-40"
        >
          {creating
            ? "Creating..."
            : "Create Workflow"}
        </button>
      </div>
    </div>
  );
}

function getWorkflowActions(
  actions: unknown[]
): WorkflowAction[] {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .filter(
      (
        action
      ): action is Record<
        string,
        unknown
      > =>
        typeof action ===
          "object" &&
        action !== null
    )
    .map(
      (
        action,
        index
      ): WorkflowAction => ({
        order:
          typeof action.order ===
          "number"
            ? action.order
            : index + 1,

        type:
          typeof action.type ===
          "string"
            ? action.type
            : "workflow_action",

        label:
          typeof action.label ===
          "string"
            ? action.label
            : `Workflow Step ${
                index + 1
              }`,
      })
    );
}

function getTriggerLabel(
  triggerType: string,
  triggerConfig: Record<
    string,
    unknown
  >
) {
  const event =
    triggerConfig.event;

  if (
    typeof event ===
    "string"
  ) {
    return formatActionType(
      event
    );
  }

  if (
    triggerType === "Manual"
  ) {
    return "Manual Launch";
  }

  return triggerType;
}

function getStepStatusStyle(
  status: StepStatus
) {
  switch (status) {
    case "Completed":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";

    case "Blocked":
      return "border-amber-500/20 bg-amber-500/10 text-amber-400";

    case "Failed":
      return "border-red-500/20 bg-red-500/10 text-red-400";

    case "Running":
      return "border-blue-500/20 bg-blue-500/10 text-blue-400";

    default:
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-500";
  }
}

function getStepStatusIcon(
  status: StepStatus
) {
  switch (status) {
    case "Completed":
      return CheckCircle2;

    case "Blocked":
      return Ban;

    case "Failed":
      return XCircle;

    case "Running":
      return RefreshCw;

    default:
      return Clock3;
  }
}

function formatActionType(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}

function formatRunTime(
  value: string
) {
  const date =
    new Date(value);

  const difference =
    Math.max(
      0,
      Date.now() -
        date.getTime()
    );

  const minutes =
    Math.floor(
      difference / 60000
    );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  return `${hours} hours ago`;
}

function formatLastRun(
  value: string | null
) {
  if (!value) {
    return "Never";
  }

  return formatRunTime(
    value
  );
}