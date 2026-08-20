export type WorkflowContextStepOutput = {
  stepId: string;
  stepOrder: number;
  stepName: string | null;
  stepType: string;
  actionType: string | null;
  status: string;
  employeeId: string | null;
  employeeName: string | null;
  aiTaskId: string | null;
  resultText: string | null;
  resultData: Record<string, unknown>;
  data: Record<string, unknown>;
  completedAt: string | null;
};

export type WorkflowContext = {
  trigger: Record<string, unknown>;
  workflow: {
    id: string;
    name: string;
    triggerType: string;
  };
  execution: {
    id: string;
    mode: string;
    startedAt: string | null;
  };
  steps: Record<string, WorkflowContextStepOutput>;
  variables: Record<string, unknown>;
};

export type WorkflowCollaborationStep = {
  stepOrder: number;
  stepName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  aiTaskId: string | null;
  resultText: string | null;
  data: Record<string, unknown>;
};

export type WorkflowCollaborator = {
  employeeId: string | null;
  employeeName: string;
  stepOrders: number[];
};

export type WorkflowCollaborationSnapshot = {
  aiStepCount: number;
  collaboratorCount: number;
  collaborators: WorkflowCollaborator[];
  latestAI: WorkflowCollaborationStep | null;
  chain: WorkflowCollaborationStep[];
};

export type WorkflowContextAutomation = {
  id: string;
  name: string;
  triggerType: string;
};

export type WorkflowContextRun = {
  id: string;
  executionMode: string;
  startedAt: string | null;
};

export type PersistedRunStepLike = {
  automation_step_id?: string | null;
  step_order: number;
  step_type: string;
  action_type?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  ai_task_id?: string | null;
  status: string;
  input_payload?: Record<string, unknown> | null;
};

const MAX_STRUCTURED_DEPTH = 8;
const MAX_STRUCTURED_ARRAY_ITEMS = 100;
const MAX_STRUCTURED_OBJECT_KEYS = 100;

const RESERVED_WORKFLOW_VARIABLE_KEYS = new Set([
  "workflowId",
  "workflowName",
  "triggerType",
  "executionId",
  "executionMode",
  "executionStartedAt",
  "lastStepOrder",
  "lastStepName",
  "lastStepType",
  "lastActionType",
  "lastResult",
  "lastEmployee",
  "lastEmployeeId",
  "lastData",
  "lastAIEmployee",
  "lastAIEmployeeId",
  "lastAIResult",
  "lastAIData",
  "aiCollaboratorCount",
  "aiCollaborators",
]);

export function createWorkflowContext(args: {
  triggerPayload?: Record<string, unknown> | null;
  automation: WorkflowContextAutomation;
  run: WorkflowContextRun;
}): WorkflowContext {
  const context: WorkflowContext = {
    trigger: args.triggerPayload ?? {},
    workflow: {
      id: args.automation.id,
      name: args.automation.name,
      triggerType: args.automation.triggerType,
    },
    execution: {
      id: args.run.id,
      mode: args.run.executionMode,
      startedAt: args.run.startedAt,
    },
    steps: {},
    variables: {},
  };

  syncWorkflowRuntimeVariables(context);

  return context;
}

export function cloneWorkflowContext(
  context: WorkflowContext
): WorkflowContext {
  return JSON.parse(
    JSON.stringify(context)
  ) as WorkflowContext;
}

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeStructuredValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    depth >= MAX_STRUCTURED_DEPTH ||
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const normalized = value
      .slice(0, MAX_STRUCTURED_ARRAY_ITEMS)
      .map((item) =>
        normalizeStructuredValue(
          item,
          depth + 1,
          seen
        )
      );

    seen.delete(value);
    return normalized;
  }

  const entries = Object.entries(
    value as Record<string, unknown>
  ).slice(0, MAX_STRUCTURED_OBJECT_KEYS);

  const normalized: Record<string, unknown> = {};

  for (const [key, child] of entries) {
    normalized[key] = normalizeStructuredValue(
      child,
      depth + 1,
      seen
    );
  }

  seen.delete(value);
  return normalized;
}

