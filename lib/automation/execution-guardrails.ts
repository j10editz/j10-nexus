export type AutomationExecutionGuardrails = {
  stepTimeoutMs: number;
  workflowTimeoutMs: number;
};

export type AutomationTimeoutScope =
  | "step"
  | "workflow";

export type AutomationTimeoutMetadata = {
  code: "J10_AUTOMATION_TIMEOUT";
  scope: AutomationTimeoutScope;
  label: string;
  timeoutMs: number;
  elapsedMs: number;
  occurredAt: string;
};

type DevelopmentTimeoutSimulation = {
  timeoutAttempts: number;
  scope: AutomationTimeoutScope;
  message: string;
};

const DEFAULT_STEP_TIMEOUT_MS = 30_000;
const DEFAULT_WORKFLOW_TIMEOUT_MS = 120_000;
const MIN_STEP_TIMEOUT_MS = 100;
const MAX_STEP_TIMEOUT_MS = 120_000;
const MIN_WORKFLOW_TIMEOUT_MS = 1_000;
const MAX_WORKFLOW_TIMEOUT_MS = 300_000;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    Math.max(
      Math.floor(parsed),
      minimum
    ),
    maximum
  );
}

function normalizeTimeoutScope(
  value: unknown
): AutomationTimeoutScope {
  return value === "workflow"
    ? "workflow"
    : "step";
}

export class AutomationTimeoutError extends Error {
  readonly code = "J10_AUTOMATION_TIMEOUT";
  readonly scope: AutomationTimeoutScope;
  readonly label: string;
  readonly timeoutMs: number;
  readonly elapsedMs: number;

  constructor(args: {
    scope: AutomationTimeoutScope;
    label: string;
    timeoutMs: number;
    elapsedMs: number;
    message?: string;
  }) {
    super(
      args.message ||
        `J10 ${args.scope} timeout: ${args.label} exceeded ${args.timeoutMs}ms.`
    );

    this.name = "AutomationTimeoutError";
    this.scope = args.scope;
    this.label = args.label;
    this.timeoutMs = args.timeoutMs;
    this.elapsedMs = args.elapsedMs;
  }
}

export function getAutomationExecutionGuardrails(
  config: unknown
): AutomationExecutionGuardrails {
  if (!isRecord(config)) {
    return {
      stepTimeoutMs: DEFAULT_STEP_TIMEOUT_MS,
      workflowTimeoutMs: DEFAULT_WORKFLOW_TIMEOUT_MS,
    };
  }

  const raw =
    isRecord(config.executionGuardrails)
      ? config.executionGuardrails
      : {};

  const stepTimeoutMs =
    normalizeInteger(
      raw.stepTimeoutMs,
      DEFAULT_STEP_TIMEOUT_MS,
      MIN_STEP_TIMEOUT_MS,
      MAX_STEP_TIMEOUT_MS
    );

  const workflowTimeoutMs =
    Math.max(
      stepTimeoutMs,
      normalizeInteger(
        raw.workflowTimeoutMs,
        DEFAULT_WORKFLOW_TIMEOUT_MS,
        MIN_WORKFLOW_TIMEOUT_MS,
        MAX_WORKFLOW_TIMEOUT_MS
      )
    );

  return {
    stepTimeoutMs,
    workflowTimeoutMs,
  };
}

function getElapsedMs(
  startedAt: string | number | Date
) {
  const started =
    startedAt instanceof Date
      ? startedAt.getTime()
      : typeof startedAt === "number"
        ? startedAt
        : new Date(startedAt).getTime();

  return Number.isFinite(started)
    ? Math.max(0, Date.now() - started)
    : 0;
}

export function assertWorkflowWithinDeadline(args: {
  runStartedAt: string | number | Date;
  guardrails: AutomationExecutionGuardrails;
  label?: string;
}) {
  const elapsedMs =
    getElapsedMs(args.runStartedAt);

  if (
    elapsedMs >=
    args.guardrails.workflowTimeoutMs
  ) {
    throw new AutomationTimeoutError({
      scope: "workflow",
      label:
        args.label ||
        "Workflow execution",
      timeoutMs:
        args.guardrails.workflowTimeoutMs,
      elapsedMs,
    });
  }
}

