export const INTEGRATION_ANALYTICS_PERIODS = [
  7,
  30,
  90,
] as const;

export type IntegrationAnalyticsPeriod =
  (typeof INTEGRATION_ANALYTICS_PERIODS)[number];

export type IntegrationAnalyticsSummary = {
  readonly totalEvents: number;
  readonly uniqueOperations: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly blocked: number;
  readonly duplicates: number;
  readonly retries: number;
  readonly successRate: number;
  readonly failureRate: number;
  readonly averageAttempts: number;
  readonly connectionCount: number;
  readonly activeConnections: number;
  readonly providerCount: number;
  readonly lastOperationAt: string | null;
};

export type IntegrationAnalyticsTrendPoint = {
  readonly bucketStart: string;
  readonly label: string;
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly blocked: number;
  readonly retries: number;
};

export type IntegrationProviderAnalytics = {
  readonly providerId: string;
  readonly providerName: string;
  readonly events: number;
  readonly operations: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly blocked: number;
  readonly duplicates: number;
  readonly retries: number;
  readonly successRate: number;
  readonly lastActivityAt: string | null;
};

export type IntegrationAnalyticsBreakdown = {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly percentage: number;
};

export type IntegrationAnalyticsSnapshot = {
  readonly generatedAt: string;
  readonly periodDays: IntegrationAnalyticsPeriod;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly truncated: boolean;
  readonly summary: IntegrationAnalyticsSummary;
  readonly trend: readonly IntegrationAnalyticsTrendPoint[];
  readonly providers: readonly IntegrationProviderAnalytics[];
  readonly sources: readonly IntegrationAnalyticsBreakdown[];
  readonly statuses: readonly IntegrationAnalyticsBreakdown[];
};

export type IntegrationAnalyticsApiResponse = {
  readonly success: boolean;
  readonly analytics?: IntegrationAnalyticsSnapshot;
  readonly error?: string;
};