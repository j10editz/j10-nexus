export type AutomationStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived";

export type AutomationTriggerType =
  | "manual"
  | "new_crm_contact"
  | "crm_status_changed"
  | "new_ai_task"
  | "ai_task_completed"
  | "schedule"
  | "integration_event";

export type AutomationStepType =
  | "ai_task"
  | "action"
  | "condition"
  | "approval"
  | "activity";

export type AutomationActionType =
  | "run_ai_employee"
  | "analyze_crm"
  | "generate_recommendation"
  | "add_crm_note"
  | "update_crm_status"
  | "run_research"
  | "record_activity"
  | "evaluate_condition"
  | "human_approval"
  | "integration_action";

export type AutomationFailurePolicyMode =
  | "stop"
  | "retry"
  | "continue"
  | "human_review";

export type AutomationAfterRetriesMode =
  | "stop"
  | "continue"
  | "human_review";

export type AutomationTriggerFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal";

export type AutomationTriggerFilterGroupMode =
  | "all"
  | "any";

export type AutomationFailurePolicy = {
  mode: AutomationFailurePolicyMode;
  maxAttempts: number;
  retryDelayMs: number;
  afterRetries: AutomationAfterRetriesMode;
};

export type AutomationExecutionGuardrails = {
  stepTimeoutMs: number;
  workflowTimeoutMs: number;
};