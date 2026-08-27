"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ElementType,
} from "react";

import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  ChevronDown,
  ChevronRight,
  CirclePause,
  Clock3,
  Gauge,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase";

import type {
  J10FlowGraph,
  J10FlowNode,
} from "@/types/automation-graph";

import type {
  AutomationActionType,
} from "@/types/automation";

/*
============================================================
TYPES
============================================================
*/

type AutomationStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived";

type TriggerType =
  | "manual"
  | "new_crm_contact"
  | "crm_status_changed"
  | "new_ai_task"
  | "ai_task_completed"
  | "schedule";

type StepType =
  | "ai_task"
  | "action"
  | "condition"
  | "approval"
  | "activity";

type FailurePolicyMode =
  | "stop"
  | "retry"
  | "continue"
  | "human_review";

type AfterRetriesMode =
  | "stop"
  | "continue"
  | "human_review";

type Automation = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  schedule_expression: string | null;
  timezone: string;
  last_run_at: string | null;
  next_run_at: string | null;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  awaiting_approval_executions: number;
  created_at: string;
  updated_at: string;
};

type AutomationStep = {
  id: string;
  automation_id: string;
  user_id: string;
  step_order: number;
  name: string | null;
  step_type: StepType;
  action_type: string | null;
  employee_id: string | null;
  employee_name: string | null;
  task_type: string | null;
  instructions: string | null;
  config: Record<string, unknown>;
  condition_config: Record<string, unknown>;
  requires_approval: boolean;
  approval_type: string | null;
  on_success_step_id: string | null;
  on_failure_step_id: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type EmployeeRow = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  model: string;
};

type AutomationSummary = {
  total: number;
  active: number;
  paused: number;
  draft: number;
  archived: number;
  totalExecutions: number;
  awaitingApproval: number;
};

type AutomationsResponse = {
  success: boolean;
  error?: string;
  summary?: AutomationSummary;
  automations?: Automation[];
};

type CreateAutomationResponse = {
  success: boolean;
  error?: string;
  message?: string;
  automation?: Automation;
};

type WorkflowDetailsResponse = {
  success: boolean;
  error?: string;
  automation?: Automation;
  steps?: AutomationStep[];
};

type StepResponse = {
  success: boolean;
  error?: string;
  message?: string;
  step?: AutomationStep;
};

type PublishWorkflowResponse = {
  success: boolean;
  error?: string;
  message?: string;
  stepCount?: number;
  runtimeSwitchRequired?: boolean;
  warnings?: Array<{
    code: string;
    message: string;
    nodeId?: string;
    edgeId?: string;
  }>;
};

type RunWorkflowResponse = {
  success: boolean;
  error?: string;
  message?: string;
  status?: string;
  awaitingApproval?: boolean;
  run?: {
    id: string;
    automationId: string;
    currentStepOrder?: number | null;
    completedSteps?: number;
    apiCalled?: boolean;
    totalCostUSD?: number;
    executionMode?: string;
  };
  approval?: {
    runStepId: string;
    automationStepId: string;
    stepOrder: number;
    stepName: string | null;
    status: string;
  };
};

type PendingApproval = {
  id: string;
  run_id: string;
  automation_id: string;
  automation_step_id: string | null;
  step_order: number;
  step_type: string;
  action_type: string | null;
  status: string;
  approval_status: string;
  requires_approval: boolean;
  input_payload: Record<string, unknown>;
};

type ApprovalDecisionResponse = {
  success: boolean;
  error?: string;
  message?: string;
  decision?: "approved" | "rejected";
  continuationRequired?: boolean;
  protectedAction?: boolean;
  run?: {
    id: string;
    status: string;
    currentStepOrder?: number | null;
  };
};

type ContinueWorkflowResponse = {
  success: boolean;
  error?: string;
  message?: string;
  status?: string;
  continuationBlocked?: boolean;
  protectedAction?: boolean;
  run?: {
    id: string;
    status?: string;
    currentStepOrder?: number | null;
  };
};


type ExecutionHistorySummary = {
  total: number;
  running: number;
  completed: number;
  failed: number;
  queued: number;
  awaitingApproval: number;
  apiCalls: number;
  totalCostUSD: number;
};

type ExecutionHistoryAITask = {
  id: string;
  title: string;
  taskType: string;
  status: string;
  employeeId: string;
  employeeName: string;
  resultText: string | null;
  errorMessage: string | null;
  executionMode: string;
  apiCalled: boolean;
  targetModel: string | null;
  displayModel: string | null;
  estimatedCostUSD: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type ExecutionHistoryStep = {
  id: string;
  stepOrder: number;
  stepType: string;
  actionType: string | null;
  employee: {
    id: string | null;
    name: string | null;
  };
  status: string;
  approval: {
    required: boolean;
    status: string;
    approvedBy: string | null;
    note: string | null;
    approvedAt: string | null;
  };
  inputPayload: Record<string, unknown>;
  retry: {
    attempt: number;
    maxAttempts: number;
    isRetry: boolean;
    policy: string;
    resolution: string | null;
    previousAttempts: number;
  } | null;
  aiTask: ExecutionHistoryAITask | null;
};

type ExecutionHistoryRun = {
  id: string;
  automationId: string;
  automationName: string;
  triggerType: string;
  triggerPayload: Record<string, unknown>;
  status: string;
  currentStepOrder: number | null;
  resultSummary: string | null;
  errorMessage: string | null;
  executionMode: string;
  apiCalled: boolean;
  totalCostUSD: number;
  startedAt: string | null;
  completedAt: string | null;
  steps: ExecutionHistoryStep[];
};

type ExecutionHistoryResponse = {
  success: boolean;
  error?: string;
  summary?: ExecutionHistorySummary;
  runs?: ExecutionHistoryRun[];
};

type AutomationIntelligence = {
  successRate: number;
  approvalRate: number;
  approvedApprovals: number;
  rejectedApprovals: number;
  pendingApprovals: number;
  developmentRuns: number;
  liveRuns: number;
  otherRuns: number;
  retryAttempts: number;
  retriedRuns: number;
  recoveredRuns: number;
  retrySuccessRate: number;
  unrecoveredFailures: number;
  mostActiveWorkflow: Automation | null;
  recentRuns: ExecutionHistoryRun[];
};

const emptyExecutionHistorySummary: ExecutionHistorySummary = {
  total: 0,
  running: 0,
  completed: 0,
  failed: 0,
  queued: 0,
  awaitingApproval: 0,
  apiCalls: 0,
  totalCostUSD: 0,
};

/*
============================================================
OPTIONS
============================================================
*/

const triggerOptions: {
  value: TriggerType;
  label: string;
  description: string;
}[] = [
  {
    value: "manual",
    label: "Manual Trigger",
    description: "Run this workflow manually.",
  },
  {
    value: "new_crm_contact",
    label: "New CRM Contact",
    description: "Start when a CRM contact is created.",
  },
  {
    value: "crm_status_changed",
    label: "CRM Status Changed",
    description: "Start when CRM status changes.",
  },
  {
    value: "new_ai_task",
    label: "New AI Task",
    description: "Start when an AI task is created.",
  },
  {
    value: "ai_task_completed",
    label: "AI Task Completed",
    description: "Start when an AI task completes.",
  },
  {
    value: "schedule",
    label: "Scheduled",
    description: "Run automatically on a schedule.",
  },
];

const stepTypeOptions: {
  value: StepType;
  label: string;
  description: string;
}[] = [
  {
    value: "ai_task",
    label: "AI Employee Task",
    description:
      "Assign real work to an exact AI employee.",
  },
  {
    value: "action",
    label: "Business Action",
    description:
      "Perform an internal J10 business action.",
  },
  {
    value: "condition",
    label: "Condition",
    description:
      "Evaluate logic before continuing.",
  },
  {
    value: "approval",
    label: "Human Approval",
    description:
      "Stop execution until a human approves.",
  },
  {
    value: "activity",
    label: "Activity Log",
    description:
      "Record an operational activity.",
  },
];

const actionOptions = [
  {
    value: "analyze_crm",
    label: "Analyze CRM",
  },
  {
    value: "generate_recommendation",
    label: "Generate Recommendation",
  },
  {
    value: "add_crm_note",
    label: "Add CRM Note",
  },
  {
    value: "update_crm_status",
    label: "Update CRM Status",
  },
  {
    value: "run_research",
    label: "Run Research",
  },
  {
    value: "record_activity",
    label: "Record Activity",
  },
];

const taskTypeOptions = [
  {
    value: "general",
    label: "General Task",
  },
  {
    value: "research",
    label: "Research",
  },
  {
    value: "analysis",
    label: "Business Analysis",
  },
  {
    value: "crm_analysis",
    label: "CRM Analysis",
  },
  {
    value: "recommendation",
    label: "Recommendation",
  },
];

const failurePolicyOptions: {
  value: FailurePolicyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "stop",
    label: "Stop Workflow",
    description:
      "End the workflow immediately when this step fails.",
  },
  {
    value: "retry",
    label: "Retry",
    description:
      "Retry this exact step before applying a final failure action.",
  },
  {
    value: "continue",
    label: "Continue Workflow",
    description:
      "Record the failure and continue to the next workflow step.",
  },
  {
    value: "human_review",
    label: "Human Review",
    description:
      "Pause the workflow and require a human decision after failure.",
  },
];

const afterRetryOptions: {
  value: AfterRetriesMode;
  label: string;
}[] = [
  {
    value: "stop",
    label: "Stop Workflow",
  },
  {
    value: "continue",
    label: "Continue Workflow",
  },
  {
    value: "human_review",
    label: "Human Review",
  },
];

const emptySummary: AutomationSummary = {
  total: 0,
  active: 0,
  paused: 0,
  draft: 0,
  archived: 0,
  totalExecutions: 0,
  awaitingApproval: 0,
};

/*
============================================================
PAGE
============================================================
*/