function getRemainingBudget(args: {
  runStartedAt: string | number | Date;
  stepStartedAtMs: number;
  guardrails: AutomationExecutionGuardrails;
}) {
  const workflowElapsed =
    getElapsedMs(args.runStartedAt);

  const stepElapsed =
    Math.max(
      0,
      Date.now() -
        args.stepStartedAtMs
    );

  const workflowRemaining =
    args.guardrails.workflowTimeoutMs -
    workflowElapsed;

  const stepRemaining =
    args.guardrails.stepTimeoutMs -
    stepElapsed;

  if (workflowRemaining <= 0) {
    throw new AutomationTimeoutError({
      scope: "workflow",
      label: "Workflow execution",
      timeoutMs:
        args.guardrails.workflowTimeoutMs,
      elapsedMs:
        workflowElapsed,
    });
  }

  if (stepRemaining <= 0) {
    throw new AutomationTimeoutError({
      scope: "step",
      label: "Workflow step",
      timeoutMs:
        args.guardrails.stepTimeoutMs,
      elapsedMs:
        stepElapsed,
    });
  }

  if (workflowRemaining <= stepRemaining) {
    return {
      timeoutMs: workflowRemaining,
      scope: "workflow" as const,
      elapsedMs: workflowElapsed,
    };
  }

  return {
    timeoutMs: stepRemaining,
    scope: "step" as const,
    elapsedMs: stepElapsed,
  };
}

export async function withAutomationTimeout<T>(
  operation: () => Promise<T>,
  args: {
    runStartedAt: string | number | Date;
    stepStartedAtMs: number;
    guardrails: AutomationExecutionGuardrails;
    label: string;
  }
): Promise<T> {
  const budget =
    getRemainingBudget(args);

  let timer:
    ReturnType<typeof setTimeout> | null =
    null;

  try {
    return await Promise.race([
      operation(),
      new Promise<T>(
        (_resolve, reject) => {
          timer = setTimeout(
            () => {
              reject(
                new AutomationTimeoutError({
                  scope: budget.scope,
                  label: args.label,
                  timeoutMs:
                    budget.timeoutMs,
                  elapsedMs:
                    budget.elapsedMs +
                    budget.timeoutMs,
                })
              );
            },
            budget.timeoutMs
          );
        }
      ),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function getAutomationTimeoutMetadata(
  error: unknown
): AutomationTimeoutMetadata | null {
  if (
    !(error instanceof AutomationTimeoutError)
  ) {
    return null;
  }

  return {
    code: error.code,
    scope: error.scope,
    label: error.label,
    timeoutMs: error.timeoutMs,
    elapsedMs: error.elapsedMs,
    occurredAt: new Date().toISOString(),
  };
}

function normalizeDevelopmentTimeoutSimulation(
  value: unknown
): DevelopmentTimeoutSimulation | null {
  if (!isRecord(value)) {
    return null;
  }

  const timeoutAttempts =
    normalizeInteger(
      value.timeoutAttempts,
      0,
      0,
      10
    );

  if (timeoutAttempts <= 0) {
    return null;
  }

  const scope =
    normalizeTimeoutScope(
      value.scope
    );

  const message =
    typeof value.message === "string" &&
    value.message.trim()
      ? value.message.trim()
      : `J10 development ${scope} timeout simulation.`;

  return {
    timeoutAttempts,
    scope,
    message,
  };
}

export function shouldSimulateDevelopmentTimeout(args: {
  config: unknown;
  attempt: number;
  executionMode:
    | string
    | null
    | undefined;
  guardrails: AutomationExecutionGuardrails;
}) {
  const normalizedMode =
    String(
      args.executionMode ??
        "development"
    )
      .trim()
      .toLowerCase();

  /*
  Only explicit live mode disables the development simulator.
  This mirrors J10's safe runtime rule: everything other than
  exact "live" remains development-safe.
  */
  if (
    normalizedMode ===
    "live"
  ) {
    return null;
  }

  if (!isRecord(args.config)) {
    return null;
  }

  const simulationSource =
    args.config
      .developmentTimeoutSimulation ??
    args.config
      .development_timeout_simulation;

  const simulation =
    normalizeDevelopmentTimeoutSimulation(
      simulationSource
    );

  if (
    !simulation ||
    args.attempt >
      simulation.timeoutAttempts
  ) {
    return null;
  }

  const timeoutMs =
    simulation.scope ===
    "workflow"
      ? args.guardrails.workflowTimeoutMs
      : args.guardrails.stepTimeoutMs;

  return new AutomationTimeoutError({
    scope:
      simulation.scope,

    label:
      simulation.scope ===
      "workflow"
        ? "Development workflow timeout simulation"
        : "Development step timeout simulation",

    timeoutMs,

    elapsedMs:
      timeoutMs,

    message:
      simulation.message,
  });
}