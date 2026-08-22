import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  IntegrationAnalyticsBreakdown,
  IntegrationAnalyticsPeriod,
  IntegrationAnalyticsSnapshot,
  IntegrationAnalyticsTrendPoint,
  IntegrationProviderAnalytics,
} from "../../types/integration-analytics";
import type {
  IntegrationLogSource,
  IntegrationLogStatus,
} from "../../types/integration-observability";

const PAGE_SIZE = 1_000;
const MAX_ROWS = 10_000;
const DAY_MS = 86_400_000;

const SOURCE_LABELS: Record<IntegrationLogSource, string> = {
  action: "External actions",
  webhook: "Webhook events",
  system: "System operations",
};

const STATUS_LABELS: Record<IntegrationLogStatus, string> = {
  received: "Received",
  started: "Started",
  succeeded: "Succeeded",
  failed: "Failed",
  blocked: "Blocked",
  duplicate: "Duplicates",
  retry_scheduled: "Retry scheduled",
  retrying: "Retrying",
  exhausted: "Exhausted",
};

type ConnectionRow = {
  id: string;
  provider: string;
  status: string;
};

type AnalyticsLogRow = {
  id: string;
  integration_id: string;
  provider: string;
  source: IntegrationLogSource;
  status: IntegrationLogStatus;
  correlation_id: string;
  action_execution_id: string | null;
  webhook_event_id: string | null;
  attempt: number;
  max_attempts: number;
  retryable: boolean;
  next_retry_at: string | null;
  created_at: string;
};

type MutableTrendPoint = {
  -readonly [Key in keyof IntegrationAnalyticsTrendPoint]:
    IntegrationAnalyticsTrendPoint[Key];
};

function percent(value: number, total: number) {
  return total > 0
    ? Number(((value / total) * 100).toFixed(1))
    : 0;
}