export default function AutomationPage() {
  const [supabase] =
    useState(() => createClient());

  const [
    automations,
    setAutomations,
  ] =
    useState<Automation[]>([]);

  const [
    summary,
    setSummary,
  ] =
    useState<AutomationSummary>(
      emptySummary
    );

  const [
    employees,
    setEmployees,
  ] =
    useState<EmployeeRow[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    pageError,
    setPageError,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    builderOpen,
    setBuilderOpen,
  ] =
    useState(false);

  const [
    workflowEditorOpen,
    setWorkflowEditorOpen,
  ] =
    useState(false);

  const [
    selectedAutomation,
    setSelectedAutomation,
  ] =
    useState<Automation | null>(
      null
    );

  const [
    workflowSteps,
    setWorkflowSteps,
  ] =
    useState<AutomationStep[]>([]);

  const [
    workflowLoading,
    setWorkflowLoading,
  ] =
    useState(false);

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    description,
    setDescription,
  ] =
    useState("");

  const [
    triggerType,
    setTriggerType,
  ] =
    useState<TriggerType>(
      "manual"
    );

  const [
    scheduleExpression,
    setScheduleExpression,
  ] =
    useState("");

  const [
    timezone,
    setTimezone,
  ] =
    useState("UTC");

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    workingId,
    setWorkingId,
  ] =
    useState<string | null>(
      null
    );


  const [
    runningWorkflowId,
    setRunningWorkflowId,
  ] =
    useState<string | null>(
      null
    );
  const [
    publishingWorkflowId,
    setPublishingWorkflowId,
  ] =
    useState<string | null>(
      null
    );

  const [
    pendingApprovals,
    setPendingApprovals,
  ] =
    useState<PendingApproval[]>([]);

  const [
    approvalWorkingId,
    setApprovalWorkingId,
  ] =
    useState<string | null>(
      null
    );


  const [
    executionHistory,
    setExecutionHistory,
  ] =
    useState<ExecutionHistoryRun[]>([]);

  const [
    executionHistorySummary,
    setExecutionHistorySummary,
  ] =
    useState<ExecutionHistorySummary>(
      emptyExecutionHistorySummary
    );

  const [
    executionHistoryLoading,
    setExecutionHistoryLoading,
  ] =
    useState(true);

  const [
    executionHistoryError,
    setExecutionHistoryError,
  ] =
    useState("");

  const [
    expandedRunId,
    setExpandedRunId,
  ] =
    useState<string | null>(
      null
    );

  /*
  ============================================================
  STEP FORM
  ============================================================
  */

  const [
    editingStepId,
    setEditingStepId,
  ] =
    useState<string | null>(
      null
    );

  const [
    stepType,
    setStepType,
  ] =
    useState<StepType>(
      "ai_task"
    );

  const [
    stepName,
    setStepName,
  ] =
    useState("");

  const [
    stepEmployeeId,
    setStepEmployeeId,
  ] =
    useState("");

  const [
    stepTaskType,
    setStepTaskType,
  ] =
    useState("general");

  const [
    stepActionType,
    setStepActionType,
  ] =
    useState(
      "analyze_crm"
    );

  const [
    stepInstructions,
    setStepInstructions,
  ] =
    useState("");

  const [
    stepRequiresApproval,
    setStepRequiresApproval,
  ] =
    useState(false);

  const [
    stepFailureMode,
    setStepFailureMode,
  ] =
    useState<FailurePolicyMode>(
      "stop"
    );

  const [
    stepMaxAttempts,
    setStepMaxAttempts,
  ] =
    useState(3);

  const [
    stepRetryDelayMs,
    setStepRetryDelayMs,
  ] =
    useState(0);

  const [
    stepAfterRetries,
    setStepAfterRetries,
  ] =
    useState<AfterRetriesMode>(
      "stop"
    );

  const [
    stepTimeoutMs,
    setStepTimeoutMs,
  ] =
    useState(30000);

  const [
    workflowTimeoutMs,
    setWorkflowTimeoutMs,
  ] =
    useState(120000);

  const [
    stepExistingConfig,
    setStepExistingConfig,
  ] =
    useState<Record<string, unknown>>(
      {}
    );

  const [
    stepSaving,
    setStepSaving,
  ] =
    useState(false);

  const [
    stepError,
    setStepError,
  ] =
    useState("");

  const [
    stepMessage,
    setStepMessage,
  ] =
    useState("");

  /*
  ============================================================
  LOAD AUTOMATIONS
  ============================================================
  */

  const loadAutomations =
    useCallback(
      async (
        mode:
          | "initial"
          | "refresh" =
          "initial"
      ) => {
        if (
          mode ===
          "initial"
        ) {
          setLoading(
            true
          );
        } else {
          setRefreshing(
            true
          );
        }

        setPageError("");

        try {
          const response =
            await fetch(
              "/api/automations",
              {
                method:
                  "GET",

                cache:
                  "no-store",
              }
            );

          const data =
            (await response.json()) as AutomationsResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
                "Could not load automations."
            );
          }

          setAutomations(
            data.automations ??
              []
          );

          setSummary(
            data.summary ??
              emptySummary
          );
        } catch (error) {
          setPageError(
            error instanceof
              Error
              ? error.message
              : "Could not load automations."
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      []
    );

  /*
  ============================================================
  LOAD EMPLOYEES
  ============================================================
  */

  const loadEmployees =
    useCallback(
      async () => {
        try {
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
            return;
          }

          const {
            data,
            error,
          } =
            await supabase
              .from(
                "employees"
              )
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
                "user_id",
                user.id
              )
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              );

          if (error) {
            console.error(
              "Automation employee load error:",
              error
            );

            return;
          }

          setEmployees(
            (data ??
              []) as EmployeeRow[]
          );
        } catch (error) {
          console.error(
            "Automation employee load fatal error:",
            error
          );
        }
      },
      [supabase]
    );

  /*
  ============================================================
  LOAD PENDING APPROVALS
  ============================================================
  */

  const loadPendingApprovals =
    useCallback(
      async () => {
        try {
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
            setPendingApprovals(
              []
            );
            return;
          }

          const {
            data,
            error,
          } =
            await supabase
              .from(
                "automation_run_steps"
              )
              .select(
                `
                id,
                run_id,
                automation_id,
                automation_step_id,
                step_order,
                step_type,
                action_type,
                status,
                approval_status,
                requires_approval,
                input_payload
                `
              )
              .eq(
                "user_id",
                user.id
              )
              .eq(
                "status",
                "awaiting_approval"
              )
              .eq(
                "approval_status",
                "pending"
              )
              .order(
                "step_order",
                {
                  ascending:
                    true,
                }
              );

          if (error) {
            console.error(
              "Automation approval queue load error:",
              error
            );
            return;
          }

          setPendingApprovals(
            (data ??
              []) as PendingApproval[]
          );
        } catch (error) {
          console.error(
            "Automation approval queue fatal error:",
            error
          );
        }
      },
      [supabase]
    );


  /*
  ============================================================
  LOAD EXECUTION HISTORY
  ============================================================
  */

  const loadExecutionHistory =
    useCallback(
      async () => {
        setExecutionHistoryLoading(
          true
        );

        setExecutionHistoryError("");

        try {
          const response =
            await fetch(
              "/api/automation-runs?limit=25",
              {
                method:
                  "GET",

                cache:
                  "no-store",
              }
            );

          const data =
            (await response.json()) as ExecutionHistoryResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ||
                "Could not load execution history."
            );
          }

          setExecutionHistory(
            data.runs ??
              []
          );

          setExecutionHistorySummary(
            data.summary ??
              emptyExecutionHistorySummary
          );
        } catch (error) {
          setExecutionHistoryError(
            error instanceof Error
              ? error.message
              : "Could not load execution history."
          );
        } finally {
          setExecutionHistoryLoading(
            false
          );
        }
      },
      []
    );

  useEffect(() => {
    void loadAutomations();
    void loadEmployees();
    void loadPendingApprovals();
    void loadExecutionHistory();
  }, [
    loadAutomations,
    loadEmployees,
    loadPendingApprovals,
    loadExecutionHistory,
  ]);

  /*
  ============================================================
  METRICS
  ============================================================
  */

  const activeRate =
    useMemo(() => {
      if (
        summary.total ===
        0
      ) {
        return 0;
      }

      return Math.round(
        (summary.active /
          summary.total) *
          100
      );
    }, [summary]);

  const pendingApprovalByAutomation =
    useMemo(() => {
      const map =
        new Map<
          string,
          PendingApproval
        >();

      for (
        const approval of
          pendingApprovals
      ) {
        if (
          !map.has(
            approval.automation_id
          )
        ) {
          map.set(
            approval.automation_id,
            approval
          );
        }
      }

      return map;
    }, [pendingApprovals]);

  const automationIntelligence =
    useMemo<AutomationIntelligence>(() => {
      const finishedRuns =
        executionHistorySummary.completed +
        executionHistorySummary.failed;

      const successRate =
        finishedRuns > 0
          ? Math.round(
              (executionHistorySummary.completed /
                finishedRuns) *
                100
            )
          : 0;

      const approvalSteps =
        executionHistory.flatMap(
          (
            run
          ) =>
            run.steps.filter(
              (
                step
              ) =>
                step.approval.required
            )
        );

      const approvedApprovals =
        approvalSteps.filter(
          (
            step
          ) =>
            step.approval.status.toLowerCase() ===
            "approved"
        ).length;

      const rejectedApprovals =
        approvalSteps.filter(
          (
            step
          ) =>
            step.approval.status.toLowerCase() ===
            "rejected"
        ).length;

      const pendingApprovalsCount =
        approvalSteps.filter(
          (
            step
          ) =>
            step.approval.status.toLowerCase() ===
            "pending"
        ).length;

      const decidedApprovals =
        approvedApprovals +
        rejectedApprovals;

      const approvalRate =
        decidedApprovals > 0
          ? Math.round(
              (approvedApprovals /
                decidedApprovals) *
                100
            )
          : 0;

      const developmentRuns =
        executionHistory.filter(
          (
            run
          ) =>
            run.executionMode
              .toLowerCase() ===
            "development"
        ).length;

      const liveRuns =
        executionHistory.filter(
          (
            run
          ) =>
            run.executionMode
              .toLowerCase() ===
            "live"
        ).length;

      const otherRuns =
        Math.max(
          0,
          executionHistory.length -
            developmentRuns -
            liveRuns
        );

      const retryAttempts =
        executionHistory.reduce(
          (
            total,
            run
          ) =>
            total +
            run.steps.filter(
              (
                step
              ) =>
                Boolean(
                  step.retry?.isRetry
                )
            ).length,
          0
        );

      const retriedRuns =
        executionHistory.filter(
          (
            run
          ) =>
            run.steps.some(
              (
                step
              ) =>
                Boolean(
                  step.retry?.isRetry
                ) ||
                Number(
                  step.retry?.attempt ??
                    0
                ) >
                  1
            )
        );

      const recoveredRuns =
        retriedRuns.filter(
          (
            run
          ) =>
            run.status.toLowerCase() ===
              "completed" &&
            run.steps.some(
              (
                step
              ) =>
                Boolean(
                  step.retry?.isRetry
                ) &&
                step.status.toLowerCase() ===
                  "completed"
            )
        ).length;

      const unrecoveredFailures =
        retriedRuns.filter(
          (
            run
          ) =>
            run.status.toLowerCase() ===
            "failed"
        ).length;

      const retrySuccessRate =
        retriedRuns.length > 0
          ? Math.round(
              (recoveredRuns /
                retriedRuns.length) *
                100
            )
          : 0;

      const mostActiveWorkflow =
        automations.length > 0
          ? [...automations].sort(
              (
                a,
                b
              ) =>
                b.total_executions -
                a.total_executions
            )[0]
          : null;

      return {
        successRate,
        approvalRate,
        approvedApprovals,
        rejectedApprovals,
        pendingApprovals:
          pendingApprovalsCount,
        developmentRuns,
        liveRuns,
        otherRuns,
        retryAttempts,
        retriedRuns:
          retriedRuns.length,
        recoveredRuns,
        retrySuccessRate,
        unrecoveredFailures,
        mostActiveWorkflow,
        recentRuns:
          executionHistory.slice(
            0,
            5
          ),
      };
    }, [
      automations,
      executionHistory,
      executionHistorySummary,
    ]);

  /*
  ============================================================
  CREATE WORKFLOW
  ============================================================
  */

  function resetBuilder() {
    setName("");
    setDescription("");

    setTriggerType(
      "manual"
    );

    setScheduleExpression(
      ""
    );

    setTimezone(
      "UTC"
    );
  }

  function openBuilder() {
    setMessage("");
    setPageError("");

    resetBuilder();

    setBuilderOpen(
      true
    );
  }

  function closeBuilder() {
    if (saving) {
      return;
    }

    setBuilderOpen(
      false
    );
  }

  async function createAutomation() {
    setMessage("");
    setPageError("");

    const cleanName =
      name.trim();

    if (!cleanName) {
      setPageError(
        "Automation name is required."
      );

      return;
    }

    if (
      triggerType ===
        "schedule" &&
      !scheduleExpression.trim()
    ) {
      setPageError(
        "Scheduled workflows require a schedule expression."
      );

      return;
    }

    setSaving(true);

    try {
      const response =
        await fetch(
          "/api/automations",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  name:
                    cleanName,

                  description:
                    description.trim(),

                  status:
                    "draft",

                  triggerType,

                  triggerConfig:
                    {},

                  scheduleExpression:
                    triggerType ===
                    "schedule"
                      ? scheduleExpression.trim()
                      : null,

                  timezone:
                    timezone.trim() ||
                    "UTC",
                }
              ),
          }
        );

      const data =
        (await response.json()) as CreateAutomationResponse;

      if (
        !response.ok ||
        !data.success ||
        !data.automation
      ) {
        throw new Error(
          data.error ||
            "Could not create automation."
        );
      }

      setBuilderOpen(
        false
      );

      resetBuilder();

      setMessage(
        "Workflow created. Configure its AI employee and steps."
      );

      await loadAutomations(
        "refresh"
      );

      await openWorkflow(
        data.automation
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Could not create automation."
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  /*
  ============================================================
  PUBLISH WORKFLOW
  ============================================================
  */

  async function publishWorkflow(
    automation: Automation,
    steps: AutomationStep[]
  ) {
    setMessage("");
    setPageError("");
    setStepError("");
    setStepMessage("");

    if (steps.length === 0) {
      setStepError(
        "Add at least one workflow step before publishing."
      );
      return;
    }

    if (steps.some((step) => step.step_type === "condition")) {
      setStepError(
        "Typed condition publishing is coming next. Remove free-text condition steps or publish after Day 16G condition UI."
      );
      return;
    }

    const missingEmployeeStep =
      steps.find(
        (step) =>
          step.step_type === "ai_task" &&
          !step.employee_id
      );

    if (missingEmployeeStep) {
      setStepError(
        `Step ${missingEmployeeStep.step_order} needs an AI employee before publishing.`
      );
      return;
    }

    setPublishingWorkflowId(automation.id);

    try {
      const graph =
        buildJ10FlowGraphFromSavedWorkflow(
          automation,
          steps
        );

      const response =
        await fetch(
          `/api/automations/${automation.id}/publish`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              graph,
              activate: true,
            }),
          }
        );

      const data =
        (await response.json()) as PublishWorkflowResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "Could not publish workflow."
        );
      }

      const successMessage =
        data.message ||
        "Workflow published and activated.";

      setStepMessage(successMessage);
      setMessage(successMessage);

      await loadAutomations("refresh");
      await loadWorkflowDetails(automation.id);
    } catch (error) {
      setStepError(
        error instanceof Error
          ? error.message
          : "Could not publish workflow."
      );
    } finally {
      setPublishingWorkflowId(null);
    }
  }
  /*
  ============================================================
  RUN WORKFLOW
  ============================================================
  */

  async function runWorkflow(
    automation: Automation
  ) {
    setMessage("");
    setPageError("");

    if (
      automation.status !==
      "active"
    ) {
      setPageError(
        "Only active workflows can run."
      );
      return;
    }

    if (
      automation.trigger_type !==
      "manual"
    ) {
      setPageError(
        "Run Workflow currently supports Manual Trigger workflows."
      );
      return;
    }

    setRunningWorkflowId(
      automation.id
    );

    try {
      const response =
        await fetch(
          `/api/automations/${automation.id}/run`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                triggerPayload:
                  {},
              }),
          }
        );

      const data =
        (await response.json()) as RunWorkflowResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Workflow execution failed."
        );
      }

      if (
        data.awaitingApproval ||
        data.status ===
          "awaiting_approval"
      ) {
        setMessage(
          data.message ||
            "Workflow executed and is waiting for human approval."
        );
      } else {
        setMessage(
          data.message ||
            "Workflow executed successfully."
        );
      }

      await loadAutomations(
        "refresh"
      );

      await loadPendingApprovals();

      await loadExecutionHistory();

      if (
        selectedAutomation?.id ===
        automation.id
      ) {
        await loadWorkflowDetails(
          automation.id
        );
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Workflow execution failed."
      );
    } finally {
      setRunningWorkflowId(
        null
      );
    }
  }

  /*
  ============================================================
  APPROVAL DECISION
  ============================================================
  */

  async function decideApproval(
    approval: PendingApproval,
    decision:
      | "approve"
      | "reject"
  ) {
    setMessage("");
    setPageError("");

    if (
      decision ===
        "reject"
    ) {
      const confirmed =
        window.confirm(
          "Reject this workflow approval? The current workflow run will be marked failed."
        );

      if (!confirmed) {
        return;
      }
    }

    setApprovalWorkingId(
      approval.id
    );

    try {
      const response =
        await fetch(
          `/api/automation-runs/${approval.run_id}/steps/${approval.id}/approval`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                decision,

                note:
                  decision ===
                  "approve"
                    ? "Approved from J10 Automation Dashboard."
                    : "Rejected from J10 Automation Dashboard.",
              }),
          }
        );

      const data =
        (await response.json()) as ApprovalDecisionResponse;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not process the approval decision."
        );
      }

      /*
      ==========================================================
      AUTO-CONTINUE APPROVED WORKFLOW
      ==========================================================
      */

      if (
        decision ===
          "approve" &&
        data.continuationRequired &&
        data.run?.id
      ) {
        const continueResponse =
          await fetch(
            `/api/automation-runs/${data.run.id}/continue`,
            {
              method:
                "POST",
            }
          );

        const continuation =
          (await continueResponse.json()) as ContinueWorkflowResponse;

        if (
          !continueResponse.ok ||
          !continuation.success
        ) {
          throw new Error(
            continuation.error ||
              "Approval succeeded, but workflow continuation failed."
          );
        }

        if (
          continuation.continuationBlocked
        ) {
          setMessage(
            continuation.message ||
              "Approval recorded. Protected action remains safely queued."
          );
        } else {
          setMessage(
            continuation.message ||
              "Approval recorded and workflow continued successfully."
          );
        }
      } else {
        setMessage(
          data.message ||
            (decision ===
            "approve"
              ? "Workflow approved successfully."
              : "Workflow rejected successfully.")
        );
      }

      await loadAutomations(
        "refresh"
      );

      await loadPendingApprovals();

      await loadExecutionHistory();

      if (
        selectedAutomation
      ) {
        await loadWorkflowDetails(
          selectedAutomation.id
        );
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Could not process the approval decision."
      );
    } finally {
      setApprovalWorkingId(
        null
      );
    }
  }

  /*
  ============================================================
  AUTOMATION STATUS ACTIONS
  ============================================================
  */

  async function runAction(
    automation: Automation,
    action:
      | "pause"
      | "resume"
      | "archive"
  ) {
    setMessage("");
    setPageError("");

    setWorkingId(
      automation.id
    );

    try {
      const response =
        await fetch(
          `/api/automations/${automation.id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  action,
                }
              ),
          }
        );

      const data =
        (await response.json()) as {
          success: boolean;
          error?: string;
          message?: string;
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Automation action failed."
        );
      }

      setMessage(
        data.message ||
          "Automation updated."
      );

      await loadAutomations(
        "refresh"
      );

      if (
        selectedAutomation?.id ===
        automation.id
      ) {
        await loadWorkflowDetails(
          automation.id
        );
      }
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Automation action failed."
      );
    } finally {
      setWorkingId(
        null
      );
    }
  }

  /*
  ============================================================
  DELETE AUTOMATION
  ============================================================
  */

  async function deleteAutomation(
    automation: Automation
  ) {
    const confirmed =
      window.confirm(
        `Delete "${automation.name}" permanently?`
      );

    if (!confirmed) {
      return;
    }

    setMessage("");
    setPageError("");

    setWorkingId(
      automation.id
    );

    try {
      const response =
        await fetch(
          `/api/automations/${automation.id}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        (await response.json()) as {
          success: boolean;
          error?: string;
          message?: string;
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not delete automation."
        );
      }

      setMessage(
        data.message ||
          "Automation deleted."
      );

      if (
        selectedAutomation?.id ===
        automation.id
      ) {
        setWorkflowEditorOpen(
          false
        );

        setSelectedAutomation(
          null
        );

        setWorkflowSteps(
          []
        );
      }

      await loadAutomations(
        "refresh"
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Could not delete automation."
      );
    } finally {
      setWorkingId(
        null
      );
    }
  }

  /*
  ============================================================
  WORKFLOW DETAILS
  ============================================================
  */

  async function loadWorkflowDetails(
    automationId: string
  ) {
    setWorkflowLoading(
      true
    );

    setStepError("");

    try {
      const response =
        await fetch(
          `/api/automations/${automationId}`,
          {
            method:
              "GET",

            cache:
              "no-store",
          }
        );

      const data =
        (await response.json()) as WorkflowDetailsResponse;

      if (
        !response.ok ||
        !data.success ||
        !data.automation
      ) {
        throw new Error(
          data.error ||
            "Could not load workflow."
        );
      }

      setSelectedAutomation(
        data.automation
      );

      setWorkflowSteps(
        data.steps ??
          []
      );
    } catch (error) {
      setStepError(
        error instanceof Error
          ? error.message
          : "Could not load workflow."
      );
    } finally {
      setWorkflowLoading(
        false
      );
    }
  }

  async function openWorkflow(
    automation: Automation
  ) {
    resetStepForm();

    setSelectedAutomation(
      automation
    );

    setWorkflowEditorOpen(
      true
    );

    await loadEmployees();

    await loadWorkflowDetails(
      automation.id
    );
  }

  function closeWorkflowEditor() {
    if (
      stepSaving
    ) {
      return;
    }

    setWorkflowEditorOpen(
      false
    );

    setSelectedAutomation(
      null
    );

    setWorkflowSteps(
      []
    );

    resetStepForm();
  }

  /*
  ============================================================
  STEP FORM
  ============================================================
  */

  function resetStepForm() {
    setEditingStepId(
      null
    );

    setStepType(
      "ai_task"
    );

    setStepName("");

    setStepEmployeeId(
      ""
    );

    setStepTaskType(
      "general"
    );

    setStepActionType(
      "analyze_crm"
    );

    setStepInstructions(
      ""
    );

    setStepRequiresApproval(
      false
    );

    setStepFailureMode(
      "stop"
    );

    setStepMaxAttempts(
      3
    );

    setStepRetryDelayMs(
      0
    );

    setStepAfterRetries(
      "stop"
    );

    setStepTimeoutMs(
      30000
    );

    setWorkflowTimeoutMs(
      120000
    );

    setStepExistingConfig(
      {}
    );

    setStepError("");

    setStepMessage("");
  }

  function changeStepType(
    nextType: StepType
  ) {
    setStepType(nextType);
    setStepError("");
    setStepMessage("");

    if (nextType === "approval") {
      setStepEmployeeId("");
      setStepTaskType("general");
      setStepActionType("analyze_crm");
      setStepInstructions("");
      setStepRequiresApproval(true);
      return;
    }

    if (nextType === "condition") {
      setStepEmployeeId("");
      setStepTaskType("general");
      setStepActionType("analyze_crm");
      setStepRequiresApproval(false);
      return;
    }

    if (nextType === "activity") {
      setStepEmployeeId("");
      setStepTaskType("general");
      setStepActionType("record_activity");
      setStepRequiresApproval(false);
      return;
    }

    if (nextType === "ai_task") {
      setStepActionType("analyze_crm");
      setStepRequiresApproval(false);
      return;
    }

    setStepTaskType("general");
    setStepRequiresApproval(false);
  }

  function editStep(
    step: AutomationStep
  ) {
    setEditingStepId(
      step.id
    );

    setStepType(
      step.step_type
    );

    setStepName(
      step.name ??
        ""
    );

    if (step.step_type === "approval") {
      setStepEmployeeId("");
      setStepTaskType("general");
      setStepActionType("analyze_crm");
      setStepInstructions("");
      setStepRequiresApproval(true);
    } else if (step.step_type === "condition") {
      setStepEmployeeId("");
      setStepTaskType("general");
      setStepActionType("analyze_crm");
      setStepInstructions(step.instructions ?? "");
      setStepRequiresApproval(step.requires_approval);
    } else if (step.step_type === "activity") {
      setStepEmployeeId("");
      setStepTaskType("general");
      setStepActionType("record_activity");
      setStepInstructions(step.instructions ?? "");
      setStepRequiresApproval(step.requires_approval);
    } else {
      setStepEmployeeId(
        step.employee_id ??
          ""
      );

      setStepTaskType(
        step.task_type ??
          "general"
      );

      setStepActionType(
        step.action_type &&
          step.action_type !==
            "run_ai_employee" &&
          step.action_type !==
            "evaluate_condition" &&
          step.action_type !==
            "human_approval"
          ? step.action_type
          : "analyze_crm"
      );

      setStepInstructions(
        step.instructions ??
          ""
      );

      setStepRequiresApproval(
        step.requires_approval
      );
    }

    setStepError("");
    const failurePolicy =
      isRecordValue(
        step.config?.failurePolicy
      )
        ? step.config.failurePolicy
        : {};

    const savedFailureMode =
      normalizeFailurePolicyMode(
        failurePolicy.mode
      );

    const savedMaxAttempts =
      normalizePositiveInteger(
        failurePolicy.maxAttempts,
        3
      );

    const savedRetryDelayMs =
      normalizeNonNegativeInteger(
        failurePolicy.retryDelayMs,
        0
      );

    const savedAfterRetries =
      normalizeAfterRetriesMode(
        failurePolicy.afterRetries
      );

    setStepFailureMode(
      savedFailureMode
    );

    setStepMaxAttempts(
      savedMaxAttempts
    );

    setStepRetryDelayMs(
      savedRetryDelayMs
    );

    setStepAfterRetries(
      savedAfterRetries
    );

    const savedGuardrails =
      isRecordValue(
        step.config?.executionGuardrails
      )
        ? step.config.executionGuardrails
        : {};

    setStepTimeoutMs(
      normalizeGuardrailInteger(
        savedGuardrails.stepTimeoutMs,
        30000,
        100,
        120000
      )
    );

    setWorkflowTimeoutMs(
      normalizeGuardrailInteger(
        savedGuardrails.workflowTimeoutMs,
        120000,
        1000,
        300000
      )
    );

    setStepExistingConfig(
      isRecordValue(
        step.config
      )
        ? step.config
        : {}
    );

    setStepMessage("");

    document
      .getElementById(
        "workflow-step-editor"
      )
      ?.scrollIntoView({
        behavior:
          "smooth",
        block:
          "start",
      });
  }

  async function saveWorkflowStep() {
    if (
      !selectedAutomation
    ) {
      return;
    }

    setStepError("");
    setStepMessage("");

    if (
      stepType ===
        "ai_task" &&
      !stepEmployeeId
    ) {
      setStepError(
        "Select the exact AI employee for this task."
      );

      return;
    }

    if (
      stepType ===
        "condition" &&
      !stepInstructions.trim()
    ) {
      setStepError(
        "Condition logic is required."
      );

      return;
    }

    if (
      stepType ===
        "action" &&
      !stepActionType
    ) {
      setStepError(
        "Select a business action."
      );

      return;
    }

    let actionType: string;
    let employeeId: string | null = null;
    let taskType: string | null = null;
    let instructions: string | null = null;
    let conditionConfig: Record<string, unknown> = {};
    let requiresApproval = false;
    let approvalType: "human" | null = null;

    if (stepType === "ai_task") {
      actionType = "run_ai_employee";
      employeeId = stepEmployeeId;
      taskType = stepTaskType;
      instructions = stepInstructions.trim() || null;
      requiresApproval = stepRequiresApproval;
      approvalType = stepRequiresApproval ? "human" : null;
    } else if (stepType === "action") {
      actionType = stepActionType;
      employeeId = stepEmployeeId || null;
      instructions = stepInstructions.trim() || null;
      requiresApproval = stepRequiresApproval;
      approvalType = stepRequiresApproval ? "human" : null;
    } else if (stepType === "condition") {
      actionType = "evaluate_condition";
      instructions = stepInstructions.trim();
      conditionConfig = {
        expression: stepInstructions.trim(),
      };
    } else if (stepType === "approval") {
      actionType = "human_approval";
      employeeId = null;
      taskType = null;
      instructions = null;
      conditionConfig = {};
      requiresApproval = true;
      approvalType = "human";
    } else {
      actionType = "record_activity";
      instructions = stepInstructions.trim() || null;
    }

    const failurePolicy =
      stepType ===
        "approval"
        ? null
        : {
            mode:
              stepFailureMode,

            maxAttempts:
              stepFailureMode ===
              "retry"
                ? Math.max(
                    1,
                    Math.min(
                      10,
                      stepMaxAttempts
                    )
                  )
                : 1,

            retryDelayMs:
              stepFailureMode ===
              "retry"
                ? Math.max(
                    0,
                    Math.min(
                      60000,
                      stepRetryDelayMs
                    )
                  )
                : 0,

            afterRetries:
              stepFailureMode ===
              "retry"
                ? stepAfterRetries
                : "stop",
          };

    const config: Record<
      string,
      unknown
    > = {
      ...stepExistingConfig,
    };

    if (failurePolicy) {
      config.failurePolicy =
        failurePolicy;
    } else {
      delete config.failurePolicy;
    }

    if (
      stepType !==
      "approval"
    ) {
      const normalizedStepTimeoutMs =
        Math.max(
          100,
          Math.min(
            120000,
            stepTimeoutMs
          )
        );

      config.executionGuardrails = {
        stepTimeoutMs:
          normalizedStepTimeoutMs,

        workflowTimeoutMs:
          Math.max(
            normalizedStepTimeoutMs,
            Math.min(
              300000,
              Math.max(
                1000,
                workflowTimeoutMs
              )
            )
          ),
      };
    } else {
      delete config.executionGuardrails;
    }

    const body = {
      name:
        stepName.trim() ||
        null,

      stepType,

      actionType,

      employeeId,

      taskType,

      instructions,

      config,

      conditionConfig,

      requiresApproval,

      approvalType,

      isEnabled:
        true,
    };

    setStepSaving(
      true
    );

    try {
      const editing =
        Boolean(
          editingStepId
        );

      const endpoint =
        editing
          ? `/api/automations/${selectedAutomation.id}/steps/${editingStepId}`
          : `/api/automations/${selectedAutomation.id}/steps`;

      const response =
        await fetch(
          endpoint,
          {
            method:
              editing
                ? "PATCH"
                : "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                body
              ),
          }
        );

      const data =
        (await response.json()) as StepResponse;

      if (
        !response.ok ||
        !data.success ||
        !data.step
      ) {
        throw new Error(
          data.error ||
            "Could not save workflow step."
        );
      }

      if (data.step.step_type !== stepType) {
        throw new Error(
          `J10 expected ${stepType} but the server saved ${data.step.step_type}.`
        );
      }

      if (stepType === "approval") {
        const invalidApproval =
          data.step.action_type !== "human_approval" ||
          data.step.employee_id !== null ||
          data.step.employee_name !== null ||
          data.step.task_type !== null ||
          data.step.requires_approval !== true ||
          data.step.approval_type !== "human";

        if (invalidApproval) {
          throw new Error(
            "Approval safety validation failed. The saved step still contains AI task data."
          );
        }
      }

      setStepMessage(
        editing
          ? `Workflow step updated as ${formatStepTypeLabel(data.step.step_type)}.`
          : `Workflow step added as ${formatStepTypeLabel(data.step.step_type)}.`
      );

      await loadWorkflowDetails(
        selectedAutomation.id
      );

      setEditingStepId(
        null
      );

      setStepType("ai_task");
      setStepName("");
      setStepEmployeeId("");
      setStepTaskType("general");
      setStepActionType("analyze_crm");
      setStepInstructions("");
      setStepRequiresApproval(false);
      setStepFailureMode("stop");
      setStepMaxAttempts(3);
      setStepRetryDelayMs(0);
      setStepAfterRetries("stop");
      setStepTimeoutMs(30000);
      setWorkflowTimeoutMs(120000);
      setStepExistingConfig({});
    } catch (error) {
      setStepError(
        error instanceof Error
          ? error.message
          : "Could not save workflow step."
      );
    } finally {
      setStepSaving(
        false
      );
    }
  }

  /*
  ============================================================
  DELETE STEP
  ============================================================
  */

  async function deleteStep(
    step: AutomationStep
  ) {
    if (
      !selectedAutomation
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete workflow step ${step.step_order}?`
      );

    if (!confirmed) {
      return;
    }

    setStepError("");
    setStepMessage("");

    setStepSaving(
      true
    );

    try {
      const response =
        await fetch(
          `/api/automations/${selectedAutomation.id}/steps/${step.id}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        (await response.json()) as {
          success: boolean;
          error?: string;
          message?: string;
        };

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Could not delete workflow step."
        );
      }

      setStepMessage(
        "Workflow step deleted."
      );

      if (
        editingStepId ===
        step.id
      ) {
        resetStepForm();
      }

      await loadWorkflowDetails(
        selectedAutomation.id
      );
    } catch (error) {
      setStepError(
        error instanceof Error
          ? error.message
          : "Could not delete workflow step."
      );
    } finally {
      setStepSaving(
        false
      );
    }
  }

  /*
  ============================================================
  UI
  ============================================================
  */

  return (
    <div className="min-h-screen bg-[#08080A] text-white">
      <div className="mx-auto max-w-[1600px] px-5 py-6 lg:px-8">
        {/* HEADER */}

        <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-400">
              <Workflow
                size={14}
              />

              J10 Automation Engine
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
              Automation & Workflows
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
              Connect business events,
              exact AI employees,
              actions, conditions,
              approvals, and execution
              history.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void loadAutomations(
                  "refresh"
                );

                void loadPendingApprovals();
                void loadExecutionHistory();
              }}
              disabled={
                refreshing
              }
              className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>

            <button
              type="button"
              onClick={
                openBuilder
              }
              className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-4 text-xs font-semibold text-white shadow-lg shadow-violet-500/10 transition hover:brightness-110"
            >
              <Plus
                size={15}
              />

              New Workflow
            </button>
          </div>
        </div>

        {/* FEEDBACK */}

        {pageError && (
          <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-xs text-red-300">
            {pageError}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300">
            {message}
          </div>
        )}

        {/* METRICS */}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Workflows"
            value={
              summary.total
            }
            description="All saved automations"
            icon={
              Workflow
            }
          />

          <MetricCard
            label="Active"
            value={
              summary.active
            }
            description={`${activeRate}% of workflows active`}
            icon={
              Zap
            }
          />

          <MetricCard
            label="Executions"
            value={
              summary.totalExecutions
            }
            description="Recorded workflow runs"
            icon={
              Activity
            }
          />

          <MetricCard
            label="Awaiting Approval"
            value={
              summary.awaitingApproval
            }
            description="Human review required"
            icon={
              Clock3
            }
          />
        </div>

        {/* AUTOMATION INTELLIGENCE */}

        <AutomationIntelligenceSection
          automationSummary={
            summary
          }
          historySummary={
            executionHistorySummary
          }
          intelligence={
            automationIntelligence
          }
          workflows={
            automations
          }
          loading={
            executionHistoryLoading
          }
        />

        {/* ARCHITECTURE */}

        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#0D0D11] p-5">
          <div className="mb-5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/25">
              Workflow Architecture
            </div>

            <div className="mt-1 text-sm font-semibold text-white">
              J10 Automation Pipeline
            </div>
          </div>

          <div className="grid items-center gap-3 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            <FlowNode
              icon={
                Zap
              }
              eyebrow="WHEN"
              title="Business Trigger"
              description="Detect an event"
            />

            <FlowArrow />

            <FlowNode
              icon={
                Bot
              }
              eyebrow="ASSIGN"
              title="AI Employee"
              description="Exact employee UUID"
            />

            <FlowArrow />

            <FlowNode
              icon={
                Sparkles
              }
              eyebrow="DO"
              title="AI Action"
              description="Execute work"
            />

            <FlowArrow />

            <FlowNode
              icon={
                ShieldCheck
              }
              eyebrow="THEN"
              title="Approval / Logic"
              description="Human control"
            />
          </div>
        </div>

        {/* AUTOMATION LIBRARY */}

        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#0D0D11]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/25">
                Automation Library
              </div>

              <div className="mt-1 text-sm font-semibold text-white">
                Your Workflows
              </div>
            </div>

            <div className="text-[10px] text-white/25">
              {
                automations.length
              }{" "}
              workflow
              {automations.length ===
              1
                ? ""
                : "s"}
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <Loader2
                size={22}
                className="animate-spin text-violet-400"
              />
            </div>
          ) : automations.length ===
            0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/[0.07]">
                <Workflow
                  size={21}
                  className="text-violet-400"
                />
              </div>

              <div className="mt-4 text-sm font-semibold text-white">
                No workflows yet
              </div>

              <div className="mt-2 max-w-md text-xs leading-5 text-white/35">
                Create your first
                J10 automation and
                begin connecting
                triggers to AI
                employees.
              </div>

              <button
                type="button"
                onClick={
                  openBuilder
                }
                className="mt-5 flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.08] px-4 py-2.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/[0.14]"
              >
                <Plus
                  size={14}
                />

                Create First Workflow
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {automations.map(
                (
                  automation
                ) => (
                  <AutomationRow
                    key={
                      automation.id
                    }
                    automation={
                      automation
                    }
                    approval={
                      pendingApprovalByAutomation.get(
                        automation.id
                      ) ??
                      null
                    }
                    busy={
                      workingId ===
                        automation.id ||
                      runningWorkflowId ===
                        automation.id ||
                      approvalWorkingId ===
                        pendingApprovalByAutomation.get(
                          automation.id
                        )?.id
                    }
                    running={
                      runningWorkflowId ===
                      automation.id
                    }
                    approvalBusy={
                      approvalWorkingId ===
                      pendingApprovalByAutomation.get(
                        automation.id
                      )?.id
                    }
                    onApprove={(approval) =>
                      void decideApproval(
                        approval,
                        "approve"
                      )
                    }
                    onReject={(approval) =>
                      void decideApproval(
                        approval,
                        "reject"
                      )
                    }
                    onRun={() =>
                      void runWorkflow(
                        automation
                      )
                    }
                    onOpen={() =>
                      void openWorkflow(
                        automation
                      )
                    }
                    onPause={() =>
                      void runAction(
                        automation,
                        "pause"
                      )
                    }
                    onResume={() =>
                      void runAction(
                        automation,
                        "resume"
                      )
                    }
                    onArchive={() =>
                      void runAction(
                        automation,
                        "archive"
                      )
                    }
                    onDelete={() =>
                      void deleteAutomation(
                        automation
                      )
                    }
                  />
                )
              )}
            </div>
          )}
        </div>

        {/* EXECUTION HISTORY */}

        <ExecutionHistorySection
          summary={
            executionHistorySummary
          }
          runs={
            executionHistory
          }
          loading={
            executionHistoryLoading
          }
          error={
            executionHistoryError
          }
          expandedRunId={
            expandedRunId
          }
          onToggleRun={(
            runId
          ) =>
            setExpandedRunId(
              (
                current
              ) =>
                current ===
                runId
                  ? null
                  : runId
            )
          }
          onRefresh={() =>
            void loadExecutionHistory()
          }
        />
      </div>

      {/* CREATE WORKFLOW */}

      {builderOpen && (
        <WorkflowBuilderModal
          name={name}
          setName={
            setName
          }
          description={
            description
          }
          setDescription={
            setDescription
          }
          triggerType={
            triggerType
          }
          setTriggerType={
            setTriggerType
          }
          scheduleExpression={
            scheduleExpression
          }
          setScheduleExpression={
            setScheduleExpression
          }
          timezone={
            timezone
          }
          setTimezone={
            setTimezone
          }
          saving={
            saving
          }
          onClose={
            closeBuilder
          }
          onCreate={() =>
            void createAutomation()
          }
        />
      )}

      {/* WORKFLOW EDITOR */}

      {workflowEditorOpen &&
        selectedAutomation && (
          <WorkflowEditorModal
            automation={
              selectedAutomation
            }
            steps={
              workflowSteps
            }
            employees={
              employees
            }
            loading={
              workflowLoading
            }
            stepType={
              stepType
            }
            onStepTypeChange={
              changeStepType
            }
            stepName={
              stepName
            }
            setStepName={
              setStepName
            }
            stepEmployeeId={
              stepEmployeeId
            }
            setStepEmployeeId={
              setStepEmployeeId
            }
            stepTaskType={
              stepTaskType
            }
            setStepTaskType={
              setStepTaskType
            }
            stepActionType={
              stepActionType
            }
            setStepActionType={
              setStepActionType
            }
            stepInstructions={
              stepInstructions
            }
            setStepInstructions={
              setStepInstructions
            }
            stepRequiresApproval={
              stepRequiresApproval
            }
            setStepRequiresApproval={
              setStepRequiresApproval
            }
            stepFailureMode={
              stepFailureMode
            }
            setStepFailureMode={
              setStepFailureMode
            }
            stepMaxAttempts={
              stepMaxAttempts
            }
            setStepMaxAttempts={
              setStepMaxAttempts
            }
            stepRetryDelayMs={
              stepRetryDelayMs
            }
            setStepRetryDelayMs={
              setStepRetryDelayMs
            }
            stepAfterRetries={
              stepAfterRetries
            }
            setStepAfterRetries={
              setStepAfterRetries
            }
            stepTimeoutMs={
              stepTimeoutMs
            }
            setStepTimeoutMs={
              setStepTimeoutMs
            }
            workflowTimeoutMs={
              workflowTimeoutMs
            }
            setWorkflowTimeoutMs={
              setWorkflowTimeoutMs
            }
            editingStepId={
              editingStepId
            }
            saving={
              stepSaving
            }
            publishing={
              publishingWorkflowId === selectedAutomation.id
            }
            error={
              stepError
            }
            message={
              stepMessage
            }
            onSave={() =>
              void saveWorkflowStep()
            }
            onPublish={() =>
              void publishWorkflow(
                selectedAutomation,
                workflowSteps
              )
            }
            onEdit={
              editStep
            }
            onDelete={(
              step
            ) =>
              void deleteStep(
                step
              )
            }
            onCancelEdit={
              resetStepForm
            }
            onRefresh={() =>
              void loadWorkflowDetails(
                selectedAutomation.id
              )
            }
            onClose={
              closeWorkflowEditor
            }
          />
        )}
    </div>
  );
}