export function normalizeStructuredResultData(
  value: unknown
): Record<string, unknown> {
  const normalized = normalizeStructuredValue(
    value,
    0,
    new WeakSet<object>()
  );

  return asRecord(normalized) ?? {};
}

function tryParseJsonObject(
  value: string
): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function extractMarkedJson(
  text: string
): Record<string, unknown> | null {
  const markerMatch = text.match(
    /J10_STRUCTURED_RESULT\s*\n+```(?:json)?\s*\n([\s\S]*?)\n```/i
  );

  if (markerMatch?.[1]) {
    return tryParseJsonObject(
      markerMatch[1].trim()
    );
  }

  const genericFenceMatch = text.match(
    /```json\s*\n([\s\S]*?)\n```/i
  );

  if (genericFenceMatch?.[1]) {
    return tryParseJsonObject(
      genericFenceMatch[1].trim()
    );
  }

  const trimmed = text.trim();

  if (
    trimmed.startsWith("{") &&
    trimmed.endsWith("}")
  ) {
    return tryParseJsonObject(trimmed);
  }

  return null;
}

function extractReportSection(
  text: string,
  heading: string,
  nextHeadings: string[]
) {
  const escapedHeading = heading.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const escapedNext = nextHeadings
    .map((item) =>
      item.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )
    )
    .join("|");

  const endPattern = escapedNext
    ? `(?=\\n\\s*(?:${escapedNext})\\s*\\n|$)`
    : "(?=$)";

  const match = text.match(
    new RegExp(
      `(?:^|\\n)\\s*${escapedHeading}\\s*\\n+([\\s\\S]*?)${endPattern}`,
      "i"
    )
  );

  return match?.[1]?.trim() ?? "";
}

function extractLegacyDevelopmentResearchData(
  text: string
): Record<string, unknown> | null {
  if (
    !/J10 AI RESEARCH ASSISTANT/i.test(text) ||
    !/DEVELOPMENT RESEARCH REPORT/i.test(text)
  ) {
    return null;
  }

  const headings = [
    "OBJECTIVE",
    "AVAILABLE BUSINESS CONTEXT",
    "RESEARCH STATUS",
    "COMPETITIVE RESEARCH FRAMEWORK",
    "J10 NEXUS DIFFERENTIATION AREAS TO TEST",
    "FIVE-COMPETITOR RESEARCH MATRIX",
    "RECOMMENDED NEXT RESEARCH ACTION",
    "EXECUTION INFORMATION",
  ];

  const taskTitle = extractReportSection(
    text,
    "TASK",
    headings
  );

  const objective = extractReportSection(
    text,
    "OBJECTIVE",
    headings.slice(1)
  );

  const businessContext = extractReportSection(
    text,
    "AVAILABLE BUSINESS CONTEXT",
    headings.slice(2)
  );

  const recommendedAction = extractReportSection(
    text,
    "RECOMMENDED NEXT RESEARCH ACTION",
    ["EXECUTION INFORMATION"]
  );

  return {
    schemaVersion: "j10.structured-result.v1",
    resultType: "research",
    taskTitle,
    objective,
    businessContext,
    researchStatus: "completed",
    sourceMode: "development",
    externalWebResearch: false,
    apiCalled: false,
    apiCostUSD: 0,
    resultSource: "deterministic_research_engine",
    recommendedAction,
  };
}

export function extractStructuredResultData(
  resultText: string | null | undefined
): Record<string, unknown> {
  if (!resultText?.trim()) {
    return {};
  }

  const marked = extractMarkedJson(resultText);

  if (marked) {
    return normalizeStructuredResultData(marked);
  }

  const legacyResearch =
    extractLegacyDevelopmentResearchData(resultText);

  if (legacyResearch) {
    return normalizeStructuredResultData(
      legacyResearch
    );
  }

  return {
    schemaVersion: "j10.structured-result.v1",
    resultType: "text",
    structured: false,
  };
}

function findLatestWorkflowStepOutput(
  context: WorkflowContext
): WorkflowContextStepOutput | null {
  const outputs = Object.values(context.steps);

  if (outputs.length === 0) {
    return null;
  }

  return outputs.reduce<WorkflowContextStepOutput | null>(
    (latest, current) => {
      if (!latest) {
        return current;
      }

      return current.stepOrder > latest.stepOrder
        ? current
        : latest;
    },
    null
  );
}