function providerName(providerId: string) {
  const names: Record<string, string> = {
    "generic-webhook": "Generic Webhook",
    "google-calendar": "Google Calendar",
    "whatsapp-business": "WhatsApp Business",
    "meta-business": "Meta Business",
    "instagram-business": "Instagram Business",
    "amazon-seller": "Amazon Seller",
    "tiktok-shop": "TikTok Shop",
    "hugging-face": "Hugging Face",
    "outlook-mail": "Outlook Mail",
    "outlook-calendar": "Outlook Calendar",
    "microsoft-teams": "Microsoft Teams",
    quickbooks: "QuickBooks Online",
    github: "GitHub",
    openai: "OpenAI",
    youtube: "YouTube",
    paypal: "PayPal",
    onedrive: "OneDrive",
  };

  return names[providerId] ?? providerId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function operationKey(row: AnalyticsLogRow) {
  if (row.action_execution_id) {
    return `action:${row.action_execution_id}`;
  }

  if (row.webhook_event_id) {
    return `webhook:${row.webhook_event_id}`;
  }

  return `correlation:${row.correlation_id}`;
}

function isFailure(status: IntegrationLogStatus) {
  return status === "failed" || status === "exhausted";
}

function isRetry(status: IntegrationLogStatus) {
  return status === "retrying" || status === "retry_scheduled";
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function emptyTrendPoint(date: Date): MutableTrendPoint {
  return {
    bucketStart: date.toISOString(),
    label: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    total: 0,
    succeeded: 0,
    failed: 0,
    blocked: 0,
    retries: 0,
  };
}

function addTrendEvent(
  point: MutableTrendPoint,
  row: AnalyticsLogRow,
) {
  point.total += 1;

  if (row.status === "succeeded") {
    point.succeeded += 1;
  }

  if (isFailure(row.status)) {
    point.failed += 1;
  }

  if (row.status === "blocked") {
    point.blocked += 1;
  }

  if (isRetry(row.status)) {
    point.retries += 1;
  }
}

function createTrend(
  rows: readonly AnalyticsLogRow[],
  days: IntegrationAnalyticsPeriod,
  periodEnd: Date,
): IntegrationAnalyticsTrendPoint[] {
  const endDay = startOfUtcDay(periodEnd);

  const firstDay = new Date(
    endDay.getTime() -
    (days - 1) * DAY_MS,
  );

  if (days <= 30) {
    const points = Array.from(
      {
        length: days,
      },
      (_, index) =>
        emptyTrendPoint(
          new Date(
            firstDay.getTime() +
            index * DAY_MS,
          ),
        ),
    );

    const pointMap = new Map(
      points.map((point) => [
        dateKey(
          new Date(point.bucketStart),
        ),
        point,
      ]),
    );

    for (const row of rows) {
      const point = pointMap.get(
        dateKey(
          new Date(row.created_at),
        ),
      );

      if (point) {
        addTrendEvent(point, row);
      }
    }

    return points;
  }

  const weekCount = Math.ceil(days / 7);

  const points = Array.from(
    {
      length: weekCount,
    },
    (_, index) =>
      emptyTrendPoint(
        new Date(
          firstDay.getTime() +
          index * 7 * DAY_MS,
        ),
      ),
  );

  for (const row of rows) {
    const rawIndex = Math.floor(
      (
        new Date(row.created_at).getTime() -
        firstDay.getTime()
      ) /
      (7 * DAY_MS),
    );

    const index = Math.min(
      Math.max(rawIndex, 0),
      points.length - 1,
    );

    addTrendEvent(
      points[index],
      row,
    );
  }

  return points;
}

function createBreakdown<T extends string>(
  ids: readonly T[],
  labels: Readonly<Record<T, string>>,
  rows: readonly AnalyticsLogRow[],
  select: (row: AnalyticsLogRow) => T,
): IntegrationAnalyticsBreakdown[] {
  const counts = new Map<T, number>(
    ids.map(
      (id): [T, number] => [
        id,
        0,
      ],
    ),
  );

  for (const row of rows) {
    const id = select(row);

    counts.set(
      id,
      (counts.get(id) ?? 0) + 1,
    );
  }

  return ids
    .map((id) => ({
      id,
      label: labels[id],
      count: counts.get(id) ?? 0,
      percentage: percent(
        counts.get(id) ?? 0,
        rows.length,
      ),
    }))
    .filter((item) => item.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count,
    );
}

async function loadConnections(
  supabase: SupabaseClient,
  userId: string,
) {
  const {
    data,
    error,
  } = await supabase
    .from("integrations")
    .select("id, provider, status")
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      "J10 could not load integration connections for analytics.",
    );
  }

  return (data ?? []) as ConnectionRow[];
}

async function loadLogs(
  supabase: SupabaseClient,
  userId: string,
  periodStart: string,
) {
  const rows: AnalyticsLogRow[] = [];

  let offset = 0;
  let truncated = false;

  while (offset < MAX_ROWS) {
    const pageSize = Math.min(
      PAGE_SIZE,
      MAX_ROWS - offset,
    );

    const {
      data,
      error,
    } = await supabase
      .from("integration_operation_logs")
      .select(`
        id,
        integration_id,
        provider,
        source,
        status,
        correlation_id,
        action_execution_id,
        webhook_event_id,
        attempt,
        max_attempts,
        retryable,
        next_retry_at,
        created_at
      `)
      .eq("user_id", userId)
      .gte("created_at", periodStart)
      .order(
        "created_at",
        {
          ascending: true,
        },
      )
      .range(
        offset,
        offset + pageSize - 1,
      );

    if (error) {
      throw new Error(
        "J10 could not load integration operation analytics.",
      );
    }

    const page =
      (data ?? []) as AnalyticsLogRow[];

    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    offset += page.length;

    if (offset >= MAX_ROWS) {
      truncated = true;
    }
  }

  return {
    rows,
    truncated,
  };
}

