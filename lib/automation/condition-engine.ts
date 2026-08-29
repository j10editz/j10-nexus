/*
============================================================
J10 AUTOMATION CONDITION ENGINE
13E — CONTEXT-AWARE TARGETED BRANCHING

Safe deterministic condition evaluation.
No eval(), no arbitrary JavaScript execution.

Context sources:
- trigger.*
- workflow.*
- execution.*
- steps.*
- variables.*

Legacy branch actions remain supported:
- continue
- stop
- skip_next

13E targeted branch example:
{
  "field": "steps.1.data.qualificationScore",
  "operator": "greater_than_or_equal",
  "value": 70,
  "onTrueStep": 4,
  "onFalseStep": 6
}

The execution routes validate that targeted steps:
- exist
- are enabled
- are forward-only
============================================================
*/

import {
  getWorkflowContextValue,
  type WorkflowContext,
} from "@/lib/automation/workflow-context";

export type ConditionBranchAction =
  | "continue"
  | "stop"
  | "skip_next";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "not_exists"
  | "truthy"
  | "falsy";

export type ConditionRuntimeContext =
  WorkflowContext;

export type ConditionEvaluation = {
  expression: string;
  field: string;
  operator: ConditionOperator;
  expectedValue: unknown;
  actualValue: unknown;
  matched: boolean;

  branchAction: ConditionBranchAction;

  branchTargetStepOrder:
    | number
    | null;

  onTrue: ConditionBranchAction;
  onFalse: ConditionBranchAction;

  onTrueStep:
    | number
    | null;

  onFalseStep:
    | number
    | null;
};

type ParsedCondition = {
  field: string;
  operator: ConditionOperator;
  value?: unknown;

  onTrue: ConditionBranchAction;
  onFalse: ConditionBranchAction;

  onTrueStep:
    | number
    | null;

  onFalseStep:
    | number
    | null;
};

type JsonConditionInput = {
  field?: unknown;
  operator?: unknown;
  value?: unknown;

  onTrue?: unknown;
  onFalse?: unknown;

  onTrueStep?: unknown;
  onFalseStep?: unknown;

  on_true_step?: unknown;
  on_false_step?: unknown;
};

const BRANCH_ACTIONS =
  new Set<ConditionBranchAction>([
    "continue",
    "stop",
    "skip_next",
  ]);

const OPERATOR_ALIASES: Record<
  string,
  ConditionOperator
> = {
  "=": "equals",
  "==": "equals",
  "===": "equals",
  eq: "equals",
  equals: "equals",

  "!=": "not_equals",
  "!==": "not_equals",
  neq: "not_equals",
  not_equals: "not_equals",

  contains: "contains",
  not_contains: "not_contains",
  starts_with: "starts_with",
  ends_with: "ends_with",

  ">": "gt",
  gt: "gt",
  greater_than: "gt",

  ">=": "gte",
  gte: "gte",
  greater_than_or_equal: "gte",
  greater_than_or_equals: "gte",

  "<": "lt",
  lt: "lt",
  less_than: "lt",

  "<=": "lte",
  lte: "lte",
  less_than_or_equal: "lte",
  less_than_or_equals: "lte",

  exists: "exists",
  not_exists: "not_exists",

  truthy: "truthy",
  falsy: "falsy",
};

/*
============================================================
PUBLIC API
============================================================
*/