function isAIWorkflowStepOutput(
  output: WorkflowContextStepOutput
) {
  return (
    output.stepType === "ai_task" ||
    output.actionType === "run_ai_employee"
  );
}

function findLatestAIWorkflowStepOutput(
  context: WorkflowContext
): WorkflowContextStepOutput | null {
  const aiOutputs = Object.values(
    context.steps
  )
    .filter(
      isAIWorkflowStepOutput
    )
    .sort(
      (a, b) =>
        a.stepOrder - b.stepOrder
    );

  return aiOutputs.at(-1) ?? null;
}

export function buildWorkflowCollaborationSnapshot(
  context: WorkflowContext
): WorkflowCollaborationSnapshot {
  const chain: WorkflowCollaborationStep[] =
    Object.values(
      context.steps
    )
      .filter(
        isAIWorkflowStepOutput
      )
      .sort(
        (a, b) =>
          a.stepOrder - b.stepOrder
      )
      .map(
        (output) => ({
          stepOrder:
            output.stepOrder,
          stepName:
            output.stepName,
          employeeId:
            output.employeeId,
          employeeName:
            output.employeeName,
          aiTaskId:
            output.aiTaskId,
          resultText:
            output.resultText,
          data:
            normalizeStructuredResultData(
              output.data ??
                output.resultData ??
                {}
            ),
        })
      );

  const collaboratorMap =
    new Map<
      string,
      WorkflowCollaborator
    >();

  for (const step of chain) {
    const key =
      step.employeeId ??
      step.employeeName ??
      `step-${step.stepOrder}`;

    const existing =
      collaboratorMap.get(
        key
      );

    if (existing) {
      existing.stepOrders.push(
        step.stepOrder
      );
      continue;
    }

    collaboratorMap.set(
      key,
      {
        employeeId:
          step.employeeId,
        employeeName:
          step.employeeName ??
          "Unknown AI Employee",
        stepOrders: [
          step.stepOrder,
        ],
      }
    );
  }

  return {
    aiStepCount:
      chain.length,
    collaboratorCount:
      collaboratorMap.size,
    collaborators:
      Array.from(
        collaboratorMap.values()
      ),
    latestAI:
      chain.at(-1) ??
      null,
    chain,
  };
}

function syncWorkflowRuntimeVariables(
  context: WorkflowContext,
  latestOutput?: WorkflowContextStepOutput | null
) {
  const latest =
    latestOutput === undefined
      ? findLatestWorkflowStepOutput(context)
      : latestOutput;

  context.variables.workflowId = context.workflow.id;
  context.variables.workflowName = context.workflow.name;
  context.variables.triggerType = context.workflow.triggerType;

  context.variables.executionId = context.execution.id;
  context.variables.executionMode = context.execution.mode;
  context.variables.executionStartedAt =
    context.execution.startedAt;

  context.variables.lastStepOrder =
    latest?.stepOrder ?? null;
  context.variables.lastStepName =
    latest?.stepName ?? null;
  context.variables.lastStepType =
    latest?.stepType ?? null;
  context.variables.lastActionType =
    latest?.actionType ?? null;
  context.variables.lastResult =
    latest?.resultText ?? null;
  context.variables.lastEmployee =
    latest?.employeeName ?? null;
  context.variables.lastEmployeeId =
    latest?.employeeId ?? null;
  context.variables.lastData =
    normalizeStructuredResultData(
      latest?.data ??
        latest?.resultData ??
        {}
    );

  const latestAI =
    findLatestAIWorkflowStepOutput(
      context
    );

  const collaboration =
    buildWorkflowCollaborationSnapshot(
      context
    );

  context.variables.lastAIEmployee =
    latestAI?.employeeName ?? null;

  context.variables.lastAIEmployeeId =
    latestAI?.employeeId ?? null;

  context.variables.lastAIResult =
    latestAI?.resultText ?? null;

  context.variables.lastAIData =
    normalizeStructuredResultData(
      latestAI?.data ??
        latestAI?.resultData ??
        {}
    );

  context.variables.aiCollaboratorCount =
    collaboration.collaboratorCount;

  context.variables.aiCollaborators =
    collaboration.collaborators.map(
      (item) => ({
        employeeId:
          item.employeeId,
        employeeName:
          item.employeeName,
        stepOrders:
          item.stepOrders,
      })
    );

  return context;
}

