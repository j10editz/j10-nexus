import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  randomUUID,
} from "node:crypto";

export type AutomationEventTrigger =
  | "new_crm_contact"
  | "crm_status_changed"
  | "new_ai_task"
  | "ai_task_completed";

type DispatchAutomationEventArgs = {
  supabase: SupabaseClient;
  userId: string;
  origin: string;
  cookieHeader: string;
  triggerType: AutomationEventTrigger;
  payload: Record<string, unknown>;
  originAutomationId?: string | null;
  parentDepth?: number;
};

type EventWorkflow = {
  id: string;
  name: string;
  trigger_type: string;
  status: string;
};

type EventRunResponse = {
  success?: boolean;
  status?: string;
  awaitingApproval?: boolean;
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

const MAX_EVENT_DEPTH = 4;

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
    | Record<string, unknown>
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
    typeof meta !== "object" ||
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
}: DispatchAutomationEventArgs): Promise<AutomationEventDispatchResult> {
  const eventId =
    randomUUID();

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
        status
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

      baseResult.executed +=
        1;

      if (
        !response.ok ||
        result.success === false
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