export function evaluateAutomationCondition({
  instructions,
  context,
}: {
  instructions:
    | string
    | null
    | undefined;

  context:
    ConditionRuntimeContext;
}): ConditionEvaluation {
  const expression =
    instructions?.trim() ?? "";

  if (!expression) {
    throw new Error(
      "Condition step requires an expression in Instructions."
    );
  }

  const parsed =
    parseCondition(
      expression
    );

  const rawActualValue =
    getWorkflowContextValue(
      context,
      parsed.field
    );

  const actualValue =
    rawActualValue ===
    undefined
      ? null
      : rawActualValue;

  const expectedValue =
    resolveExpectedValue(
      parsed.value,
      context
    );

  const matched =
    evaluateOperator(
      actualValue,
      parsed.operator,
      expectedValue
    );

  const selectedTarget =
    matched
      ? parsed.onTrueStep
      : parsed.onFalseStep;

  /*
  A targeted branch overrides the legacy branch action for that
  branch. Runtime will move forward to the selected target.
  */
  const branchAction =
    selectedTarget !== null
      ? "continue"
      : matched
        ? parsed.onTrue
        : parsed.onFalse;

  return {
    expression,

    field:
      parsed.field,

    operator:
      parsed.operator,

    expectedValue:
      expectedValue ??
      null,

    actualValue,

    matched,

    branchAction,

    branchTargetStepOrder:
      selectedTarget,

    onTrue:
      parsed.onTrue,

    onFalse:
      parsed.onFalse,

    onTrueStep:
      parsed.onTrueStep,

    onFalseStep:
      parsed.onFalseStep,
  };
}

/*
============================================================
PARSER
============================================================
*/

function parseCondition(
  expression: string
): ParsedCondition {
  if (
    expression.startsWith(
      "{"
    )
  ) {
    return parseJsonCondition(
      expression
    );
  }

  return parseShorthandCondition(
    expression
  );
}

function parseJsonCondition(
  expression: string
): ParsedCondition {
  let parsed:
    JsonConditionInput;

  try {
    parsed =
      JSON.parse(
        expression
      ) as JsonConditionInput;
  } catch {
    throw new Error(
      "Condition JSON is invalid."
    );
  }

  const field =
    normalizeFieldPath(
      parsed.field
    );

  if (!field) {
    throw new Error(
      "Condition JSON requires a field."
    );
  }

  const operator =
    normalizeOperator(
      parsed.operator
    );

  const onTrue =
    normalizeBranchAction(
      parsed.onTrue,
      "continue"
    );

  const onFalse =
    normalizeBranchAction(
      parsed.onFalse,
      "stop"
    );

  const onTrueStep =
    normalizeTargetStep(
      parsed.onTrueStep ??
      parsed.on_true_step,
      "onTrueStep"
    );

  const onFalseStep =
    normalizeTargetStep(
      parsed.onFalseStep ??
      parsed.on_false_step,
      "onFalseStep"
    );

  return {
    field,
    operator,

    value:
      parsed.value,

    onTrue,
    onFalse,

    onTrueStep,
    onFalseStep,
  };
}

function parseShorthandCondition(
  expression: string
): ParsedCondition {
  const normalizedExpression =
    stripMustachePaths(
      expression
    );

  const prefixMatch =
    normalizedExpression.match(
      /^(exists|not_exists|truthy|falsy)\s+([A-Za-z0-9_.-]+)$/i
    );

  if (prefixMatch) {
    return {
      field:
        normalizeFieldPath(
          prefixMatch[2]
        ),

      operator:
        normalizeOperator(
          prefixMatch[1]
        ),

      value:
        undefined,

      onTrue:
        "continue",

      onFalse:
        "stop",

      onTrueStep:
        null,

      onFalseStep:
        null,
    };
  }

  const wordOperatorMatch =
    normalizedExpression.match(
      /^([A-Za-z0-9_.-]+)\s+(contains|not_contains|starts_with|ends_with|equals|not_equals|greater_than_or_equal|greater_than_or_equals|greater_than|less_than_or_equal|less_than_or_equals|less_than|gte|gt|lte|lt|eq|neq)\s+(.+)$/i
    );

  if (
    wordOperatorMatch
  ) {
    return {
      field:
        normalizeFieldPath(
          wordOperatorMatch[1]
        ),

      operator:
        normalizeOperator(
          wordOperatorMatch[2]
        ),

      value:
        parseLiteral(
          wordOperatorMatch[3]
        ),

      onTrue:
        "continue",

      onFalse:
        "stop",

      onTrueStep:
        null,

      onFalseStep:
        null,
    };
  }

  const comparisonMatch =
    normalizedExpression.match(
      /^([A-Za-z0-9_.-]+)\s*(===|!==|==|!=|>=|<=|>|<|=)\s*(.+)$/
    );

  if (
    !comparisonMatch
  ) {
    throw new Error(
      'Unsupported condition expression. Example: steps.1.data.qualificationScore >= 70'
    );
  }

  return {
    field:
      normalizeFieldPath(
        comparisonMatch[1]
      ),

    operator:
      normalizeOperator(
        comparisonMatch[2]
      ),

    value:
      parseLiteral(
        comparisonMatch[3]
      ),

    onTrue:
      "continue",

    onFalse:
      "stop",

    onTrueStep:
      null,

    onFalseStep:
      null,
  };
}