function normalizeWorkflowVariableValue(
  value: unknown
): unknown {
  return normalizeStructuredValue(
    value,
    0,
    new WeakSet<object>()
  );
}

export function setWorkflowVariable(
  context: WorkflowContext,
  key: string,
  value: unknown
) {
  const normalizedKey = key.trim();

  if (
    !normalizedKey ||
    RESERVED_WORKFLOW_VARIABLE_KEYS.has(
      normalizedKey
    )
  ) {
    return context;
  }

  context.variables[normalizedKey] =
    normalizeWorkflowVariableValue(value);

  return context;
}

export function setWorkflowVariables(
  context: WorkflowContext,
  variables: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(variables)) {
    setWorkflowVariable(
      context,
      key,
      value
    );
  }

  return context;
}

function restorePersistedCustomVariables(
  context: WorkflowContext,
  runSteps: PersistedRunStepLike[]
) {
  for (const step of runSteps) {
    const payload =
      asRecord(step.input_payload);

    const persistedContext =
      asRecord(
        payload?.workflow_context
      );

    const persistedVariables =
      asRecord(
        persistedContext?.variables
      );

    if (!persistedVariables) {
      continue;
    }

    for (
      const [key, value] of
      Object.entries(
        persistedVariables
      )
    ) {
      if (
        RESERVED_WORKFLOW_VARIABLE_KEYS.has(
          key
        )
      ) {
        continue;
      }

      context.variables[key] =
        normalizeWorkflowVariableValue(
          value
        );
    }
  }

  return context;
}

export function setWorkflowStepOutput(
  context: WorkflowContext,
  output: WorkflowContextStepOutput
) {
  const key = String(output.stepOrder);

  context.steps[key] = output;

  syncWorkflowRuntimeVariables(
    context,
    output
  );

  return context;
}

export function getPersistedWorkflowStepOutput(
  inputPayload: Record<string, unknown> | null | undefined
): WorkflowContextStepOutput | null {
  const payload = asRecord(inputPayload);

  if (!payload) {
    return null;
  }

  const output = asRecord(payload.output);

  if (!output) {
    return null;
  }

  const stepOrder = Number(output.stepOrder);

  if (!Number.isFinite(stepOrder)) {
    return null;
  }

  const persistedData =
    normalizeStructuredResultData(
      output.data ?? output.resultData ?? {}
    );

  return {
    stepId: String(output.stepId ?? ""),
    stepOrder,
    stepName:
      typeof output.stepName === "string"
        ? output.stepName
        : null,
    stepType: String(output.stepType ?? "unknown"),
    actionType:
      typeof output.actionType === "string"
        ? output.actionType
        : null,
    status: String(output.status ?? "completed"),
    employeeId:
      typeof output.employeeId === "string"
        ? output.employeeId
        : null,
    employeeName:
      typeof output.employeeName === "string"
        ? output.employeeName
        : null,
    aiTaskId:
      typeof output.aiTaskId === "string"
        ? output.aiTaskId
        : null,
    resultText:
      typeof output.resultText === "string"
        ? output.resultText
        : null,
    resultData: persistedData,
    data: persistedData,
    completedAt:
      typeof output.completedAt === "string"
        ? output.completedAt
        : null,
  };
}