function createProviderAnalytics(
  rows: readonly AnalyticsLogRow[],
): IntegrationProviderAnalytics[] {
  return Array.from(
    new Set(
      rows.map(
        (row) => row.provider,
      ),
    ),
  )
    .map((providerId) => {
      const providerRows = rows.filter(
        (row) =>
          row.provider === providerId,
      );

      const succeeded = providerRows.filter(
        (row) =>
          row.status === "succeeded",
      ).length;

      const failed = providerRows.filter(
        (row) =>
          isFailure(row.status),
      ).length;

      const blocked = providerRows.filter(
        (row) =>
          row.status === "blocked",
      ).length;

      const outcomes =
        succeeded +
        failed +
        blocked;

      return {
        providerId,
        providerName:
          providerName(providerId),
        events:
          providerRows.length,
        operations:
          new Set(
            providerRows.map(operationKey),
          ).size,
        succeeded,
        failed,
        blocked,
        duplicates:
          providerRows.filter(
            (row) =>
              row.status === "duplicate",
          ).length,
        retries:
          providerRows.filter(
            (row) =>
              isRetry(row.status),
          ).length,
        successRate:
          percent(
            succeeded,
            outcomes,
          ),
        lastActivityAt:
          providerRows.at(-1)
            ?.created_at ?? null,
      };
    })
    .sort(
      (left, right) =>
        right.events - left.events,
    );
}

export async function getIntegrationAnalytics(
  supabase: SupabaseClient,
  userId: string,
  periodDays: IntegrationAnalyticsPeriod,
): Promise<IntegrationAnalyticsSnapshot> {
  const periodEnd = new Date();

  const periodStart = new Date(
    periodEnd.getTime() -
    periodDays * DAY_MS,
  );

  const [
    connections,
    loaded,
  ] = await Promise.all([
    loadConnections(
      supabase,
      userId,
    ),
    loadLogs(
      supabase,
      userId,
      periodStart.toISOString(),
    ),
  ]);

  const rows = loaded.rows;

  const succeeded = rows.filter(
    (row) =>
      row.status === "succeeded",
  ).length;

  const failed = rows.filter(
    (row) =>
      isFailure(row.status),
  ).length;

  const blocked = rows.filter(
    (row) =>
      row.status === "blocked",
  ).length;

  const duplicates = rows.filter(
    (row) =>
      row.status === "duplicate",
  ).length;

  const retries = rows.filter(
    (row) =>
      isRetry(row.status),
  ).length;

  const outcomes =
    succeeded +
    failed +
    blocked;

  const attempts =
    new Map<string, number>();

  for (const row of rows) {
    const key =
      operationKey(row);

    attempts.set(
      key,
      Math.max(
        attempts.get(key) ?? 0,
        row.attempt,
      ),
    );
  }

  const attemptValues =
    Array.from(
      attempts.values(),
    );

  const averageAttempts =
    attemptValues.length > 0
      ? Number(
          (
            attemptValues.reduce(
              (sum, value) =>
                sum + value,
              0,
            ) /
            attemptValues.length
          ).toFixed(2),
        )
      : 0;

  const providerIds = new Set([
    ...connections.map(
      (connection) =>
        connection.provider,
    ),
    ...rows.map(
      (row) =>
        row.provider,
    ),
  ]);

  return {
    generatedAt:
      new Date().toISOString(),
    periodDays,
    periodStart:
      periodStart.toISOString(),
    periodEnd:
      periodEnd.toISOString(),
    truncated:
      loaded.truncated,
    summary: {
      totalEvents:
        rows.length,
      uniqueOperations:
        attempts.size,
      succeeded,
      failed,
      blocked,
      duplicates,
      retries,
      successRate:
        percent(
          succeeded,
          outcomes,
        ),
      failureRate:
        percent(
          failed,
          outcomes,
        ),
      averageAttempts,
      connectionCount:
        connections.length,
      activeConnections:
        connections.filter(
          (connection) =>
            connection.status ===
            "connected",
        ).length,
      providerCount:
        providerIds.size,
      lastOperationAt:
        rows.at(-1)
          ?.created_at ?? null,
    },
    trend:
      createTrend(
        rows,
        periodDays,
        periodEnd,
      ),
    providers:
      createProviderAnalytics(
        rows,
      ),
    sources:
      createBreakdown(
        [
          "action",
          "webhook",
          "system",
        ] as const,
        SOURCE_LABELS,
        rows,
        (row) => row.source,
      ),
    statuses:
      createBreakdown(
        [
          "received",
          "started",
          "succeeded",
          "failed",
          "blocked",
          "duplicate",
          "retry_scheduled",
          "retrying",
          "exhausted",
        ] as const,
        STATUS_LABELS,
        rows,
        (row) => row.status,
      ),
  };
}