/*
============================================================
OPERATORS
============================================================
*/

function evaluateOperator(
  actual: unknown,
  operator: ConditionOperator,
  expected: unknown
) {
  switch (
    operator
  ) {
    case "equals":
      return looselyEqual(
        actual,
        expected
      );

    case "not_equals":
      return !looselyEqual(
        actual,
        expected
      );

    case "contains":
      return containsValue(
        actual,
        expected
      );

    case "not_contains":
      return !containsValue(
        actual,
        expected
      );

    case "starts_with":
      return String(actual ?? "")
        .startsWith(String(expected ?? ""));

    case "ends_with":
      return String(actual ?? "")
        .endsWith(String(expected ?? ""));

    case "gt":
      return numericCompare(
        actual,
        expected,
        (
          left,
          right
        ) =>
          left >
          right
      );

    case "gte":
      return numericCompare(
        actual,
        expected,
        (
          left,
          right
        ) =>
          left >=
          right
      );

    case "lt":
      return numericCompare(
        actual,
        expected,
        (
          left,
          right
        ) =>
          left <
          right
      );

    case "lte":
      return numericCompare(
        actual,
        expected,
        (
          left,
          right
        ) =>
          left <=
          right
      );

    case "exists":
      return (
        actual !==
          null &&
        actual !==
          undefined
      );

    case "not_exists":
      return (
        actual ===
          null ||
        actual ===
          undefined
      );

    case "truthy":
      return Boolean(
        actual
      );

    case "falsy":
      return !Boolean(
        actual
      );
  }
}

function looselyEqual(
  left: unknown,
  right: unknown
) {
  if (
    typeof left ===
      "number" ||
    typeof right ===
      "number"
  ) {
    const leftNumber =
      Number(left);

    const rightNumber =
      Number(right);

    if (
      Number.isFinite(
        leftNumber
      ) &&
      Number.isFinite(
        rightNumber
      )
    ) {
      return (
        leftNumber ===
        rightNumber
      );
    }
  }

  if (
    typeof left ===
      "boolean" ||
    typeof right ===
      "boolean"
  ) {
    return (
      normalizeBoolean(
        left
      ) ===
      normalizeBoolean(
        right
      )
    );
  }

  if (
    left === null ||
    right === null
  ) {
    return (
      left ===
      right
    );
  }

  if (
    typeof left ===
      "object" ||
    typeof right ===
      "object"
  ) {
    try {
      return (
        JSON.stringify(
          left
        ) ===
        JSON.stringify(
          right
        )
      );
    } catch {
      return false;
    }
  }

  return (
    String(left) ===
    String(right)
  );
}

function containsValue(
  actual: unknown,
  expected: unknown
) {
  if (
    typeof actual ===
    "string"
  ) {
    return actual
      .toLowerCase()
      .includes(
        String(
          expected ?? ""
        ).toLowerCase()
      );
  }

  if (
    Array.isArray(
      actual
    )
  ) {
    return actual.some(
      (
        value
      ) =>
        looselyEqual(
          value,
          expected
        )
    );
  }

  if (
    actual &&
    typeof actual ===
      "object"
  ) {
    return Object.prototype.hasOwnProperty.call(
      actual,
      String(
        expected
      )
    );
  }

  return false;
}

