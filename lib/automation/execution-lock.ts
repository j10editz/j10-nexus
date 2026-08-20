type SupabaseClient = any;

export type AutomationExecutionLock = {
  lockKey: string;
  ownerToken: string;
  scope:
    | "workflow_start"
    | "run_continue";
  expiresAt: string;
  staleRecovered: boolean;
};

export type AcquireAutomationExecutionLockResult =
  | {
      acquired: true;
      lock: AutomationExecutionLock;
    }
  | {
      acquired: false;
      lockKey: string;
      expiresAt: string | null;
      message: string;
    };

const DEFAULT_LOCK_TTL_MS =
  6 * 60 * 1000;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeString(
  value: unknown
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function stableValue(
  value: unknown
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }

  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      result[key] =
        stableValue(value[key]);
    }

    return result;
  }

  return String(value);
}

function hashString(
  value: string
) {
  let hashA =
    0x811c9dc5;

  let hashB =
    0x9e3779b9;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const code =
      value.charCodeAt(index);

    hashA ^=
      code;

    hashA =
      Math.imul(
        hashA,
        0x01000193
      );

    hashB ^=
      code + index;

    hashB =
      Math.imul(
        hashB,
        0x85ebca6b
      );
  }

  const partA =
    (hashA >>> 0)
      .toString(16)
      .padStart(8, "0");

  const partB =
    (hashB >>> 0)
      .toString(16)
      .padStart(8, "0");

  return `${partA}${partB}`;
}

