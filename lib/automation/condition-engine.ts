/*
============================================================
J10 AUTOMATION CONDITION ENGINE
12K

Safe deterministic condition evaluation.
No eval(), no arbitrary JavaScript execution.

Supported JSON example:
{
  "field": "workflow.name",
  "operator": "equals",
  "value": "J10 Condition Branch Test",
  "onTrue": "continue",
  "onFalse": "skip_next"
}

Supported shorthand examples:
workflow.triggerType == "manual"
trigger.score >= 70
trigger.segment contains "vip"
exists trigger.customerId
truthy trigger.approved
============================================================
*/

export type ConditionBranchAction =
  | "continue"
  | "stop"
  | "skip_next";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "not_exists"
  | "truthy"
  | "falsy";

export type ConditionRuntimeContext = {
  trigger: Record<string, unknown>;

  workflow: {
    id: string;
    name: string;
    triggerType: string;
  };

  execution: {
    mode: string;
  };
};

export type ConditionEvaluation = {
  expression: string;
  field: string;
  operator: ConditionOperator;
  expectedValue: unknown;
  actualValue: unknown;
  matched: boolean;
  branchAction: ConditionBranchAction;
  onTrue: ConditionBranchAction;
  onFalse: ConditionBranchAction;
};

type ParsedCondition = {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
  onTrue: ConditionBranchAction;
  onFalse: ConditionBranchAction;
};

type JsonConditionInput = {
  field?: unknown;
  operator?: unknown;
  value?: unknown;
  onTrue?: unknown;
  onFalse?: unknown;
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

  ">": "gt",
  gt: "gt",

  ">=": "gte",
  gte: "gte",

  "<": "lt",
  lt: "lt",

  "<=": "lte",
  lte: "lte",

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
  instructions: string | null | undefined;
  context: ConditionRuntimeContext;
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
    resolvePath(
      context,
      parsed.field
    );

  const actualValue =
    rawActualValue ===
    undefined
      ? null
      : rawActualValue;

  const matched =
    evaluateOperator(
      actualValue,
      parsed.operator,
      parsed.value
    );

  const branchAction =
    matched
      ? parsed.onTrue
      : parsed.onFalse;

  return {
    expression,
    field:
      parsed.field,
    operator:
      parsed.operator,
    expectedValue:
      parsed.value ??
      null,
    actualValue,
    matched,
    branchAction,
    onTrue:
      parsed.onTrue,
    onFalse:
      parsed.onFalse,
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
    typeof parsed.field ===
    "string"
      ? parsed.field.trim()
      : "";

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

  return {
    field,
    operator,
    value:
      parsed.value,
    onTrue,
    onFalse,
  };
}

function parseShorthandCondition(
  expression: string
): ParsedCondition {
  const prefixMatch =
    expression.match(
      /^(exists|not_exists|truthy|falsy)\s+([A-Za-z0-9_.-]+)$/i
    );

  if (prefixMatch) {
    return {
      field:
        prefixMatch[2],
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
    };
  }

  const containsMatch =
    expression.match(
      /^([A-Za-z0-9_.-]+)\s+(contains|not_contains)\s+(.+)$/i
    );

  if (containsMatch) {
    return {
      field:
        containsMatch[1],
      operator:
        normalizeOperator(
          containsMatch[2]
        ),
      value:
        parseLiteral(
          containsMatch[3]
        ),
      onTrue:
        "continue",
      onFalse:
        "stop",
    };
  }

  const comparisonMatch =
    expression.match(
      /^([A-Za-z0-9_.-]+)\s*(===|!==|==|!=|>=|<=|>|<|=)\s*(.+)$/
    );

  if (
    !comparisonMatch
  ) {
    throw new Error(
      "Unsupported condition expression. Use JSON or a supported comparison such as workflow.triggerType == \"manual\"."
    );
  }

  return {
    field:
      comparisonMatch[1],

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
      String(expected)
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
    Number(actual);

  const right =
    Number(expected);

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
PATH RESOLUTION
============================================================
*/

function resolvePath(
  context: ConditionRuntimeContext,
  path: string
): unknown {
  const segments =
    path
      .split(".")
      .map(
        (
          segment
        ) =>
          segment.trim()
      )
      .filter(Boolean);

  if (
    segments.length ===
    0
  ) {
    return undefined;
  }

  let current:
    unknown =
    context;

  for (
    const segment of
      segments
  ) {
    if (
      current ===
        null ||
      current ===
        undefined ||
      typeof current !==
        "object"
    ) {
      return undefined;
    }

    const record =
      current as Record<
        string,
        unknown
      >;

    current =
      record[
        segment
      ];
  }

  return current;
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
      .toLowerCase();

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
    String(value)
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

  if (
    value ===
    "true"
  ) {
    return true;
  }

  if (
    value ===
    "false"
  ) {
    return false;
  }

  if (
    value ===
    "null"
  ) {
    return null;
  }

  const numeric =
    Number(value);

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