/*
============================================================
METRIC CARD
============================================================
*/

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number;
  description: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0D0D11] p-4">
      <div className="flex items-start justify-between">
        <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/25">
          {label}
        </div>

        <Icon
          size={14}
          className="text-violet-400"
        />
      </div>

      <div className="mt-3 text-xl font-bold tracking-tight text-white">
        {value}
      </div>

      <div className="mt-1 text-[10px] text-white/30">
        {description}
      </div>
    </div>
  );
}

/*
============================================================
FLOW NODE
============================================================
*/

function FlowNode({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: ElementType;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/[0.08]">
          <Icon
            size={16}
            className="text-violet-400"
          />
        </div>

        <div>
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-violet-400">
            {eyebrow}
          </div>

          <div className="mt-1 text-xs font-semibold text-white">
            {title}
          </div>

          <div className="mt-1 text-[10px] leading-4 text-white/30">
            {description}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="hidden justify-center xl:flex">
      <ChevronRight
        size={16}
        className="text-white/15"
      />
    </div>
  );
}

/*
============================================================
AUTOMATION ROW
============================================================
*/

function AutomationRow({
  automation,
  approval,
  busy,
  running,
  approvalBusy,
  onApprove,
  onReject,
  onRun,
  onOpen,
  onPause,
  onResume,
  onArchive,
  onDelete,
}: {
  automation: Automation;
  approval: PendingApproval | null;
  busy: boolean;
  running: boolean;
  approvalBusy: boolean;
  onApprove: (
    approval: PendingApproval
  ) => void;
  onReject: (
    approval: PendingApproval
  ) => void;
  onRun: () => void;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [
    menuOpen,
    setMenuOpen,
  ] =
    useState(false);

  const trigger =
    triggerOptions.find(
      (
        option
      ) =>
        option.value ===
        automation.trigger_type
    ) ??
    triggerOptions[0];

  return (
    <div className="flex flex-col gap-4 px-5 py-4 transition hover:bg-white/[0.015] lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.07]">
          <Workflow
            size={17}
            className="text-violet-400"
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-white">
              {
                automation.name
              }
            </div>

            <StatusBadge
              status={
                automation.status
              }
            />
          </div>

          <div className="mt-1 truncate text-[10px] text-white/30">
            {
              trigger.label
            }
            {" · "}
            {
              automation.total_executions
            }{" "}
            executions
            {" · "}
            {
              automation.timezone
            }
          </div>

          {automation.description && (
            <div className="mt-1 max-w-2xl truncate text-[10px] text-white/25">
              {
                automation.description
              }
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {approval && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
            <div className="flex items-center gap-2 pr-1">
              <ShieldCheck
                size={13}
                className="text-amber-300"
              />

              <div>
                <div className="text-[9px] font-semibold text-amber-200">
                  Approval Required
                </div>

                <div className="mt-0.5 text-[8px] text-amber-100/40">
                  Step{" "}
                  {
                    approval.step_order
                  }
                  {" · "}
                  {
                    approval.action_type
                      ? formatCodeLabel(
                          approval.action_type
                        )
                      : formatCodeLabel(
                          approval.step_type
                        )
                  }
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={
                approvalBusy
              }
              onClick={() =>
                onApprove(
                  approval
                )
              }
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1.5 text-[9px] font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.14] disabled:opacity-40"
            >
              {approvalBusy ? (
                <Loader2
                  size={11}
                  className="animate-spin"
                />
              ) : (
                <CheckCircle2
                  size={11}
                />
              )}

              Approve
            </button>

            <button
              type="button"
              disabled={
                approvalBusy
              }
              onClick={() =>
                onReject(
                  approval
                )
              }
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 text-[9px] font-semibold text-red-300 transition hover:bg-red-500/[0.11] disabled:opacity-40"
            >
              <X
                size={11}
              />

              Reject
            </button>
          </div>
        )}

        {automation.status ===
          "active" &&
          automation.trigger_type ===
            "manual" &&
          !approval && (
            <button
              type="button"
              onClick={
                onRun
              }
              disabled={
                busy
              }
              className="flex items-center gap-2 rounded-lg border border-blue-500/25 bg-blue-500/[0.08] px-3 py-2 text-[10px] font-medium text-blue-300 transition hover:bg-blue-500/[0.14] hover:text-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? (
                <Loader2
                  size={12}
                  className="animate-spin"
                />
              ) : (
                <Play
                  size={12}
                />
              )}

              {running
                ? "Running"
                : "Run Workflow"}
            </button>
          )}

        <button
          type="button"
          onClick={
            onOpen
          }
          disabled={
            busy
          }
          className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.07] px-3 py-2 text-[10px] font-medium text-violet-300 transition hover:bg-violet-500/[0.12] disabled:opacity-40"
        >
          <GitBranch
            size={12}
          />

          Open Builder
        </button>

        {automation.status ===
          "active" && (
          <button
            type="button"
            disabled={
              busy
            }
            onClick={
              onPause
            }
            className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[10px] font-medium text-white/50 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            <Pause
              size={12}
            />

            Pause
          </button>
        )}

        {(automation.status ===
          "draft" ||
          automation.status ===
            "paused") && (
          <button
            type="button"
            disabled={
              busy
            }
            onClick={
              onResume
            }
            className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/[0.1] disabled:opacity-40"
          >
            <Play
              size={12}
            />

            Activate
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            disabled={
              busy
            }
            onClick={() =>
              setMenuOpen(
                (
                  current
                ) =>
                  !current
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-white/35 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            {busy ? (
              <Loader2
                size={13}
                className="animate-spin"
              />
            ) : (
              <MoreHorizontal
                size={15}
              />
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111116] p-1.5 shadow-2xl shadow-black/40">
              {automation.status !==
                "archived" && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(
                      false
                    );

                    onArchive();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-white/50 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <CirclePause
                    size={12}
                  />

                  Archive
                </button>
              )}

              {automation.status !==
                "active" && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(
                      false
                    );

                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] text-red-400/70 transition hover:bg-red-500/[0.07] hover:text-red-300"
                >
                  <Trash2
                    size={12}
                  />

                  Delete
                </button>
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
AUTOMATION INTELLIGENCE
============================================================
*/

function AutomationIntelligenceSection({
  automationSummary,
  historySummary,
  intelligence,
  workflows,
  loading,
}: {
  automationSummary: AutomationSummary;
  historySummary: ExecutionHistorySummary;
  intelligence: AutomationIntelligence;
  workflows: Automation[];
  loading: boolean;
}) {
  const loadedRuns =
    Math.max(
      historySummary.total,
      1
    );

  const completedPercent =
    Math.round(
      (historySummary.completed /
        loadedRuns) *
        100
    );

  const failedPercent =
    Math.round(
      (historySummary.failed /
        loadedRuns) *
        100
    );

  const awaitingPercent =
    Math.round(
      (historySummary.awaitingApproval /
        loadedRuns) *
        100
    );

  const runningPercent =
    Math.round(
      (historySummary.running /
        loadedRuns) *
        100
    );

  const queuedPercent =
    Math.round(
      (historySummary.queued /
        loadedRuns) *
        100
    );

  const maxWorkflowExecutions =
    Math.max(
      1,
      ...workflows.map(
        (
          workflow
        ) =>
          workflow.total_executions
      )
    );

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D0D11]">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-400">
            <BarChart3
              size={13}
            />

            J10 Automation Intelligence
          </div>

          <div className="mt-1 text-sm font-semibold text-white">
            Workflow Performance
          </div>

          <div className="mt-1 text-[10px] text-white/30">
            Live operational intelligence calculated from saved workflows and execution history.
          </div>
        </div>

        <div className="flex items-center gap-2 text-[9px] text-white/25">
          {loading && (
            <Loader2
              size={11}
              className="animate-spin text-violet-400"
            />
          )}

          {historySummary.total} loaded run
          {historySummary.total ===
          1
            ? ""
            : "s"}
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
        <IntelligenceMetricCard
          icon={
            Gauge
          }
          label="Success Rate"
          value={`${intelligence.successRate}%`}
          detail="Completed vs finished runs"
        />

        <IntelligenceMetricCard
          icon={
            Activity
          }
          label="Total Executions"
          value={
            automationSummary.totalExecutions
          }
          detail="All workflow execution counters"
        />

        <IntelligenceMetricCard
          icon={
            ShieldCheck
          }
          label="Approval Rate"
          value={`${intelligence.approvalRate}%`}
          detail={`${intelligence.approvedApprovals} approved · ${intelligence.rejectedApprovals} rejected`}
        />

        <IntelligenceMetricCard
          icon={
            CircleDollarSign
          }
          label="Tracked AI Cost"
          value={
            formatMoney(
              historySummary.totalCostUSD
            )
          }
          detail={`${historySummary.apiCalls} run${historySummary.apiCalls === 1 ? "" : "s"} called an API`}
        />

        <IntelligenceMetricCard
          icon={
            Target
          }
          label="Most Active"
          value={
            intelligence.mostActiveWorkflow
              ?.name ??
            "No Runs Yet"
          }
          detail={
            intelligence.mostActiveWorkflow
              ? `${intelligence.mostActiveWorkflow.total_executions} execution${intelligence.mostActiveWorkflow.total_executions === 1 ? "" : "s"}`
              : "No workflow activity recorded"
          }
          compact
        />
      </div>

      <div className="border-t border-white/[0.06] p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-violet-400">
              <RotateCcw
                size={12}
              />

              J10 Recovery Intelligence
            </div>

            <div className="mt-1 text-[11px] font-semibold text-white/70">
              Failure & Retry Observability
            </div>

            <div className="mt-1 text-[9px] text-white/25">
              Retry attempts, recovered workflows, and failures that still require attention.
            </div>
          </div>

          <div className="text-[9px] text-white/25">
            {intelligence.retriedRuns} retried run
            {intelligence.retriedRuns === 1
              ? ""
              : "s"}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <IntelligenceMetricCard
            icon={
              RotateCcw
            }
            label="Retries"
            value={
              intelligence.retryAttempts
            }
            detail="Additional execution attempts"
          />

          <IntelligenceMetricCard
            icon={
              CheckCircle2
            }
            label="Recovered Runs"
            value={
              intelligence.recoveredRuns
            }
            detail="Retry sequences that recovered"
          />

          <IntelligenceMetricCard
            icon={
              Gauge
            }
            label="Retry Success Rate"
            value={`${intelligence.retrySuccessRate}%`}
            detail="Recovered vs retried runs"
          />

          <IntelligenceMetricCard
            icon={
              TriangleAlert
            }
            label="Unrecovered Failures"
            value={
              intelligence.unrecoveredFailures
            }
            detail="Retried runs still failed"
          />
        </div>
      </div>

      <div className="grid gap-4 border-t border-white/[0.06] p-5 xl:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
                Run Distribution
              </div>

              <div className="mt-1 text-[11px] font-semibold text-white/70">
                Execution Status
              </div>
            </div>

            <div className="text-[9px] text-white/25">
              {historySummary.total} recent
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <IntelligenceProgressRow
              label="Completed"
              value={
                historySummary.completed
              }
              percent={
                completedPercent
              }
              tone="emerald"
            />

            <IntelligenceProgressRow
              label="Failed"
              value={
                historySummary.failed
              }
              percent={
                failedPercent
              }
              tone="red"
            />

            <IntelligenceProgressRow
              label="Awaiting Approval"
              value={
                historySummary.awaitingApproval
              }
              percent={
                awaitingPercent
              }
              tone="amber"
            />

            <IntelligenceProgressRow
              label="Running"
              value={
                historySummary.running
              }
              percent={
                runningPercent
              }
              tone="blue"
            />

            <IntelligenceProgressRow
              label="Queued"
              value={
                historySummary.queued
              }
              percent={
                queuedPercent
              }
              tone="violet"
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
              Runtime Intelligence
            </div>

            <div className="mt-1 text-[11px] font-semibold text-white/70">
              Execution Environment
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <RuntimeIntelligenceCard
              label="Development"
              value={
                intelligence.developmentRuns
              }
              detail="Safe isolated runs"
            />

            <RuntimeIntelligenceCard
              label="Live"
              value={
                intelligence.liveRuns
              }
              detail="Live-mode runs"
            />

            <RuntimeIntelligenceCard
              label="Other"
              value={
                intelligence.otherRuns
              }
              detail="Unclassified runtime"
            />
          </div>

          <div className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/[0.035] p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck
                size={13}
                className="mt-0.5 shrink-0 text-blue-300"
              />

              <div>
                <div className="text-[9px] font-semibold text-blue-200/80">
                  Runtime Safety
                </div>

                <div className="mt-1 text-[9px] leading-4 text-blue-100/35">
                  Development executions remain isolated from live API usage. API calls and tracked cost are reported independently from runtime mode.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-white/[0.05] pt-4">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-semibold text-white/55">
                Human Approval Decisions
              </div>

              <div className="text-[9px] text-white/25">
                {intelligence.approvedApprovals +
                  intelligence.rejectedApprovals +
                  intelligence.pendingApprovals} recorded
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <ApprovalCount
                label="Approved"
                value={
                  intelligence.approvedApprovals
                }
                tone="emerald"
              />

              <ApprovalCount
                label="Rejected"
                value={
                  intelligence.rejectedApprovals
                }
                tone="red"
              />

              <ApprovalCount
                label="Pending"
                value={
                  intelligence.pendingApprovals
                }
                tone="amber"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-white/[0.06] p-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
                Recent Activity
              </div>

              <div className="mt-1 text-[11px] font-semibold text-white/70">
                Recent Runs
              </div>
            </div>

            <Clock3
              size={14}
              className="text-violet-400"
            />
          </div>

          {intelligence.recentRuns.length ===
          0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/[0.07] px-4 py-6 text-center text-[10px] text-white/25">
              No workflow runs recorded yet.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-white/[0.05]">
              {intelligence.recentRuns.map(
                (
                  run
                ) => (
                  <RecentRunRow
                    key={
                      run.id
                    }
                    run={
                      run
                    }
                  />
                )
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
                Workflow Distribution
              </div>

              <div className="mt-1 text-[11px] font-semibold text-white/70">
                Workflow Activity
              </div>
            </div>

            <Workflow
              size={14}
              className="text-violet-400"
            />
          </div>

          {workflows.length ===
          0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/[0.07] px-4 py-6 text-center text-[10px] text-white/25">
              No workflows available.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {[...workflows]
                .sort(
                  (
                    a,
                    b
                  ) =>
                    b.total_executions -
                    a.total_executions
                )
                .map(
                  (
                    workflow
                  ) => (
                    <WorkflowActivityRow
                      key={
                        workflow.id
                      }
                      workflow={
                        workflow
                      }
                      maxExecutions={
                        maxWorkflowExecutions
                      }
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

function IntelligenceMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  compact = false,
}: {
  icon: ElementType;
  label: string;
  value:
    | string
    | number;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
          {label}
        </div>

        <Icon
          size={13}
          className="shrink-0 text-violet-400"
        />
      </div>

      <div
        className={`mt-2 font-bold text-white ${
          compact
            ? "line-clamp-2 text-[13px] leading-5"
            : "text-lg"
        }`}
      >
        {value}
      </div>

      <div className="mt-1 text-[9px] leading-4 text-white/25">
        {detail}
      </div>
    </div>
  );
}

function IntelligenceProgressRow({
  label,
  value,
  percent,
  tone,
}: {
  label: string;
  value: number;
  percent: number;
  tone:
    | "emerald"
    | "red"
    | "amber"
    | "blue"
    | "violet";
}) {
  const barStyles = {
    emerald:
      "bg-emerald-400",
    red:
      "bg-red-400",
    amber:
      "bg-amber-300",
    blue:
      "bg-blue-400",
    violet:
      "bg-violet-400",
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="text-[9px] text-white/40">
          {label}
        </div>

        <div className="text-[9px] font-medium text-white/55">
          {value}{" "}
          <span className="text-white/20">
            ({percent}%)
          </span>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barStyles[tone]}`}
          style={{
            width:
              `${Math.min(
                100,
                Math.max(
                  0,
                  percent
                )
              )}%`,
          }}
        />
      </div>
    </div>
  );
}

function RuntimeIntelligenceCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-[#0A0A0D] p-3">
      <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/20">
        {label}
      </div>

      <div className="mt-2 text-base font-bold text-white/80">
        {value}
      </div>

      <div className="mt-1 text-[8px] text-white/25">
        {detail}
      </div>
    </div>
  );
}

function ApprovalCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone:
    | "emerald"
    | "red"
    | "amber";
}) {
  const styles = {
    emerald:
      "border-emerald-500/15 bg-emerald-500/[0.035] text-emerald-300",
    red:
      "border-red-500/15 bg-red-500/[0.035] text-red-300",
    amber:
      "border-amber-500/15 bg-amber-500/[0.035] text-amber-300",
  };

  return (
    <div
      className={`rounded-lg border p-2.5 ${styles[tone]}`}
    >
      <div className="text-[8px] uppercase tracking-[0.14em] opacity-60">
        {label}
      </div>

      <div className="mt-1 text-sm font-bold">
        {value}
      </div>
    </div>
  );
}

function RecentRunRow({
  run,
}: {
  run: ExecutionHistoryRun;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-[10px] font-medium text-white/65">
            {
              run.automationName
            }
          </div>

          <HistoryStatusBadge
            status={
              run.status
            }
          />
        </div>

        <div className="mt-1 text-[8px] text-white/25">
          {
            formatCodeLabel(
              run.triggerType
            )
          }
          {" · "}
          {
            run.steps.length
          }{" "}
          step
          {run.steps.length ===
          1
            ? ""
            : "s"}
          {" · "}
          {
            formatDateTime(
              run.startedAt
            )
          }
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-[8px] text-white/30">
        <span>
          {
            formatCodeLabel(
              run.executionMode
            )
          }
        </span>

        <span>
          ·
        </span>

        <span>
          {
            run.apiCalled
              ? "API Called"
              : "No API"
          }
        </span>

        <span>
          ·
        </span>

        <span>
          {
            formatMoney(
              run.totalCostUSD
            )
          }
        </span>
      </div>
    </div>
  );
}

function WorkflowActivityRow({
  workflow,
  maxExecutions,
}: {
  workflow: Automation;
  maxExecutions: number;
}) {
  const percent =
    Math.round(
      (workflow.total_executions /
        maxExecutions) *
        100
    );

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[9px] font-medium text-white/50">
            {
              workflow.name
            }
          </div>

          <div className="mt-0.5 text-[8px] text-white/20">
            {
              formatCodeLabel(
                workflow.status
              )
            }
          </div>
        </div>

        <div className="shrink-0 text-[9px] font-medium text-white/50">
          {
            workflow.total_executions
          }{" "}
          run
          {workflow.total_executions ===
          1
            ? ""
            : "s"}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-violet-400 transition-all duration-300"
          style={{
            width:
              `${Math.min(
                100,
                Math.max(
                  0,
                  percent
                )
              )}%`,
          }}
        />
      </div>
    </div>
  );
}

/*
============================================================
EXECUTION HISTORY
============================================================
*/

function ExecutionHistorySection({
  summary,
  runs,
  loading,
  error,
  expandedRunId,
  onToggleRun,
  onRefresh,
}: {
  summary: ExecutionHistorySummary;
  runs: ExecutionHistoryRun[];
  loading: boolean;
  error: string;
  expandedRunId: string | null;
  onToggleRun: (
    runId: string
  ) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D0D11]">
      <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-400">
            J10 Execution Intelligence
          </div>

          <div className="mt-1 text-sm font-semibold text-white">
            Execution History
          </div>

          <div className="mt-1 text-[10px] text-white/30">
            Inspect workflow runs, exact steps, AI employees, approvals, runtime, cost, and results.
          </div>
        </div>

        <button
          type="button"
          onClick={
            onRefresh
          }
          disabled={
            loading
          }
          className="flex h-9 items-center gap-2 self-start rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 text-[10px] font-medium text-white/45 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40 lg:self-auto"
        >
          <RefreshCw
            size={12}
            className={
              loading
                ? "animate-spin"
                : ""
            }
          />

          Refresh History
        </button>
      </div>

      <div className="grid gap-3 border-b border-white/[0.06] p-5 sm:grid-cols-2 xl:grid-cols-5">
        <HistoryMetric
          label="Runs"
          value={
            summary.total
          }
          detail="Latest execution records"
        />

        <HistoryMetric
          label="Completed"
          value={
            summary.completed
          }
          detail="Successful runs"
        />

        <HistoryMetric
          label="Failed"
          value={
            summary.failed
          }
          detail="Runs requiring review"
        />

        <HistoryMetric
          label="API Calls"
          value={
            summary.apiCalls
          }
          detail="Runs that called an API"
        />

        <HistoryMetric
          label="AI Cost"
          value={
            formatMoney(
              summary.totalCostUSD
            )
          }
          detail="Tracked execution cost"
        />
      </div>

      {error && (
        <div className="m-5 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-[10px] text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center">
          <Loader2
            size={20}
            className="animate-spin text-violet-400"
          />
        </div>
      ) : runs.length ===
        0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
          <Activity
            size={22}
            className="text-white/20"
          />

          <div className="mt-3 text-xs font-semibold text-white/55">
            No execution history yet
          </div>

          <div className="mt-1 text-[10px] text-white/25">
            Run a workflow and its execution record will appear here.
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {runs.map(
            (
              run
            ) => (
              <ExecutionRunCard
                key={
                  run.id
                }
                run={
                  run
                }
                expanded={
                  expandedRunId ===
                  run.id
                }
                onToggle={() =>
                  onToggleRun(
                    run.id
                  )
                }
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function HistoryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value:
    | number
    | string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
        {label}
      </div>

      <div className="mt-2 text-lg font-bold text-white">
        {value}
      </div>

      <div className="mt-1 text-[9px] text-white/25">
        {detail}
      </div>
    </div>
  );
}

function ExecutionRunCard({
  run,
  expanded,
  onToggle,
}: {
  run: ExecutionHistoryRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  const retrySummary =
    getRunRetrySummary(
      run
    );

  return (
    <div className="px-5 py-4">
      <button
        type="button"
        onClick={
          onToggle
        }
        className="flex w-full flex-col gap-4 text-left lg:flex-row lg:items-center"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/[0.06]">
            <Activity
              size={15}
              className="text-violet-400"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-xs font-semibold text-white/85">
                {
                  run.automationName
                }
              </div>

              <HistoryStatusBadge
                status={
                  run.status
                }
              />

              {retrySummary.retried && (
                <span className="flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/[0.07] px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-violet-300">
                  <RotateCcw
                    size={9}
                  />

                  {retrySummary.retryAttempts} retr
                  {retrySummary.retryAttempts === 1
                    ? "y"
                    : "ies"}
                </span>
              )}

              {retrySummary.recovered && (
                <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                  <CheckCircle2
                    size={9}
                  />

                  Recovered
                </span>
              )}

              {retrySummary.unrecovered && (
                <span className="flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/[0.07] px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-red-300">
                  <TriangleAlert
                    size={9}
                  />

                  Unrecovered
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-white/30">
              <span>
                {
                  formatCodeLabel(
                    run.triggerType
                  )
                }
              </span>

              <span>
                ·
              </span>

              <span>
                {
                  run.steps.length
                }{" "}
                recorded attempt
                {run.steps.length ===
                1
                  ? ""
                  : "s"}
              </span>

              <span>
                ·
              </span>

              <span>
                {
                  formatDateTime(
                    run.startedAt
                  )
                }
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <HistoryPill
            label="MODE"
            value={
              formatCodeLabel(
                run.executionMode ||
                  "unknown"
              )
            }
          />

          <HistoryPill
            label="API"
            value={
              run.apiCalled
                ? "Called"
                : "Not Called"
            }
          />

          <HistoryPill
            label="COST"
            value={
              formatMoney(
                run.totalCostUSD
              )
            }
          />

          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.025] text-white/35">
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${
                expanded
                  ? "rotate-180"
                  : ""
              }`}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#09090C] p-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <RunDetail
              label="Run ID"
              value={
                run.id
              }
              mono
            />

            <RunDetail
              label="Started"
              value={
                formatDateTime(
                  run.startedAt
                )
              }
            />

            <RunDetail
              label="Completed"
              value={
                formatDateTime(
                  run.completedAt
                )
              }
            />

            <RunDetail
              label="Current Step"
              value={
                run.currentStepOrder ??
                "—"
              }
            />
          </div>

          {retrySummary.retried && (
            <div
              className={`mt-4 rounded-xl border p-4 ${
                retrySummary.recovered
                  ? "border-emerald-500/15 bg-emerald-500/[0.035]"
                  : retrySummary.unrecovered
                    ? "border-red-500/15 bg-red-500/[0.035]"
                    : "border-violet-500/15 bg-violet-500/[0.035]"
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      retrySummary.recovered
                        ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
                        : retrySummary.unrecovered
                          ? "border-red-500/20 bg-red-500/[0.07] text-red-300"
                          : "border-violet-500/20 bg-violet-500/[0.07] text-violet-300"
                    }`}
                  >
                    <RotateCcw
                      size={14}
                    />
                  </div>

                  <div>
                    <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/30">
                      Recovery Intelligence
                    </div>

                    <div className="mt-1 text-[11px] font-semibold text-white/75">
                      {retrySummary.recovered
                        ? `Recovered after ${retrySummary.retryAttempts} retry${retrySummary.retryAttempts === 1 ? "" : "ies"}`
                        : retrySummary.unrecovered
                          ? "Retry sequence ended in failure"
                          : "Retry sequence recorded"}
                    </div>

                    <div className="mt-1 text-[9px] leading-4 text-white/30">
                      Failure Policy:{" "}
                      {formatCodeLabel(
                        retrySummary.policy ||
                          "retry"
                      )}
                      {" · "}
                      Maximum{" "}
                      {retrySummary.maxAttempts ||
                        "—"}{" "}
                      attempt
                      {retrySummary.maxAttempts === 1
                        ? ""
                        : "s"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <RecoveryMiniMetric
                    label="Retries"
                    value={
                      retrySummary.retryAttempts
                    }
                  />

                  <RecoveryMiniMetric
                    label="Max Attempt"
                    value={
                      retrySummary.highestAttempt
                    }
                  />

                  <RecoveryMiniMetric
                    label="Outcome"
                    value={
                      retrySummary.recovered
                        ? "Recovered"
                        : retrySummary.unrecovered
                          ? "Failed"
                          : "Pending"
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {run.resultSummary && (
            <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.035] p-3">
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
                Result Summary
              </div>

              <div className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-white/55">
                {
                  run.resultSummary
                }
              </div>
            </div>
          )}

          {run.errorMessage && (
            <div className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.04] p-3">
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-red-300/70">
                Error
              </div>

              <div className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-red-200/60">
                {
                  run.errorMessage
                }
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
                  Execution Chain
                </div>

                <div className="mt-1 text-[11px] font-semibold text-white/70">
                  Run Steps & Retry Attempts
                </div>
              </div>

              <div className="text-[9px] text-white/25">
                {
                  run.steps.length
                }{" "}
                recorded
              </div>
            </div>

            {run.steps.length ===
              0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.07] px-4 py-6 text-center text-[10px] text-white/25">
                No run steps were recorded.
              </div>
            ) : (
              <div className="space-y-3">
                {run.steps.map(
                  (
                    step
                  ) => (
                    <ExecutionStepCard
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RecoveryMiniMetric({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number;
}) {
  return (
    <div className="min-w-[88px] rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2">
      <div className="text-[7px] font-semibold uppercase tracking-[0.14em] text-white/20">
        {label}
      </div>

      <div className="mt-1 text-[9px] font-semibold text-white/60">
        {value}
      </div>
    </div>
  );
}

function ExecutionStepCard({
  step,
}: {
  step: ExecutionHistoryStep;
}) {
  const employeeName =
    step.aiTask?.employeeName ||
    step.employee.name;

  const model =
    step.aiTask?.displayModel ||
    step.aiTask?.targetModel ||
    null;

  const retry =
    step.retry;

  const failure =
    getStepFailureDetails(
      step
    );

  const recovered =
    Boolean(
      retry &&
      retry.isRetry &&
      step.status.toLowerCase() ===
        "completed"
    );

  return (
    <div
      className={`rounded-xl border p-3.5 ${
        step.status.toLowerCase() ===
        "failed"
          ? "border-red-500/15 bg-red-500/[0.025]"
          : recovered
            ? "border-emerald-500/15 bg-emerald-500/[0.025]"
            : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/15 bg-blue-500/[0.045]">
            {step.stepType ===
            "approval" ? (
              <ShieldCheck
                size={13}
                className="text-amber-300"
              />
            ) : step.stepType ===
              "ai_task" ? (
              <Bot
                size={13}
                className="text-blue-400"
              />
            ) : (
              <Sparkles
                size={13}
                className="text-violet-400"
              />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/25">
                STEP{" "}
                {
                  step.stepOrder
                }
              </div>

              <HistoryStatusBadge
                status={
                  step.status
                }
              />

              {retry && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] ${
                    recovered
                      ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
                      : retry.isRetry
                        ? "border-violet-500/20 bg-violet-500/[0.07] text-violet-300"
                        : "border-white/[0.08] bg-white/[0.04] text-white/45"
                  }`}
                >
                  Attempt{" "}
                  {
                    retry.attempt
                  }
                  {recovered
                    ? " · Recovered"
                    : retry.isRetry
                      ? " · Retry"
                      : ""}
                </span>
              )}

              {step.approval.required && (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-2 py-0.5 text-[7px] font-semibold uppercase tracking-wider text-amber-300">
                  {
                    formatCodeLabel(
                      step.approval.status
                    )
                  }
                </span>
              )}
            </div>

            <div className="mt-1 text-[11px] font-semibold text-white/70">
              {
                formatCodeLabel(
                  step.actionType ||
                    step.stepType
                )
              }
            </div>

            {employeeName && (
              <div className="mt-1 text-[9px] text-blue-300/55">
                AI Employee:{" "}
                {
                  employeeName
                }
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {retry && (
            <>
              <HistoryPill
                label="ATTEMPT"
                value={`${retry.attempt}/${Math.max(
                  retry.maxAttempts,
                  retry.attempt
                )}`}
              />

              <HistoryPill
                label="POLICY"
                value={
                  formatCodeLabel(
                    retry.policy
                  )
                }
              />

              {retry.resolution && (
                <HistoryPill
                  label="RESOLUTION"
                  value={
                    formatCodeLabel(
                      retry.resolution
                    )
                  }
                />
              )}
            </>
          )}

          {step.aiTask && (
            <>
              <HistoryPill
                label="MODE"
                value={
                  formatCodeLabel(
                    step.aiTask.executionMode
                  )
                }
              />

              <HistoryPill
                label="API"
                value={
                  step.aiTask.apiCalled
                    ? "Called"
                    : "Not Called"
                }
              />

              <HistoryPill
                label="MODEL"
                value={
                  model ||
                  "Not Run"
                }
              />

              <HistoryPill
                label="COST"
                value={
                  formatMoney(
                    step.aiTask.estimatedCostUSD
                  )
                }
              />
            </>
          )}
        </div>
      </div>

      {retry && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <RunDetail
            label="Failure Policy"
            value={`${formatCodeLabel(
              retry.policy
            )} · Maximum ${Math.max(
              retry.maxAttempts,
              retry.attempt
            )} attempt${
              Math.max(
                retry.maxAttempts,
                retry.attempt
              ) === 1
                ? ""
                : "s"
            }`}
          />

          <RunDetail
            label="Previous Attempts"
            value={
              retry.previousAttempts
            }
          />

          <RunDetail
            label="Retry State"
            value={
              recovered
                ? `Recovered on attempt ${retry.attempt}`
                : retry.resolution
                  ? formatCodeLabel(
                      retry.resolution
                    )
                  : retry.isRetry
                    ? "Retry Attempt"
                    : "Initial Attempt"
            }
          />
        </div>
      )}

      {failure.message && (
        <div className="mt-3 rounded-lg border border-red-500/15 bg-red-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-red-300/70">
            <TriangleAlert
              size={11}
            />

            Failure
          </div>

          <div className="mt-2 whitespace-pre-wrap text-[9px] leading-5 text-red-200/60">
            {
              failure.message
            }
          </div>

          {failure.resolution && (
            <div className="mt-2 text-[8px] text-white/25">
              Resolution:{" "}
              <span className="font-semibold text-white/45">
                {
                  formatCodeLabel(
                    failure.resolution
                  )
                }
              </span>
            </div>
          )}
        </div>
      )}

      {getStepTimeoutDetails(
        step
      ) && (
        <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-amber-300/70">
            <Clock3
              size={11}
            />

            Execution Timeout
          </div>

          <div className="mt-2 text-[9px] leading-5 text-amber-100/55">
            {
              getStepTimeoutDetails(
                step
              )?.label
            }
            {" · "}
            {
              getStepTimeoutDetails(
                step
              )?.scope
            }
            {" · "}
            {
              getStepTimeoutDetails(
                step
              )?.timeoutMs
            }
            ms
          </div>
        </div>
      )}

      {recovered && (
        <div className="mt-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
          <div className="flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-emerald-300/70">
            <CheckCircle2
              size={11}
            />

            Recovery
          </div>

          <div className="mt-2 text-[9px] leading-5 text-emerald-100/55">
            This workflow step recovered successfully on attempt{" "}
            {
              retry?.attempt
            }
            .
          </div>
        </div>
      )}

      {step.aiTask && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <RunDetail
            label="AI Task"
            value={
              step.aiTask.title
            }
          />

          <RunDetail
            label="Task Type"
            value={
              formatCodeLabel(
                step.aiTask.taskType
              )
            }
          />

          <RunDetail
            label="Started"
            value={
              formatDateTime(
                step.aiTask.startedAt
              )
            }
          />

          <RunDetail
            label="Completed"
            value={
              formatDateTime(
                step.aiTask.completedAt
              )
            }
          />
        </div>
      )}

      {step.aiTask?.resultText && (
        <div className="mt-3 rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/25">
            AI Result
          </div>

          <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[9px] leading-5 text-white/45">
            {
              step.aiTask.resultText
            }
          </div>
        </div>
      )}

      {step.aiTask?.errorMessage && (
        <div className="mt-3 rounded-lg border border-red-500/15 bg-red-500/[0.035] p-3 text-[9px] leading-5 text-red-200/60">
          {
            step.aiTask.errorMessage
          }
        </div>
      )}

      {step.approval.required && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <RunDetail
            label="Approval"
            value={
              formatCodeLabel(
                step.approval.status
              )
            }
          />

          <RunDetail
            label="Decision Time"
            value={
              formatDateTime(
                step.approval.approvedAt
              )
            }
          />

          {step.approval.note && (
            <div className="lg:col-span-2">
              <RunDetail
                label="Approval Note"
                value={
                  step.approval.note
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-[78px] rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
      <div className="text-[7px] font-semibold uppercase tracking-[0.15em] text-white/20">
        {label}
      </div>

      <div className="mt-1 max-w-[130px] truncate text-[9px] font-medium text-white/55">
        {value}
      </div>
    </div>
  );
}

function RunDetail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value:
    | string
    | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-3">
      <div className="text-[7px] font-semibold uppercase tracking-[0.16em] text-white/20">
        {label}
      </div>

      <div
        className={`mt-1 break-words text-[9px] text-white/50 ${
          mono
            ? "font-mono"
            : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HistoryStatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  let style =
    "border-white/[0.08] bg-white/[0.04] text-white/45";

  if (
    normalized ===
    "completed"
  ) {
    style =
      "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300";
  } else if (
    normalized ===
    "failed"
  ) {
    style =
      "border-red-500/20 bg-red-500/[0.07] text-red-300";
  } else if (
    normalized ===
    "awaiting_approval"
  ) {
    style =
      "border-amber-500/20 bg-amber-500/[0.07] text-amber-300";
  } else if (
    normalized ===
      "running" ||
    normalized ===
      "queued"
  ) {
    style =
      "border-blue-500/20 bg-blue-500/[0.07] text-blue-300";
  }

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] ${style}`}
    >
      {
        formatCodeLabel(
          status
        )
      }
    </span>
  );
}

/*
============================================================
STATUS
============================================================
*/

function StatusBadge({
  status,
}: {
  status: AutomationStatus;
}) {
  const styles: Record<
    AutomationStatus,
    string
  > = {
    draft:
      "border-white/[0.08] bg-white/[0.04] text-white/40",

    active:
      "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300",

    paused:
      "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",

    archived:
      "border-white/[0.06] bg-white/[0.025] text-white/25",
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] ${styles[status]}`}
    >
      {status}
    </span>
  );
}

/*
============================================================
CREATE WORKFLOW MODAL
============================================================
*/

function WorkflowBuilderModal({
  name,
  setName,
  description,
  setDescription,
  triggerType,
  setTriggerType,
  scheduleExpression,
  setScheduleExpression,
  timezone,
  setTimezone,
  saving,
  onClose,
  onCreate,
}: {
  name: string;
  setName: (
    value: string
  ) => void;

  description: string;
  setDescription: (
    value: string
  ) => void;

  triggerType: TriggerType;

  setTriggerType: (
    value: TriggerType
  ) => void;

  scheduleExpression: string;

  setScheduleExpression: (
    value: string
  ) => void;

  timezone: string;

  setTimezone: (
    value: string
  ) => void;

  saving: boolean;

  onClose: () => void;
  onCreate: () => void;
}) {
  const selectedTrigger =
    triggerOptions.find(
      (
        option
      ) =>
        option.value ===
        triggerType
    ) ??
    triggerOptions[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0D0D11] shadow-2xl shadow-black/60">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0D0D11]/95 px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-400">
              J10 Workflow Builder
            </div>

            <div className="mt-1 text-base font-semibold text-white">
              Create Automation
            </div>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              saving
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            <X
              size={17}
            />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <div>
            <div className="mb-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/25">
              Workflow Identity
            </div>

            <div className="grid gap-3">
              <label>
                <span className="mb-1.5 block text-[10px] font-medium text-white/45">
                  Workflow Name
                </span>

                <input
                  value={
                    name
                  }
                  onChange={(
                    event
                  ) =>
                    setName(
                      event.target.value
                    )
                  }
                  placeholder="Example: New Lead Intelligence"
                  className="h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-xs text-white outline-none transition placeholder:text-white/20 focus:border-violet-500/35"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-[10px] font-medium text-white/45">
                  Description
                </span>

                <textarea
                  value={
                    description
                  }
                  onChange={(
                    event
                  ) =>
                    setDescription(
                      event.target.value
                    )
                  }
                  placeholder="What should this workflow accomplish?"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-xs leading-5 text-white outline-none transition placeholder:text-white/20 focus:border-violet-500/35"
                />
              </label>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-violet-400">
                  WHEN
                </div>

                <div className="mt-1 text-sm font-semibold text-white">
                  Choose Trigger
                </div>
              </div>

              <Zap
                size={16}
                className="text-violet-400"
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {triggerOptions.map(
                (
                  trigger
                ) => {
                  const selected =
                    trigger.value ===
                    triggerType;

                  return (
                    <button
                      type="button"
                      key={
                        trigger.value
                      }
                      onClick={() =>
                        setTriggerType(
                          trigger.value
                        )
                      }
                      className={`rounded-xl border p-3 text-left transition ${
                        selected
                          ? "border-violet-500/35 bg-violet-500/[0.09]"
                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                    >
                      <div
                        className={`text-xs font-semibold ${
                          selected
                            ? "text-violet-300"
                            : "text-white/70"
                        }`}
                      >
                        {
                          trigger.label
                        }
                      </div>

                      <div className="mt-1 text-[10px] leading-4 text-white/30">
                        {
                          trigger.description
                        }
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {triggerType ===
            "schedule" && (
            <div className="grid gap-3 md:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-[10px] font-medium text-white/45">
                  Schedule Expression
                </span>

                <input
                  value={
                    scheduleExpression
                  }
                  onChange={(
                    event
                  ) =>
                    setScheduleExpression(
                      event.target.value
                    )
                  }
                  placeholder="Example: 0 9 * * 1"
                  className="h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-xs text-white outline-none transition placeholder:text-white/20 focus:border-violet-500/35"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-[10px] font-medium text-white/45">
                  Timezone
                </span>

                <input
                  value={
                    timezone
                  }
                  onChange={(
                    event
                  ) =>
                    setTimezone(
                      event.target.value
                    )
                  }
                  placeholder="UTC"
                  className="h-11 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-xs text-white outline-none transition placeholder:text-white/20 focus:border-violet-500/35"
                />
              </label>
            </div>
          )}

          <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.035] p-4">
            <div className="text-[8px] font-semibold uppercase tracking-[0.2em] text-violet-400">
              Workflow Preview
            </div>

            <div className="mt-4 grid items-center gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <MiniStep
                label="WHEN"
                value={
                  selectedTrigger.label
                }
              />

              <ChevronRight
                size={14}
                className="hidden text-white/15 md:block"
              />

              <MiniStep
                label="AI EMPLOYEE"
                value="Configure Next"
                muted
              />

              <ChevronRight
                size={14}
                className="hidden text-white/15 md:block"
              />

              <MiniStep
                label="ACTION"
                value="Configure Next"
                muted
              />
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between border-t border-white/[0.06] bg-[#0D0D11]/95 px-5 py-4 backdrop-blur-xl">
          <div className="text-[10px] text-white/25">
            New workflows begin
            as Draft.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                onClose
              }
              disabled={
                saving
              }
              className="rounded-xl border border-white/[0.07] px-4 py-2.5 text-xs font-medium text-white/50 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={
                onCreate
              }
              disabled={
                saving
              }
              className="flex min-w-[130px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2
                    size={14}
                    className="animate-spin"
                  />

                  Creating
                </>
              ) : (
                <>
                  <Plus
                    size={14}
                  />

                  Create Workflow
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
============================================================
WORKFLOW EDITOR
============================================================
*/

function WorkflowEditorModal({
  automation,
  steps,
  employees,
  loading,

  stepType,
  onStepTypeChange,

  stepName,
  setStepName,

  stepEmployeeId,
  setStepEmployeeId,

  stepTaskType,
  setStepTaskType,

  stepActionType,
  setStepActionType,

  stepInstructions,
  setStepInstructions,

  stepRequiresApproval,
  setStepRequiresApproval,

  stepFailureMode,
  setStepFailureMode,

  stepMaxAttempts,
  setStepMaxAttempts,

  stepRetryDelayMs,
  setStepRetryDelayMs,

  stepAfterRetries,
  setStepAfterRetries,

  stepTimeoutMs,
  setStepTimeoutMs,

  workflowTimeoutMs,
  setWorkflowTimeoutMs,

  editingStepId,

  saving,
  publishing,
  error,
  message,

  onSave,
  onPublish,
  onEdit,
  onDelete,
  onCancelEdit,
  onRefresh,
  onClose,
}: {
  automation: Automation;

  steps: AutomationStep[];

  employees: EmployeeRow[];

  loading: boolean;

  stepType: StepType;

  onStepTypeChange: (
    value: StepType
  ) => void;

  stepName: string;

  setStepName: (
    value: string
  ) => void;

  stepEmployeeId: string;

  setStepEmployeeId: (
    value: string
  ) => void;

  stepTaskType: string;

  setStepTaskType: (
    value: string
  ) => void;

  stepActionType: string;

  setStepActionType: (
    value: string
  ) => void;

  stepInstructions: string;

  setStepInstructions: (
    value: string
  ) => void;

  stepRequiresApproval: boolean;

  setStepRequiresApproval: (
    value: boolean
  ) => void;

  stepFailureMode: FailurePolicyMode;

  setStepFailureMode: (
    value: FailurePolicyMode
  ) => void;

  stepMaxAttempts: number;

  setStepMaxAttempts: (
    value: number
  ) => void;

  stepRetryDelayMs: number;

  setStepRetryDelayMs: (
    value: number
  ) => void;

  stepAfterRetries: AfterRetriesMode;

  setStepAfterRetries: (
    value: AfterRetriesMode
  ) => void;

  stepTimeoutMs: number;

  setStepTimeoutMs: (
    value: number
  ) => void;

  workflowTimeoutMs: number;

  setWorkflowTimeoutMs: (
    value: number
  ) => void;

  editingStepId:
    | string
    | null;

  saving: boolean;

  publishing: boolean;

  error: string;

  message: string;

  onSave: () => void;

  onPublish: () => void;

  onEdit: (
    step: AutomationStep
  ) => void;

  onDelete: (
    step: AutomationStep
  ) => void;

  onCancelEdit: () => void;

  onRefresh: () => void;

  onClose: () => void;
}) {
  const trigger =
    triggerOptions.find(
      (
        option
      ) =>
        option.value ===
        automation.trigger_type
    ) ??
    triggerOptions[0];

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 p-3 backdrop-blur-md md:p-5">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0B0F] shadow-2xl shadow-black/70">
        {/* HEADER */}

        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-400">
                J10 Workflow Builder
              </div>

              <StatusBadge
                status={
                  automation.status
                }
              />
            </div>

            <div className="mt-1 truncate text-lg font-semibold text-white">
              {
                automation.name
              }
            </div>

            <div className="mt-1 text-[10px] text-white/30">
              {
                trigger.label
              }
              {" · "}
              {
                steps.length
              }{" "}
              saved step
              {steps.length ===
              1
                ? ""
                : "s"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                onRefresh
              }
              disabled={
                loading
              }
              className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.06] px-3 text-[10px] text-white/40 transition hover:bg-white/[0.04] hover:text-white"
            >
              <RefreshCw
                size={12}
                className={
                  loading
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>

            <button
              type="button"
              onClick={
                onPublish
              }
              disabled={
                loading ||
                publishing ||
                steps.length === 0
              }
              className="flex h-8 items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {publishing ? (
                <Loader2
                  size={12}
                  className="animate-spin"
                />
              ) : (
                <ShieldCheck
                  size={12}
                />
              )}

              {publishing
                ? "Publishing"
                : "Publish"}
            </button>
            <button
              type="button"
              onClick={
                onClose
              }
              disabled={
                saving
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/[0.05] hover:text-white"
            >
              <X
                size={17}
              />
            </button>
          </div>
        </div>

        {/* BODY */}

        <div className="grid flex-1 overflow-hidden xl:grid-cols-[1.2fr_0.8fr]">
          {/* LEFT */}

          <div className="overflow-y-auto border-b border-white/[0.06] p-5 xl:border-b-0 xl:border-r">
            <div className="mb-5">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/25">
                Workflow Chain
              </div>

              <div className="mt-1 text-sm font-semibold text-white">
                Execution Sequence
              </div>
            </div>

            {/* TRIGGER */}

            <WorkflowChainNode
              order="TRIGGER"
              title={
                trigger.label
              }
              subtitle={
                trigger.description
              }
              icon={
                Zap
              }
              accent="violet"
            />

            <ChainConnector />

            {/* STEPS */}

            {loading ? (
              <div className="flex items-center justify-center py-14">
                <Loader2
                  size={20}
                  className="animate-spin text-violet-400"
                />
              </div>
            ) : steps.length ===
              0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] px-5 py-8 text-center">
                <GitBranch
                  size={20}
                  className="mx-auto text-white/20"
                />

                <div className="mt-3 text-xs font-medium text-white/50">
                  No workflow steps
                  yet
                </div>

                <div className="mt-1 text-[10px] text-white/25">
                  Configure your
                  first AI employee
                  or action on the
                  right.
                </div>
              </div>
            ) : (
              steps.map(
                (
                  step,
                  index
                ) => (
                  <div
                    key={
                      step.id
                    }
                  >
                    <SavedStepCard
                      step={
                        step
                      }
                      onEdit={() =>
                        onEdit(
                          step
                        )
                      }
                      onDelete={() =>
                        onDelete(
                          step
                        )
                      }
                    />

                    {index <
                      steps.length -
                        1 && (
                      <ChainConnector />
                    )}
                  </div>
                )
              )
            )}

            {steps.length >
              0 && (
              <>
                <ChainConnector />

                <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                      <CheckCircle2
                        size={14}
                        className="text-white/25"
                      />
                    </div>

                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/20">
                        END
                      </div>

                      <div className="text-[10px] text-white/35">
                        Workflow
                        execution
                        complete
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT */}

          <div
            id="workflow-step-editor"
            className="overflow-y-auto p-5"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-400">
                  {editingStepId
                    ? "Edit Step"
                    : "Add Step"}
                </div>

                <div className="mt-1 text-sm font-semibold text-white">
                  {editingStepId
                    ? "Update Workflow Step"
                    : "Configure Next Step"}
                </div>
              </div>

              {editingStepId && (
                <button
                  type="button"
                  onClick={
                    onCancelEdit
                  }
                  className="text-[10px] text-white/35 transition hover:text-white"
                >
                  Cancel edit
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-[10px] text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-[10px] text-emerald-300">
                {message}
              </div>
            )}

            {/* STEP TYPE */}

            <FieldLabel>
              Step Type
            </FieldLabel>

            <div className="relative">
              <select
                value={stepType}
                onChange={(event) =>
                  onStepTypeChange(
                    event.target.value as StepType
                  )
                }
                className={`h-12 w-full appearance-none rounded-xl border bg-[#101014] px-4 pr-10 text-[11px] font-semibold outline-none transition ${
                  stepType === "approval"
                    ? "border-amber-500/40 text-amber-200 focus:border-amber-400/60"
                    : "border-violet-500/30 text-violet-200 focus:border-violet-400/50"
                }`}
              >
                {stepTypeOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>

              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/35"
              />
            </div>

            <div
              className={`mt-3 rounded-xl border p-3 ${
                stepType === "approval"
                  ? "border-amber-500/25 bg-amber-500/[0.06]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
                Current Step Type
              </div>

              <div
                className={`mt-1 text-[11px] font-semibold ${
                  stepType === "approval"
                    ? "text-amber-200"
                    : "text-violet-300"
                }`}
              >
                {formatStepTypeLabel(stepType)}
              </div>

              <div className="mt-1 text-[9px] leading-4 text-white/25">
                {
                  stepTypeOptions.find(
                    (option) => option.value === stepType
                  )?.description
                }
              </div>
            </div>

            {/* NAME */}

            <div className="mt-5">
              <FieldLabel>
                Step Name
              </FieldLabel>

              <input
                value={
                  stepName
                }
                onChange={(
                  event
                ) =>
                  setStepName(
                    event.target.value
                  )
                }
                placeholder="Example: Research lead company"
                className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-[11px] text-white outline-none placeholder:text-white/20 focus:border-violet-500/35"
              />
            </div>

            {/* EMPLOYEE */}

            {(stepType ===
              "ai_task" ||
              stepType ===
                "action") && (
              <div className="mt-5">
                <FieldLabel>
                  {stepType ===
                  "ai_task"
                    ? "AI Employee — Required"
                    : "AI Employee — Optional"}
                </FieldLabel>

                <div className="relative">
                  <select
                    value={
                      stepEmployeeId
                    }
                    onChange={(
                      event
                    ) =>
                      setStepEmployeeId(
                        event.target.value
                      )
                    }
                    className="h-11 w-full appearance-none rounded-xl border border-white/[0.07] bg-[#101014] px-3 pr-10 text-[11px] text-white outline-none focus:border-violet-500/35"
                  >
                    <option value="">
                      Select AI
                      Employee
                    </option>

                    {employees.map(
                      (
                        employee
                      ) => (
                        <option
                          key={
                            employee.id
                          }
                          value={
                            employee.id
                          }
                        >
                          {
                            employee.name
                          }{" "}
                          —{" "}
                          {
                            employee.role
                          }
                        </option>
                      )
                    )}
                  </select>

                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30"
                  />
                </div>

                {employees.length ===
                  0 && (
                  <div className="mt-2 text-[9px] text-amber-300/60">
                    No AI employees
                    were found.
                  </div>
                )}
              </div>
            )}

            {/* TASK TYPE */}

            {stepType ===
              "ai_task" && (
              <div className="mt-5">
                <FieldLabel>
                  Task Type
                </FieldLabel>

                <div className="relative">
                  <select
                    value={
                      stepTaskType
                    }
                    onChange={(
                      event
                    ) =>
                      setStepTaskType(
                        event.target.value
                      )
                    }
                    className="h-11 w-full appearance-none rounded-xl border border-white/[0.07] bg-[#101014] px-3 pr-10 text-[11px] text-white outline-none focus:border-violet-500/35"
                  >
                    {taskTypeOptions.map(
                      (
                        task
                      ) => (
                        <option
                          key={
                            task.value
                          }
                          value={
                            task.value
                          }
                        >
                          {
                            task.label
                          }
                        </option>
                      )
                    )}
                  </select>

                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30"
                  />
                </div>
              </div>
            )}

            {/* ACTION */}

            {stepType ===
              "action" && (
              <div className="mt-5">
                <FieldLabel>
                  Business Action
                </FieldLabel>

                <div className="relative">
                  <select
                    value={
                      stepActionType
                    }
                    onChange={(
                      event
                    ) =>
                      setStepActionType(
                        event.target.value
                      )
                    }
                    className="h-11 w-full appearance-none rounded-xl border border-white/[0.07] bg-[#101014] px-3 pr-10 text-[11px] text-white outline-none focus:border-violet-500/35"
                  >
                    {actionOptions.map(
                      (
                        action
                      ) => (
                        <option
                          key={
                            action.value
                          }
                          value={
                            action.value
                          }
                        >
                          {
                            action.label
                          }
                        </option>
                      )
                    )}
                  </select>

                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30"
                  />
                </div>
              </div>
            )}

            {/* INSTRUCTIONS */}

            {stepType !==
              "approval" && (
              <div className="mt-5">
                <FieldLabel>
                  {stepType ===
                  "condition"
                    ? "Condition Logic"
                    : stepType ===
                        "activity"
                      ? "Activity Description"
                      : "Instructions"}
                </FieldLabel>

                <textarea
                  value={
                    stepInstructions
                  }
                  onChange={(
                    event
                  ) =>
                    setStepInstructions(
                      event.target.value
                    )
                  }
                  rows={5}
                  placeholder={
                    stepType ===
                    "condition"
                      ? "Example: Continue only if lead score is above 70."
                      : "Describe exactly what this step should do..."
                  }
                  className="w-full resize-none rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-[11px] leading-5 text-white outline-none placeholder:text-white/20 focus:border-violet-500/35"
                />
              </div>
            )}

            {/* APPROVAL */}

            {stepType ===
            "approval" ? (
              <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-amber-300"
                  />

                  <div>
                    <div className="text-[11px] font-semibold text-amber-200">
                      Human Approval
                      Required
                    </div>

                    <div className="mt-1 text-[9px] leading-4 text-amber-100/40">
                      Workflow
                      execution will
                      stop here until
                      an authorized
                      human approves
                      or rejects the
                      action.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <label className="mt-5 flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div>
                  <div className="text-[11px] font-medium text-white/65">
                    Require Human
                    Approval
                  </div>

                  <div className="mt-1 text-[9px] text-white/25">
                    Stop before this
                    step executes.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={
                    stepRequiresApproval
                  }
                  onChange={(
                    event
                  ) =>
                    setStepRequiresApproval(
                      event.target.checked
                    )
                  }
                  className="h-4 w-4 accent-violet-500"
                />
              </label>
            )}

            {/* FAILURE HANDLING */}

            {stepType !==
              "approval" && (
              <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/[0.07]">
                    <RotateCcw
                      size={14}
                      className="text-violet-300"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-violet-400">
                      Failure Handling
                    </div>

                    <div className="mt-1 text-[11px] font-semibold text-white/70">
                      Step Recovery Policy
                    </div>

                    <div className="mt-1 text-[9px] leading-4 text-white/25">
                      Decide what J10 should do when this exact workflow step fails.
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <FieldLabel>
                    On Failure
                  </FieldLabel>

                  <div className="relative">
                    <select
                      value={
                        stepFailureMode
                      }
                      onChange={(
                        event
                      ) =>
                        setStepFailureMode(
                          event.target.value as FailurePolicyMode
                        )
                      }
                      className="h-11 w-full appearance-none rounded-xl border border-white/[0.07] bg-[#101014] px-3 pr-10 text-[11px] text-white outline-none focus:border-violet-500/35"
                    >
                      {failurePolicyOptions.map(
                        (
                          option
                        ) => (
                          <option
                            key={
                              option.value
                            }
                            value={
                              option.value
                            }
                          >
                            {
                              option.label
                            }
                          </option>
                        )
                      )}
                    </select>

                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30"
                    />
                  </div>

                  <div className="mt-2 text-[9px] leading-4 text-white/25">
                    {
                      failurePolicyOptions.find(
                        (
                          option
                        ) =>
                          option.value ===
                          stepFailureMode
                      )?.description
                    }
                  </div>
                </div>

                {stepFailureMode ===
                  "retry" && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label>
                      <span className="mb-1.5 block text-[9px] font-medium text-white/40">
                        Maximum Attempts
                      </span>

                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={
                          stepMaxAttempts
                        }
                        onChange={(
                          event
                        ) =>
                          setStepMaxAttempts(
                            Math.max(
                              1,
                              Math.min(
                                10,
                                Number(
                                  event.target.value
                                ) ||
                                  1
                              )
                            )
                          )
                        }
                        className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#101014] px-3 text-[11px] text-white outline-none focus:border-violet-500/35"
                      />
                    </label>

                    <label>
                      <span className="mb-1.5 block text-[9px] font-medium text-white/40">
                        Retry Delay (ms)
                      </span>

                      <input
                        type="number"
                        min={0}
                        max={60000}
                        step={100}
                        value={
                          stepRetryDelayMs
                        }
                        onChange={(
                          event
                        ) =>
                          setStepRetryDelayMs(
                            Math.max(
                              0,
                              Math.min(
                                60000,
                                Number(
                                  event.target.value
                                ) ||
                                  0
                              )
                            )
                          )
                        }
                        className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#101014] px-3 text-[11px] text-white outline-none focus:border-violet-500/35"
                      />
                    </label>

                    <label className="md:col-span-2">
                      <span className="mb-1.5 block text-[9px] font-medium text-white/40">
                        After Retries Are Exhausted
                      </span>

                      <div className="relative">
                        <select
                          value={
                            stepAfterRetries
                          }
                          onChange={(
                            event
                          ) =>
                            setStepAfterRetries(
                              event.target.value as AfterRetriesMode
                            )
                          }
                          className="h-10 w-full appearance-none rounded-xl border border-white/[0.07] bg-[#101014] px-3 pr-10 text-[11px] text-white outline-none focus:border-violet-500/35"
                        >
                          {afterRetryOptions.map(
                            (
                              option
                            ) => (
                              <option
                                key={
                                  option.value
                                }
                                value={
                                  option.value
                                }
                              >
                                {
                                  option.label
                                }
                              </option>
                            )
                          )}
                        </select>

                        <ChevronDown
                          size={14}
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/30"
                        />
                      </div>
                    </label>
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-blue-500/15 bg-blue-500/[0.035] px-3 py-2.5 text-[8px] leading-4 text-blue-100/35">
                  J10 safety rules still override automatic retry for protected or sensitive business mutations.
                </div>
              </div>
            )}

            {/* EXECUTION GUARDRAILS */}

            {stepType !==
              "approval" && (
              <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/[0.07]">
                    <Gauge
                      size={14}
                      className="text-blue-300"
                    />
                  </div>

                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                      Execution Guardrails
                    </div>

                    <div className="mt-1 text-[11px] font-semibold text-white/70">
                      Timeouts & Stuck-Run Protection
                    </div>

                    <div className="mt-1 text-[9px] leading-4 text-white/25">
                      Prevent a single step or workflow from running indefinitely.
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-[9px] font-medium text-white/40">
                      Step Timeout (ms)
                    </span>

                    <input
                      type="number"
                      min={100}
                      max={120000}
                      step={100}
                      value={
                        stepTimeoutMs
                      }
                      onChange={(
                        event
                      ) =>
                        setStepTimeoutMs(
                          normalizeGuardrailInteger(
                            event.target.value,
                            30000,
                            100,
                            120000
                          )
                        )
                      }
                      className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#101014] px-3 text-[11px] text-white outline-none focus:border-blue-500/35"
                    />
                  </label>

                  <label>
                    <span className="mb-1.5 block text-[9px] font-medium text-white/40">
                      Workflow Max Runtime (ms)
                    </span>

                    <input
                      type="number"
                      min={1000}
                      max={300000}
                      step={1000}
                      value={
                        workflowTimeoutMs
                      }
                      onChange={(
                        event
                      ) =>
                        setWorkflowTimeoutMs(
                          normalizeGuardrailInteger(
                            event.target.value,
                            120000,
                            1000,
                            300000
                          )
                        )
                      }
                      className="h-10 w-full rounded-xl border border-white/[0.07] bg-[#101014] px-3 text-[11px] text-white outline-none focus:border-blue-500/35"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-lg border border-blue-500/15 bg-blue-500/[0.035] px-3 py-2.5 text-[8px] leading-4 text-blue-100/35">
                  Timeout failures use the same J10 policy: Stop, Retry, Continue, or Human Review.
                </div>
              </div>
            )}

            {/* SAVE */}

            <button
              type="button"
              onClick={
                onSave
              }
              disabled={
                saving
              }
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-violet-600 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2
                    size={14}
                    className="animate-spin"
                  />

                  Saving
                </>
              ) : editingStepId ? (
                <>
                  <Save
                    size={14}
                  />

                  Update Step
                </>
              ) : (
                <>
                  <Plus
                    size={14}
                  />

                  Add Step
                </>
              )}
            </button>

            <div className="mt-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-4 py-3 text-[9px] leading-4 text-blue-100/40">
              AI Employee selections
              are saved using the
              exact employee UUID.
              Human approval is
              stored permanently with
              the workflow step.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
============================================================
CHAIN NODE
============================================================
*/

function WorkflowChainNode({
  order,
  title,
  subtitle,
  icon: Icon,
  accent,
}: {
  order: string;
  title: string;
  subtitle: string;
  icon: ElementType;
  accent:
    | "violet"
    | "blue"
    | "amber";
}) {
  const styles = {
    violet:
      "border-violet-500/20 bg-violet-500/[0.05] text-violet-400",

    blue:
      "border-blue-500/20 bg-blue-500/[0.05] text-blue-400",

    amber:
      "border-amber-500/20 bg-amber-500/[0.05] text-amber-300",
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#101014] p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${styles[accent]}`}
        >
          <Icon
            size={15}
          />
        </div>

        <div className="min-w-0">
          <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
            {order}
          </div>

          <div className="mt-1 text-[11px] font-semibold text-white/80">
            {title}
          </div>

          <div className="mt-1 text-[9px] leading-4 text-white/30">
            {subtitle}
          </div>
        </div>
      </div>
    </div>
  );
}

/*
============================================================
SAVED STEP
============================================================
*/

function SavedStepCard({
  step,
  onEdit,
  onDelete,
}: {
  step: AutomationStep;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const info =
    getStepPresentation(
      step
    );

  const Icon =
    info.icon;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#101014] p-4 transition hover:border-white/[0.1]">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${info.style}`}
        >
          <Icon
            size={15}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
              STEP{" "}
              {
                step.step_order
              }
            </div>

            {step.requires_approval && (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-2 py-0.5 text-[7px] font-semibold uppercase tracking-wider text-amber-300">
                Human Approval
              </span>
            )}
          </div>

          <div className="mt-1 text-[11px] font-semibold text-white/80">
            {step.name ||
              info.title}
          </div>

          <div className="mt-1 text-[9px] text-white/30">
            {
              info.subtitle
            }
          </div>

          {step.employee_name && (
            <div className="mt-2 flex items-center gap-1.5 text-[9px] text-blue-300/60">
              <Bot
                size={11}
              />

              {
                step.employee_name
              }
            </div>
          )}

          {step.instructions && (
            <div className="mt-2 line-clamp-2 text-[9px] leading-4 text-white/25">
              {
                step.instructions
              }
            </div>
          )}

          {step.step_type !==
            "approval" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[8px] text-white/25">
              <span>
                Failure:{" "}
                <span className="font-semibold text-white/45">
                  {
                    formatCodeLabel(
                      getSavedFailurePolicy(
                        step
                      ).mode
                    )
                  }
                </span>
              </span>

              {getSavedFailurePolicy(
                step
              ).mode ===
                "retry" && (
                <span className="rounded-full border border-violet-500/15 bg-violet-500/[0.05] px-2 py-0.5 text-violet-300/70">
                  Max{" "}
                  {
                    getSavedFailurePolicy(
                      step
                    ).maxAttempts
                  }{" "}
                  attempts
                </span>
              )}

              <span className="rounded-full border border-blue-500/15 bg-blue-500/[0.045] px-2 py-0.5 text-blue-300/65">
                Timeout{" "}
                {
                  getSavedExecutionGuardrails(
                    step
                  ).stepTimeoutMs
                }
                ms
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={
              onEdit
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 transition hover:bg-white/[0.05] hover:text-white"
          >
            <Pencil
              size={12}
            />
          </button>

          <button
            type="button"
            onClick={
              onDelete
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg text-red-400/40 transition hover:bg-red-500/[0.07] hover:text-red-300"
          >
            <Trash2
              size={12}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function getStepPresentation(
  step: AutomationStep
) {
  if (
    step.step_type ===
    "ai_task"
  ) {
    return {
      title:
        "AI Employee Task",

      subtitle:
        step.task_type
          ? `Task: ${formatCodeLabel(step.task_type)}`
          : "Run AI Employee",

      icon:
        Bot,

      style:
        "border-blue-500/20 bg-blue-500/[0.05] text-blue-400",
    };
  }

  if (
    step.step_type ===
    "condition"
  ) {
    return {
      title:
        "Condition",

      subtitle:
        "Evaluate workflow logic",

      icon:
        GitBranch,

      style:
        "border-cyan-500/20 bg-cyan-500/[0.05] text-cyan-400",
    };
  }

  if (
    step.step_type ===
    "approval"
  ) {
    return {
      title:
        "Human Approval",

      subtitle:
        "Wait for authorization",

      icon:
        ShieldCheck,

      style:
        "border-amber-500/20 bg-amber-500/[0.05] text-amber-300",
    };
  }

  if (
    step.step_type ===
    "activity"
  ) {
    return {
      title:
        "Activity Log",

      subtitle:
        "Record workflow activity",

      icon:
        Activity,

      style:
        "border-white/[0.08] bg-white/[0.04] text-white/40",
    };
  }

  return {
    title:
      "Business Action",

    subtitle:
      step.action_type
        ? formatCodeLabel(
            step.action_type
          )
        : "Execute action",

    icon:
      Sparkles,

    style:
      "border-violet-500/20 bg-violet-500/[0.05] text-violet-400",
  };
}

/*
============================================================
CHAIN CONNECTOR
============================================================
*/

function ChainConnector() {
  return (
    <div className="flex h-8 justify-center">
      <div className="h-full w-px bg-gradient-to-b from-violet-500/30 to-white/[0.08]" />
    </div>
  );
}

/*
============================================================
FIELD LABEL
============================================================
*/

function FieldLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/30">
      {children}
    </div>
  );
}

/*
============================================================
MINI STEP
============================================================
*/

function MiniStep({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0B0B0E] p-3">
      <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
        {label}
      </div>

      <div
        className={`mt-1 text-[10px] font-medium ${
          muted
            ? "text-white/30"
            : "text-white/70"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/*
============================================================
HELPERS
============================================================
*/

function buildJ10FlowGraphFromSavedWorkflow(
  automation: Automation,
  steps: AutomationStep[]
): J10FlowGraph {
  const sortedSteps =
    [...steps].sort(
      (left, right) =>
        left.step_order - right.step_order
    );

  const triggerNodeId =
    `trigger-${automation.id}`;

  const nodes: J10FlowNode[] = [
    {
      id: triggerNodeId,
      kind: "trigger",
      label: formatCodeLabel(automation.trigger_type),
      position: {
        x: 0,
        y: 0,
      },
      enabled: true,
      triggerType: automation.trigger_type,
      triggerConfig: {
        scheduleExpression:
          automation.schedule_expression,
        timezone:
          automation.timezone,
      },
    },
    ...sortedSteps.map((step, index) =>
      buildJ10FlowNodeFromSavedStep(
        step,
        index
      )
    ),
  ];

  const edges =
    sortedSteps.map((step, index) => ({
      id:
        index === 0
          ? `edge-${triggerNodeId}-step-${step.id}`
          : `edge-step-${sortedSteps[index - 1].id}-step-${step.id}`,
      sourceNodeId:
        index === 0
          ? triggerNodeId
          : `step-${sortedSteps[index - 1].id}`,
      targetNodeId:
        `step-${step.id}`,
      kind:
        "next" as const,
    }));

  return {
    version: "2026-08-day16",
    automationId: automation.id,
    name: automation.name,
    description: automation.description,
    nodes,
    edges,
  };
}

function buildJ10FlowNodeFromSavedStep(
  step: AutomationStep,
  index: number
): J10FlowNode {
  const base = {
    id: `step-${step.id}`,
    label:
      step.name ||
      formatStepTypeLabel(step.step_type),
    position: {
      x: 0,
      y: (index + 1) * 140,
    },
    enabled: step.is_enabled,
  };

  if (step.step_type === "ai_task") {
    return {
      ...base,
      kind: "ai_task",
      employeeId: step.employee_id || "",
      taskType: step.task_type || "general",
      instructions: step.instructions || "",
      requiresApproval: step.requires_approval,
      config: step.config,
    };
  }

  if (step.step_type === "approval") {
    return {
      ...base,
      kind: "approval",
      approvalType: "human",
      instructions: step.instructions,
    };
  }

  if (step.step_type === "activity") {
    return {
      ...base,
      kind: "activity",
      instructions: step.instructions || "Record workflow activity.",
      config: step.config,
    };
  }

  return {
    ...base,
    kind: "action",
    actionType:
      (step.action_type || "record_activity") as AutomationActionType,
    employeeId: step.employee_id,
    instructions: step.instructions,
    requiresApproval: step.requires_approval,
    config:
      buildJ10FlowActionConfigFromSavedStep(step),
  } as J10FlowNode;
}

function buildJ10FlowActionConfigFromSavedStep(
  step: AutomationStep
): Record<string, unknown> {
  const baseConfig =
    isRecordValue(step.config)
      ? step.config
      : {};

  const integrationAction =
    isRecordValue(baseConfig.integrationAction)
      ? baseConfig.integrationAction
      : null;

  const capability =
    typeof integrationAction?.capabilityId === "string"
      ? integrationAction.capabilityId.trim()
      : "";

  const provider =
    capability.includes(".")
      ? capability.split(".")[0]
      : "";

  if (
    step.action_type !== "integration_action" ||
    !provider ||
    !capability
  ) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    integration: {
      provider,
      capability,
      connectionId:
        typeof integrationAction?.connectionId === "string"
          ? integrationAction.connectionId
          : null,
      input:
        isRecordValue(baseConfig.input)
          ? baseConfig.input
          : {},
    },
  };
}

function isRecordValue(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    Boolean(value) &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
  );
}

function normalizeGuardrailInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(
        parsed
      )
    )
  );
}

function getSavedExecutionGuardrails(
  step: AutomationStep
) {
  const raw =
    isRecordValue(
      step.config?.executionGuardrails
    )
      ? step.config.executionGuardrails
      : {};

  const stepTimeoutMs =
    normalizeGuardrailInteger(
      raw.stepTimeoutMs,
      30000,
      100,
      120000
    );

  return {
    stepTimeoutMs,

    workflowTimeoutMs:
      Math.max(
        stepTimeoutMs,
        normalizeGuardrailInteger(
          raw.workflowTimeoutMs,
          120000,
          1000,
          300000
        )
      ),
  };
}

function getStepTimeoutDetails(
  step: ExecutionHistoryStep
) {
  const timeout =
    step.inputPayload.timeout;

  if (
    !isRecordValue(
      timeout
    )
  ) {
    return null;
  }

  return {
    scope:
      typeof timeout.scope ===
        "string"
        ? formatCodeLabel(
            timeout.scope
          )
        : "Step",

    label:
      typeof timeout.label ===
        "string"
        ? timeout.label
        : "J10 execution guardrail",

    timeoutMs:
      Number(
        timeout.timeoutMs ??
          0
      ) ||
      0,
  };
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return fallback;
  }

  return Math.max(
    1,
    Math.floor(
      parsed
    )
  );
}

function normalizeNonNegativeInteger(
  value: unknown,
  fallback: number
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.floor(
      parsed
    )
  );
}

function normalizeFailurePolicyMode(
  value: unknown
): FailurePolicyMode {
  return value ===
      "retry" ||
    value ===
      "continue" ||
    value ===
      "human_review"
    ? value
    : "stop";
}

function normalizeAfterRetriesMode(
  value: unknown
): AfterRetriesMode {
  return value ===
      "continue" ||
    value ===
      "human_review"
    ? value
    : "stop";
}

function getSavedFailurePolicy(
  step: AutomationStep
) {
  const raw =
    isRecordValue(
      step.config?.failurePolicy
    )
      ? step.config.failurePolicy
      : {};

  return {
    mode:
      normalizeFailurePolicyMode(
        raw.mode
      ),

    maxAttempts:
      normalizePositiveInteger(
        raw.maxAttempts,
        3
      ),

    retryDelayMs:
      normalizeNonNegativeInteger(
        raw.retryDelayMs,
        0
      ),

    afterRetries:
      normalizeAfterRetriesMode(
        raw.afterRetries
      ),
  };
}

function getStepFailureDetails(
  step: ExecutionHistoryStep
) {
  const failure =
    step.inputPayload.failure;

  if (
    !isRecordValue(
      failure
    )
  ) {
    return {
      message:
        null as string | null,
      resolution:
        null as string | null,
    };
  }

  return {
    message:
      typeof failure.message ===
        "string"
        ? failure.message
        : null,

    resolution:
      typeof failure.resolution ===
        "string"
        ? failure.resolution
        : null,
  };
}

function getRunRetrySummary(
  run: ExecutionHistoryRun
) {
  const retrySteps =
    run.steps.filter(
      (
        step
      ) =>
        Boolean(
          step.retry
        )
    );

  const retryAttempts =
    retrySteps.filter(
      (
        step
      ) =>
        Boolean(
          step.retry?.isRetry
        )
    ).length;

  const highestAttempt =
    retrySteps.reduce(
      (
        highest,
        step
      ) =>
        Math.max(
          highest,
          Number(
            step.retry?.attempt ??
              0
          )
        ),
      0
    );

  const maxAttempts =
    retrySteps.reduce(
      (
        highest,
        step
      ) =>
        Math.max(
          highest,
          Number(
            step.retry?.maxAttempts ??
              0
          )
        ),
      0
    );

  const policy =
    retrySteps.find(
      (
        step
      ) =>
        Boolean(
          step.retry?.policy
        )
    )?.retry?.policy ??
    null;

  const retried =
    retryAttempts > 0 ||
    highestAttempt > 1;

  const recovered =
    retried &&
    run.status.toLowerCase() ===
      "completed" &&
    retrySteps.some(
      (
        step
      ) =>
        Boolean(
          step.retry?.isRetry
        ) &&
        step.status.toLowerCase() ===
          "completed"
    );

  const unrecovered =
    retried &&
    run.status.toLowerCase() ===
      "failed";

  return {
    retried,
    retryAttempts,
    highestAttempt,
    maxAttempts,
    policy,
    recovered,
    unrecovered,
  };
}

function formatCodeLabel(
  value: string
) {
  return value
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      (
        character
      ) =>
        character.toUpperCase()
    );
}


function formatMoney(
  value: number
) {
  const safeValue =
    Number.isFinite(
      value
    )
      ? value
      : 0;

  if (
    safeValue ===
    0
  ) {
    return "$0";
  }

  return `$${safeValue.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatDateTime(
  value:
    | string
    | null
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString();
}

function formatStepTypeLabel(
  value: StepType
) {
  return (
    stepTypeOptions.find(
      (option) => option.value === value
    )?.label ?? formatCodeLabel(value)
  );
}