export function rebuildWorkflowContext(args: {
  triggerPayload?: Record<string, unknown> | null;
  automation: WorkflowContextAutomation;
  run: WorkflowContextRun;
  runSteps: PersistedRunStepLike[];
}): WorkflowContext {
  const context = createWorkflowContext({
    triggerPayload: args.triggerPayload,
    automation: args.automation,
    run: args.run,
  });

  const ordered = [...args.runSteps].sort(
    (a, b) => a.step_order - b.step_order
  );

  restorePersistedCustomVariables(
    context,
    ordered
  );

  for (const step of ordered) {
    const persisted = getPersistedWorkflowStepOutput(
      step.input_payload
    );

    if (persisted) {
      setWorkflowStepOutput(context, persisted);
      continue;
    }

    if (step.status === "completed") {
      const emptyData: Record<string, unknown> = {};

      setWorkflowStepOutput(context, {
        stepId: step.automation_step_id ?? "",
        stepOrder: step.step_order,
        stepName: null,
        stepType: step.step_type,
        actionType: step.action_type ?? null,
        status: step.status,
        employeeId: step.employee_id ?? null,
        employeeName: step.employee_name ?? null,
        aiTaskId: step.ai_task_id ?? null,
        resultText: null,
        resultData: emptyData,
        data: emptyData,
        completedAt: null,
      });
    }
  }

  syncWorkflowRuntimeVariables(
    context
  );

  return context;
}

function tokenizePath(path: string) {
  return path
    .trim()
    .replace(/^\{\{/, "")
    .replace(/\}\}$/, "")
    .trim()
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function getWorkflowContextValue(
  context: WorkflowContext,
  path: string
): unknown {
  const parts = tokenizePath(path);

  if (parts.length === 0) {
    return undefined;
  }

  let current: unknown = context;

  for (const part of parts) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return undefined;
    }

    const record = current as Record<string, unknown>;

    if (
      part === "data" &&
      !("data" in record) &&
      "resultData" in record
    ) {
      current = record.resultData;
      continue;
    }

    if (
      part === "result" &&
      !("result" in record) &&
      "resultText" in record
    ) {
      current = record.resultText;
      continue;
    }

    current = record[part];
  }

  return current;
}

export function hasWorkflowContextValue(
  context: WorkflowContext,
  path: string
) {
  return (
    getWorkflowContextValue(
      context,
      path
    ) !== undefined
  );
}

function stringifyContextValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function interpolateWorkflowTemplate(
  template: string | null | undefined,
  context: WorkflowContext
) {
  if (!template) {
    return template ?? null;
  }

  return template.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (_match, path: string) => {
      return stringifyContextValue(
        getWorkflowContextValue(context, path)
      );
    }
  );
}

export function buildWorkflowTaskInput(
  context: WorkflowContext
) {
  const collaboration =
    buildWorkflowCollaborationSnapshot(
      context
    );

  return JSON.stringify(
    {
      trigger:
        context.trigger,

      workflow:
        context.workflow,

      execution:
        context.execution,

      previousSteps:
        context.steps,

      variables:
        context.variables,

      collaboration: {
        purpose:
          "J10 multi-AI employee collaboration context",

        aiStepCount:
          collaboration.aiStepCount,

        collaboratorCount:
          collaboration.collaboratorCount,

        collaborators:
          collaboration.collaborators,

        latestAI:
          collaboration.latestAI,

        chain:
          collaboration.chain,
      },
    },
    null,
    2
  );
}

export function createWorkflowStepOutput(args: {
  stepId: string;
  stepOrder: number;
  stepName: string | null;
  stepType: string;
  actionType?: string | null;
  status?: string;
  employeeId?: string | null;
  employeeName?: string | null;
  aiTaskId?: string | null;
  resultText?: string | null;
  resultData?: Record<string, unknown> | null;
}): WorkflowContextStepOutput {
  const callerData = normalizeStructuredResultData(
    args.resultData ?? {}
  );

  const extractedData = extractStructuredResultData(
    args.resultText
  );

  const combinedData = normalizeStructuredResultData({
    ...callerData,
    ...extractedData,
  });

  return {
    stepId: args.stepId,
    stepOrder: args.stepOrder,
    stepName: args.stepName,
    stepType: args.stepType,
    actionType: args.actionType ?? null,
    status: args.status ?? "completed",
    employeeId: args.employeeId ?? null,
    employeeName: args.employeeName ?? null,
    aiTaskId: args.aiTaskId ?? null,
    resultText: args.resultText ?? null,
    resultData: combinedData,
    data: combinedData,
    completedAt: new Date().toISOString(),
  };
}