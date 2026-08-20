import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  createHash,
  randomUUID,
} from "node:crypto";

export type AutomationEventTrigger =
  | "new_crm_contact"
  | "crm_status_changed"
  | "new_ai_task"
  | "ai_task_completed";

type TriggerFilterOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists";

type TriggerFilter = {
  field: string;
  operator: TriggerFilterOperator;
  value?: unknown;
};

type TriggerFilterConfig = {
  filters?: TriggerFilter[];
  filterMode?: "all" | "any";
};

type DispatchAutomationEventArgs = {
  supabase: SupabaseClient;
  userId: string;
  origin: string;
  cookieHeader: string;
  triggerType: AutomationEventTrigger;
  payload: Record<string, unknown>;
  originAutomationId?: string | null;
  parentDepth?: number;
  eventId?: string | null;
  dedupeKey?: string | null;
};

type EventWorkflow = {
  id: string;
  name: string;
  trigger_type: string;
  status: string;
  trigger_config:
    | Record<string, unknown>
    | null;
};

type EventRunResponse = {
  success?: boolean;
  status?: string;
  awaitingApproval?: boolean;
  duplicate?: boolean;
  deduplicated?: boolean;
  error?: string;
  message?: string;
  run?: {
    id?: string;
  };
};

export type AutomationEventDispatchResult = {
  success: boolean;
  triggerType: AutomationEventTrigger;
  eventId: string;
  depth: number;
  matched: number;
  filtered: number;
  deduplicated: number;
  executed: number;
  completed: number;
  awaitingApproval: number;
  failed: number;
  skipped: number;
  results: Array<{
    automationId: string;
    automationName: string;
    status:
      | "completed"
      | "awaiting_approval"
      | "failed"
      | "skipped";
    runId: string | null;
    message: string;
  }>;
};

type FilterEvaluation = {
  passed: boolean;
  reason: string;
};

const MAX_EVENT_DEPTH = 4;
const EVENT_DEDUPE_WINDOW_MS =
  10 * 60 * 1000;

const SUPPORTED_FILTER_OPERATORS =
  new Set<TriggerFilterOperator>([
    "equals",
    "not_equals",
    "greater_than",
    "greater_than_or_equal",
    "less_than",
    "less_than_or_equal",
    "contains",
    "not_contains",
    "exists",
    "not_exists",
  ]);

function safeDepth(
  value: unknown
) {
  const parsed =
    Number(value ?? 0);

  return Number.isFinite(parsed)
    ? Math.max(
        0,
        Math.floor(parsed)
      )
    : 0;
}

function isRecord(
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


function normalizeEventIdentity(
  value: unknown
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function stableEventValue(
  value: unknown
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value ?? null;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      stableEventValue
    );
  }

  if (
    isRecord(
      value
    )
  ) {
    const result: Record<
      string,
      unknown
    > = {};

    for (
      const key of
      Object.keys(
        value
      ).sort()
    ) {
      /*
      __j10_event contains delivery metadata such as event IDs,
      timestamps and depth. It must never alter the business
      event fingerprint.
      */
      if (
        key ===
        "__j10_event"
      ) {
        continue;
      }

      result[key] =
        stableEventValue(
          value[key]
        );
    }

    return result;
  }

  return String(
    value
  );
}

function getIncomingEventMeta(
  payload: Record<
    string,
    unknown
  >
) {
  return isRecord(
    payload.__j10_event
  )
    ? payload.__j10_event
    : null;
}

function buildEventDedupeKey(
  triggerType: AutomationEventTrigger,
  payload: Record<
    string,
    unknown
  >
) {
  const canonical =
    JSON.stringify({
      triggerType,
      payload:
        stableEventValue(
          payload
        ),
    });

  return createHash(
    "sha256"
  )
    .update(
      canonical
    )
    .digest(
      "hex"
    );
}

async function findDuplicateAutomationRun({
  supabase,
  userId,
  automationId,
  dedupeKey,
}: {
  supabase: SupabaseClient;
  userId: string;
  automationId: string;
  dedupeKey: string;
}) {
  const windowStart =
    new Date(
      Date.now() -
        EVENT_DEDUPE_WINDOW_MS
    ).toISOString();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "automation_runs"
      )
      .select(
        `
        id,
        status,
        started_at
        `
      )
      .eq(
        "user_id",
        userId
      )
      .eq(
        "automation_id",
        automationId
      )
      .gte(
        "started_at",
        windowStart
      )
      .contains(
        "trigger_payload",
        {
          __j10_event: {
            dedupeKey,
          },
        }
      )
      .order(
        "started_at",
        {
          ascending:
            false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw new Error(
      "J10 could not verify event idempotency."
    );
  }

  return data ?? null;
}