function createOwnerToken() {
  if (
    typeof globalThis.crypto !==
      "undefined" &&
    typeof globalThis.crypto.randomUUID ===
      "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  const randomPart =
    Math.random()
      .toString(36)
      .slice(2);

  const timePart =
    Date.now()
      .toString(36);

  const secondRandomPart =
    Math.random()
      .toString(36)
      .slice(2);

  return `${timePart}-${randomPart}-${secondRandomPart}`;
}

function getEventDedupeKey(
  payload: Record<string, unknown>
) {
  const meta =
    payload.__j10_event;

  if (!isRecord(meta)) {
    return "";
  }

  return normalizeString(
    meta.dedupeKey
  );
}

function getRecordIdentity(
  value: unknown,
  keys: string[]
) {
  if (!isRecord(value)) {
    return "";
  }

  for (const key of keys) {
    const candidate =
      normalizeString(value[key]);

    if (candidate) {
      return `${key}:${candidate}`;
    }
  }

  return "";
}

function getStartIdentity(args: {
  triggerSource: string;
  payload: Record<string, unknown>;
}) {
  const eventDedupeKey =
    getEventDedupeKey(args.payload);

  if (eventDedupeKey) {
    return `event:${eventDedupeKey}`;
  }

  if (
    args.triggerSource === "new_crm_contact" ||
    args.triggerSource === "crm_status_changed"
  ) {
    const contactIdentity =
      getRecordIdentity(
        args.payload.contact,
        ["id", "email", "phone"]
      );

    if (contactIdentity) {
      return `contact:${contactIdentity}`;
    }
  }

  if (
    args.triggerSource === "new_ai_task" ||
    args.triggerSource === "ai_task_completed"
  ) {
    const taskIdentity =
      getRecordIdentity(
        args.payload.task,
        ["id", "taskId"]
      ) ||
      getRecordIdentity(
        args.payload.aiTask,
        ["id", "taskId"]
      );

    if (taskIdentity) {
      return `task:${taskIdentity}`;
    }
  }

  if (args.triggerSource === "schedule") {
    const scheduleIdentity =
      getRecordIdentity(
        args.payload,
        [
          "scheduledAt",
          "scheduled_for",
          "scheduledFor",
          "scheduleKey",
        ]
      );

    if (scheduleIdentity) {
      return `schedule:${scheduleIdentity}`;
    }
  }

  if (
    args.triggerSource === "manual" &&
    Object.keys(args.payload).length === 0
  ) {
    return "manual:no-payload";
  }

  return `payload:${hashString(
    JSON.stringify(
      stableValue(args.payload)
    )
  )}`;
}

export function buildAutomationStartLockKey(args: {
  userId: string;
  automationId: string;
  triggerSource: string;
  payload: Record<string, unknown>;
}) {
  const identity =
    getStartIdentity({
      triggerSource:
        args.triggerSource,
      payload:
        args.payload,
    });

  return `j10:start:${hashString(
    [
      args.userId,
      args.automationId,
      args.triggerSource,
      identity,
    ].join("|")
  )}`;
}

export function buildAutomationContinuationLockKey(args: {
  userId: string;
  runId: string;
}) {
  return `j10:continue:${hashString(
    [
      args.userId,
      args.runId,
    ].join("|")
  )}`;
}

export async function acquireAutomationExecutionLock(args: {
  supabase: SupabaseClient;
  userId: string;
  lockKey: string;
  scope:
    | "workflow_start"
    | "run_continue";
  automationId?: string | null;
  runId?: string | null;
  ttlMs?: number;
}): Promise<AcquireAutomationExecutionLockResult> {
  const now =
    new Date();

  const ttlMs =
    Math.max(
      5_000,
      Math.min(
        10 * 60 * 1000,
        Number(
          args.ttlMs ??
            DEFAULT_LOCK_TTL_MS
        )
      )
    );

  const ownerToken =
    createOwnerToken();

  const expiresAt =
    new Date(
      now.getTime() +
        ttlMs
    ).toISOString();

  const {
    data:
      inserted,
    error:
      insertError,
  } =
    await args.supabase
      .from(
        "automation_execution_locks"
      )
      .insert({
        user_id:
          args.userId,

        lock_key:
          args.lockKey,

        owner_token:
          ownerToken,

        scope:
          args.scope,

        automation_id:
          args.automationId ??
          null,

        run_id:
          args.runId ??
          null,

        expires_at:
          expiresAt,

        created_at:
          now.toISOString(),

        updated_at:
          now.toISOString(),
      })
      .select(
        `
        lock_key,
        owner_token,
        scope,
        expires_at
        `
      )
      .maybeSingle();

  if (
    !insertError &&
    inserted
  ) {
    return {
      acquired: true,

      lock: {
        lockKey:
          inserted.lock_key,

        ownerToken:
          inserted.owner_token,

        scope:
          inserted.scope,

        expiresAt:
          inserted.expires_at,

        staleRecovered:
          false,
      },
    };
  }

  const insertCode =
    (
      insertError as {
        code?: string;
      } | null
    )?.code;

  if (insertCode !== "23505") {
    throw new Error(
      "J10 could not create the execution lock."
    );
  }

  const {
    data:
      recovered,
    error:
      recoveryError,
  } =
    await args.supabase
      .from(
        "automation_execution_locks"
      )
      .update({
        owner_token:
          ownerToken,

        scope:
          args.scope,

        automation_id:
          args.automationId ??
          null,

        run_id:
          args.runId ??
          null,

        expires_at:
          expiresAt,

        updated_at:
          now.toISOString(),
      })
      .eq(
        "user_id",
        args.userId
      )
      .eq(
        "lock_key",
        args.lockKey
      )
      .lt(
        "expires_at",
        now.toISOString()
      )
      .select(
        `
        lock_key,
        owner_token,
        scope,
        expires_at
        `
      )
      .maybeSingle();

  if (recoveryError) {
    throw new Error(
      "J10 could not recover a stale execution lock."
    );
  }

  if (recovered) {
    return {
      acquired: true,

      lock: {
        lockKey:
          recovered.lock_key,

        ownerToken:
          recovered.owner_token,

        scope:
          recovered.scope,

        expiresAt:
          recovered.expires_at,

        staleRecovered:
          true,
      },
    };
  }

  const {
    data:
      existing,
  } =
    await args.supabase
      .from(
        "automation_execution_locks"
      )
      .select(
        "expires_at"
      )
      .eq(
        "user_id",
        args.userId
      )
      .eq(
        "lock_key",
        args.lockKey
      )
      .maybeSingle();

  return {
    acquired: false,

    lockKey:
      args.lockKey,

    expiresAt:
      existing?.expires_at ??
      null,

    message:
      "This J10 execution is already running.",
  };
}

export async function releaseAutomationExecutionLock(args: {
  supabase: SupabaseClient;
  userId: string;
  lock: AutomationExecutionLock;
}) {
  const {
    error,
  } =
    await args.supabase
      .from(
        "automation_execution_locks"
      )
      .delete()
      .eq(
        "user_id",
        args.userId
      )
      .eq(
        "lock_key",
        args.lock.lockKey
      )
      .eq(
        "owner_token",
        args.lock.ownerToken
      );

  if (error) {
    console.error(
      "J10 execution lock release error:",
      error
    );
  }
}