function numericCompare(
  actual: unknown,
  expected: unknown,
  compare: (
    left: number,
    right: number
  ) => boolean
) {
  const left =
    Number(
      actual
    );

  const right =
    Number(
      expected
    );

  if (
    !Number.isFinite(
      left
    ) ||
    !Number.isFinite(
      right
    )
  ) {
    return false;
  }

  return compare(
    left,
    right
  );
}

/*
============================================================
CONTEXT / VALUE RESOLUTION
============================================================
*/

function normalizeFieldPath(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .trim()
    .replace(
      /^\{\{\s*/,
      ""
    )
    .replace(
      /\s*\}\}$/,
      ""
    )
    .trim();
}

function stripMustachePaths(
  expression: string
) {
  return expression.replace(
    /\{\{\s*([^{}]+?)\s*\}\}/g,
    (
      _match,
      path: string
    ) =>
      path.trim()
  );
}

function resolveExpectedValue(
  value: unknown,
  context: ConditionRuntimeContext
) {
  if (
    typeof value !==
    "string"
  ) {
    return value;
  }

  const trimmed =
    value.trim();

  const exactReference =
    trimmed.match(
      /^\{\{\s*([^{}]+?)\s*\}\}$/
    );

  if (
    exactReference
  ) {
    const resolved =
      getWorkflowContextValue(
        context,
        exactReference[1]
      );

    return resolved ===
      undefined
      ? null
      : resolved;
  }

  return value;
}

/*
============================================================
NORMALIZATION
============================================================
*/

function normalizeOperator(
  value: unknown
): ConditionOperator {
  const key =
    String(
      value ?? ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /[\s-]+/g,
        "_"
      );

  const operator =
    OPERATOR_ALIASES[
      key
    ];

  if (!operator) {
    throw new Error(
      `Unsupported condition operator: ${String(value ?? "")}`
    );
  }

  return operator;
}

function normalizeBranchAction(
  value: unknown,
  fallback: ConditionBranchAction
): ConditionBranchAction {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(value).trim() ===
      ""
  ) {
    return fallback;
  }

  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase()
      .replace(
        /[\s-]+/g,
        "_"
      ) as ConditionBranchAction;

  if (
    !BRANCH_ACTIONS.has(
      normalized
    )
  ) {
    throw new Error(
      `Unsupported condition branch action: ${String(value)}`
    );
  }

  return normalized;
}

function normalizeTargetStep(
  value: unknown,
  fieldName: string
):
  | number
  | null {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(value).trim() ===
      ""
  ) {
    return null;
  }

  const numeric =
    Number(value);

  if (
    !Number.isInteger(
      numeric
    ) ||
    numeric <= 0
  ) {
    throw new Error(
      `${fieldName} must be a positive workflow step number.`
    );
  }

  return numeric;
}

function parseLiteral(
  rawValue: string
): unknown {
  const value =
    rawValue.trim();

  if (
    value.length >=
      2 &&
    (
      (
        value.startsWith(
          "\""
        ) &&
        value.endsWith(
          "\""
        )
      ) ||
      (
        value.startsWith(
          "'"
        ) &&
        value.endsWith(
          "'"
        )
      )
    )
  ) {
    return value.slice(
      1,
      -1
    );
  }

  const normalized =
    value.toLowerCase();

  if (
    normalized ===
    "true"
  ) {
    return true;
  }

  if (
    normalized ===
    "false"
  ) {
    return false;
  }

  if (
    normalized ===
    "null"
  ) {
    return null;
  }

  if (
    normalized ===
    "undefined"
  ) {
    return undefined;
  }

  const numeric =
    Number(
      value
    );

  if (
    value !==
      "" &&
    Number.isFinite(
      numeric
    )
  ) {
    return numeric;
  }

  return value;
}

function normalizeBoolean(
  value: unknown
) {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value
        .trim()
        .toLowerCase();

    if (
      normalized ===
      "true"
    ) {
      return true;
    }

    if (
      normalized ===
      "false"
    ) {
      return false;
    }
  }

  return Boolean(
    value
  );
}