function normalizeFilterOperator(
  value: unknown
):
  | TriggerFilterOperator
  | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(
        /[\s-]+/g,
        "_"
      );

  const aliases: Record<
    string,
    TriggerFilterOperator
  > = {
    "=":
      "equals",
    "==":
      "equals",
    "===":
      "equals",
    eq:
      "equals",
    equals:
      "equals",

    "!=":
      "not_equals",
    "!==":
      "not_equals",
    neq:
      "not_equals",
    not_equals:
      "not_equals",

    ">":
      "greater_than",
    gt:
      "greater_than",
    greater_than:
      "greater_than",

    ">=":
      "greater_than_or_equal",
    gte:
      "greater_than_or_equal",
    greater_than_or_equal:
      "greater_than_or_equal",
    greater_than_or_equals:
      "greater_than_or_equal",

    "<":
      "less_than",
    lt:
      "less_than",
    less_than:
      "less_than",

    "<=":
      "less_than_or_equal",
    lte:
      "less_than_or_equal",
    less_than_or_equal:
      "less_than_or_equal",
    less_than_or_equals:
      "less_than_or_equal",

    contains:
      "contains",
    not_contains:
      "not_contains",
    exists:
      "exists",
    not_exists:
      "not_exists",
  };

  const operator =
    aliases[
      normalized
    ];

  return operator &&
    SUPPORTED_FILTER_OPERATORS.has(
      operator
    )
    ? operator
    : null;
}

function normalizeFilterField(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  let field =
    value
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

  if (
    field.startsWith(
      "trigger."
    )
  ) {
    field =
      field.slice(
        "trigger.".length
      );
  }

  if (
    field.startsWith(
      "payload."
    )
  ) {
    field =
      field.slice(
        "payload.".length
      );
  }

  return field;
}

function tokenizePath(
  path: string
) {
  return path
    .replace(
      /\[(\d+)\]/g,
      ".$1"
    )
    .split(".")
    .map(
      (part) =>
        part.trim()
    )
    .filter(Boolean);
}

function getNestedValue(
  source: Record<
    string,
    unknown
  >,
  path: string
): unknown {
  const parts =
    tokenizePath(path);

  if (
    parts.length ===
    0
  ) {
    return undefined;
  }

  let current:
    unknown =
    source;

  for (
    const part of parts
  ) {
    if (
      !isRecord(
        current
      ) &&
      !Array.isArray(
        current
      )
    ) {
      return undefined;
    }

    if (
      Array.isArray(
        current
      )
    ) {
      const index =
        Number(part);

      if (
        !Number.isInteger(
          index
        ) ||
        index < 0 ||
        index >=
          current.length
      ) {
        return undefined;
      }

      current =
        current[index];

      continue;
    }

    current =
      current[part];
  }

  return current;
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

function valuesEqual(
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
    String(
      left ?? ""
    ) ===
    String(
      right ?? ""
    )
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
      (item) =>
        valuesEqual(
          item,
          expected
        )
    );
  }

  if (
    isRecord(
      actual
    )
  ) {
    return Object.prototype
      .hasOwnProperty.call(
        actual,
        String(
          expected ?? ""
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

function evaluateTriggerFilter(
  payload: Record<
    string,
    unknown
  >,
  filter: TriggerFilter
) {
  const field =
    normalizeFilterField(
      filter.field
    );

  if (!field) {
    return false;
  }

  const operator =
    normalizeFilterOperator(
      filter.operator
    );

  if (!operator) {
    return false;
  }

  const actual =
    getNestedValue(
      payload,
      field
    );

  switch (
    operator
  ) {
    case "equals":
      return valuesEqual(
        actual,
        filter.value
      );

    case "not_equals":
      return !valuesEqual(
        actual,
        filter.value
      );

    case "greater_than":
      return numericCompare(
        actual,
        filter.value,
        (
          left,
          right
        ) =>
          left >
          right
      );

    case "greater_than_or_equal":
      return numericCompare(
        actual,
        filter.value,
        (
          left,
          right
        ) =>
          left >=
          right
      );

    case "less_than":
      return numericCompare(
        actual,
        filter.value,
        (
          left,
          right
        ) =>
          left <
          right
      );

    case "less_than_or_equal":
      return numericCompare(
        actual,
        filter.value,
        (
          left,
          right
        ) =>
          left <=
          right
      );

    case "contains":
      return containsValue(
        actual,
        filter.value
      );

    case "not_contains":
      return !containsValue(
        actual,
        filter.value
      );

    case "exists":
      return (
        actual !==
          undefined &&
        actual !==
          null
      );

    case "not_exists":
      return (
        actual ===
          undefined ||
        actual ===
          null
      );
  }
}

function parseTriggerFilters(
  triggerConfig:
    | Record<
        string,
        unknown
      >
    | null
): {
  filters: TriggerFilter[];
  mode: "all" | "any";
  invalid: boolean;
} {
  if (
    !triggerConfig
  ) {
    return {
      filters: [],
      mode: "all",
      invalid: false,
    };
  }

  const rawFilters =
    triggerConfig.filters;

  if (
    rawFilters ===
      undefined ||
    rawFilters ===
      null
  ) {
    return {
      filters: [],
      mode: "all",
      invalid: false,
    };
  }

  if (
    !Array.isArray(
      rawFilters
    )
  ) {
    return {
      filters: [],
      mode: "all",
      invalid: true,
    };
  }

  const mode =
    triggerConfig.filterMode ===
      "any"
      ? "any"
      : "all";

  const filters:
    TriggerFilter[] = [];

  for (
    const rawFilter of
      rawFilters
  ) {
    if (
      !isRecord(
        rawFilter
      )
    ) {
      return {
        filters: [],
        mode,
        invalid: true,
      };
    }

    const field =
      normalizeFilterField(
        rawFilter.field
      );

    const operator =
      normalizeFilterOperator(
        rawFilter.operator
      );

    if (
      !field ||
      !operator
    ) {
      return {
        filters: [],
        mode,
        invalid: true,
      };
    }

    filters.push({
      field,
      operator,
      value:
        rawFilter.value,
    });
  }

  return {
    filters,
    mode,
    invalid: false,
  };
}

function evaluateWorkflowFilters(
  workflow: EventWorkflow,
  payload: Record<
    string,
    unknown
  >
): FilterEvaluation {
  const parsed =
    parseTriggerFilters(
      workflow.trigger_config
    );

  if (
    parsed.invalid
  ) {
    return {
      passed: false,
      reason:
        "J10 blocked this workflow because its trigger filter configuration is invalid.",
    };
  }

  if (
    parsed.filters.length ===
    0
  ) {
    return {
      passed: true,
      reason:
        "No trigger filters configured.",
    };
  }

  const evaluations =
    parsed.filters.map(
      (filter) =>
        evaluateTriggerFilter(
          payload,
          filter
        )
    );

  const passed =
    parsed.mode ===
      "any"
      ? evaluations.some(
          Boolean
        )
      : evaluations.every(
          Boolean
        );

  if (passed) {
    return {
      passed: true,
      reason:
        `Trigger filters matched (${parsed.filters.length} filter${parsed.filters.length === 1 ? "" : "s"}, mode: ${parsed.mode}).`,
    };
  }

  return {
    passed: false,
    reason:
      `Event ignored because trigger filters did not match (${parsed.filters.length} filter${parsed.filters.length === 1 ? "" : "s"}, mode: ${parsed.mode}).`,
  };
}

async function parseJsonResponse<T>(
  response: Response
): Promise<T> {
  const text =
    await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(
      text
    ) as T;
  } catch {
    return {} as T;
  }
}

export function getAutomationEventDepth(
  payload:
    | Record<
        string,
        unknown
      >
    | null
    | undefined
) {
  if (!payload) {
    return 0;
  }

  const meta =
    payload.__j10_event;

  if (
    !meta ||
    typeof meta !==
      "object" ||
    Array.isArray(meta)
  ) {
    return 0;
  }

  return safeDepth(
    (
      meta as Record<
        string,
        unknown
      >
    ).depth
  );
}

export async function dispatchAutomationEvent({
  supabase,
  userId,
  origin,
  cookieHeader,
  triggerType,
  payload,
  originAutomationId =
    null,
  parentDepth = 0,
  eventId:
    requestedEventId =
      null,
  dedupeKey:
    requestedDedupeKey =
      null,
}: DispatchAutomationEventArgs): Promise<AutomationEventDispatchResult> {
  const incomingEventMeta =
    getIncomingEventMeta(
      payload
    );

  const eventId =
    normalizeEventIdentity(
      requestedEventId
    ) ||
    normalizeEventIdentity(
      incomingEventMeta?.id
    ) ||
    randomUUID();

  const dedupeKey =
    normalizeEventIdentity(
      requestedDedupeKey
    ) ||
    normalizeEventIdentity(
      incomingEventMeta?.dedupeKey
    ) ||
    buildEventDedupeKey(
      triggerType,
      payload
    );

  const depth =
    safeDepth(
      parentDepth
    ) + 1;

  const baseResult: AutomationEventDispatchResult = {
    success: true,
    triggerType,
    eventId,
    depth,
    matched: 0,
    filtered: 0,
    deduplicated: 0,
    executed: 0,
    completed: 0,
    awaitingApproval: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  /*
  ============================================================
  LOOP / CHAIN PROTECTION
  ============================================================
  */

  if (
    depth >
    MAX_EVENT_DEPTH
  ) {
    return {
      ...baseResult,
      skipped: 1,
      results: [
        {
          automationId:
            originAutomationId ??
            "event-chain",

          automationName:
            "J10 Event Chain",

          status:
            "skipped",

          runId:
            null,

          message:
            `Event chain depth ${depth} exceeded the J10 safety limit of ${MAX_EVENT_DEPTH}.`,
        },
      ],
    };
  }

  /*
  ============================================================
  MATCH ACTIVE WORKFLOWS
  ============================================================
  */

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "automations"
      )
      .select(
        `
        id,
        name,
        trigger_type,
        status,
        trigger_config
        `
      )
      .eq(
        "user_id",
        userId
      )
      .eq(
        "status",
        "active"
      )
      .eq(
        "trigger_type",
        triggerType
      );

  if (error) {
    console.error(
      "J10 event workflow lookup error:",
      error
    );

    return {
      ...baseResult,
      success: false,
      failed: 1,
      results: [
        {
          automationId:
            "lookup",

          automationName:
            "J10 Event Trigger",

          status:
            "failed",

          runId:
            null,

          message:
            "Could not load event-triggered workflows.",
        },
      ],
    };
  }

  const workflows =
    (data ??
      []) as EventWorkflow[];

  /*
  Keep matched as trigger-type matches for backward compatibility.
  Filtered is reported separately.
  */
  baseResult.matched =
    workflows.length;

  /*
  ============================================================
  EXECUTE MATCHED WORKFLOWS
  ============================================================
  */

  for (
    const workflow of
      workflows
  ) {
    /*
    Prevent the workflow that created the event from
    immediately triggering itself.
    */

    if (
      originAutomationId &&
      workflow.id ===
        originAutomationId
    ) {
      baseResult.skipped +=
        1;

      baseResult.results.push({
        automationId:
          workflow.id,

        automationName:
          workflow.name,

        status:
          "skipped",

        runId:
          null,

        message:
          "J10 blocked a direct automation self-trigger loop.",
      });

      continue;
    }

    /*
    ============================================================
    13H — TRIGGER FILTERS

    Filters live in automations.trigger_config:

    {
      "filterMode": "all",
      "filters": [
        {
          "field": "contact.type",
          "operator": "equals",
          "value": "Lead"
        },
        {
          "field": "contact.estimatedValue",
          "operator": "greater_than_or_equal",
          "value": 5000
        }
      ]
    }

    Important:
    - filtered events never call the workflow execution route
    - therefore they create no automation run
    - therefore they increment no execution counter
    ============================================================
    */

    const filterEvaluation =
      evaluateWorkflowFilters(
        workflow,
        payload
      );

    if (
      !filterEvaluation.passed
    ) {
      baseResult.filtered +=
        1;

      baseResult.skipped +=
        1;

      baseResult.results.push({
        automationId:
          workflow.id,

        automationName:
          workflow.name,

        status:
          "skipped",

        runId:
          null,

        message:
          filterEvaluation.reason,
      });

      continue;
    }

    /*
    ============================================================
    13I — EVENT DEDUPLICATION / IDEMPOTENCY

    event + automation should create at most one execution
    inside the retry window. This prevents duplicate AI tasks,
    CRM writes and other side effects when an event delivery is
    retried.
    ============================================================
    */

    try {
      const duplicateRun =
        await findDuplicateAutomationRun({
          supabase,
          userId,
          automationId:
            workflow.id,
          dedupeKey,
        });

      if (
        duplicateRun
      ) {
        baseResult.deduplicated +=
          1;

        baseResult.skipped +=
          1;

        baseResult.results.push({
          automationId:
            workflow.id,

          automationName:
            workflow.name,

          status:
            "skipped",

          runId:
            duplicateRun.id,

          message:
            "Duplicate J10 event delivery ignored. Existing workflow execution preserved.",
        });

        continue;
      }
    } catch (error) {
      baseResult.failed +=
        1;

      baseResult.results.push({
        automationId:
          workflow.id,

        automationName:
          workflow.name,

        status:
          "failed",

        runId:
          null,

        message:
          error instanceof Error
            ? error.message
            : "J10 could not verify event idempotency.",
      });

      continue;
    }

    const eventPayload: Record<
      string,
      unknown
    > = {
      ...payload,

      __j10_event: {
        id:
          eventId,

        type:
          triggerType,

        occurredAt:
          new Date().toISOString(),

        depth,

        originAutomationId:
          originAutomationId ??
          null,

        dedupeKey,

        dedupeWindowMinutes:
          EVENT_DEDUPE_WINDOW_MS /
          60000,

        triggerFilters:
          filterEvaluation.reason,
      },
    };

    try {
      const response =
        await fetch(
          `${origin}/api/automations/${encodeURIComponent(
            workflow.id
          )}/run`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              cookie:
                cookieHeader,
            },

            cache:
              "no-store",

            body:
              JSON.stringify({
                triggerSource:
                  triggerType,

                triggerPayload:
                  eventPayload,
              }),
          }
        );

      const result =
        await parseJsonResponse<EventRunResponse>(
          response
        );

      if (
        result.duplicate ||
        result.deduplicated ||
        result.status ===
          "duplicate"
      ) {
        baseResult.deduplicated +=
          1;

        baseResult.skipped +=
          1;

        baseResult.results.push({
          automationId:
            workflow.id,

          automationName:
            workflow.name,

          status:
            "skipped",

          runId:
            result.run?.id ??
            null,

          message:
            result.message ||
            "Duplicate J10 event delivery ignored.",
        });

        continue;
      }

      baseResult.executed +=
        1;

      if (
        !response.ok ||
        result.success ===
          false
      ) {
        baseResult.failed +=
          1;

        baseResult.results.push({
          automationId:
            workflow.id,

          automationName:
            workflow.name,

          status:
            "failed",

          runId:
            result.run?.id ??
            null,

          message:
            result.error ||
            result.message ||
            "Event-triggered workflow execution failed.",
        });

        continue;
      }

      if (
        result.awaitingApproval ||
        result.status ===
          "awaiting_approval"
      ) {
        baseResult.awaitingApproval +=
          1;

        baseResult.results.push({
          automationId:
            workflow.id,

          automationName:
            workflow.name,

          status:
            "awaiting_approval",

          runId:
            result.run?.id ??
            null,

          message:
            result.message ||
            "Workflow is waiting for human approval.",
        });

        continue;
      }

      baseResult.completed +=
        1;

      baseResult.results.push({
        automationId:
          workflow.id,

        automationName:
          workflow.name,

        status:
          "completed",

        runId:
          result.run?.id ??
          null,

        message:
          result.message ||
          "Event-triggered workflow completed.",
      });
    } catch (error) {
      baseResult.executed +=
        1;

      baseResult.failed +=
        1;

      baseResult.results.push({
        automationId:
          workflow.id,

        automationName:
          workflow.name,

        status:
          "failed",

        runId:
          null,

        message:
          error instanceof Error
            ? error.message
            : "Event-triggered workflow execution failed.",
      });
    }
  }

  baseResult.success =
    baseResult.failed ===
    0;

  return baseResult;
}