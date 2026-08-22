import type {
  IntegrationEnvironment,
  IntegrationProviderId,
} from "./integration";

import type {
  ExternalTriggerEvent,
} from "./external-trigger";

export const INTEGRATION_WEBHOOK_ENDPOINT_STATUSES = [
  "active",
  "disabled",
] as const;

export type IntegrationWebhookEndpointStatus =
  (typeof INTEGRATION_WEBHOOK_ENDPOINT_STATUSES)[number];

export const INTEGRATION_WEBHOOK_SIGNATURE_STATUSES = [
  "valid",
  "invalid",
  "not_required",
  "not_configured",
] as const;

export type IntegrationWebhookSignatureStatus =
  (typeof INTEGRATION_WEBHOOK_SIGNATURE_STATUSES)[number];

export const INTEGRATION_WEBHOOK_PROCESSING_STATUSES = [
  "pending_adapter",
  "adapted",
  "duplicate",
  "processed",
  "failed",
  "rejected",
] as const;

export type IntegrationWebhookProcessingStatus =
  (typeof INTEGRATION_WEBHOOK_PROCESSING_STATUSES)[number];

export interface IntegrationWebhookEndpoint {
  id: string;
  integrationId: string;
  userId: string;
  providerId: IntegrationProviderId;
  environment: IntegrationEnvironment;
  endpointKey: string;
  status: IntegrationWebhookEndpointStatus;
  maxPayloadBytes: number;
  lastReceivedAt: string | null;
  lastEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationWebhookEvent {
  id: string;
  endpointId: string;
  integrationId: string;
  userId: string;
  providerId: IntegrationProviderId;
  requestId: string;
  eventType: string;
  externalEventId: string | null;
  replayKey: string;
  signatureStatus: IntegrationWebhookSignatureStatus;
  processingStatus: IntegrationWebhookProcessingStatus;
  payloadSha256: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  occurredAt: string;
  receivedAt: string;
  normalizedEvent: ExternalTriggerEvent | null;
  adaptedAt: string | null;
  processedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
  nextRetryAt: string | null;
  lastAttemptedAt: string | null;
  lastErrorAt: string | null;
}

export interface IntegrationWebhookVerificationResult {
  eventType: string;
  externalEventId: string | null;
  occurredAt: string;
  signatureStatus: IntegrationWebhookSignatureStatus;
}

export interface RecordIntegrationWebhookEventInput {
  endpoint: IntegrationWebhookEndpoint;
  requestId: string;
  eventType: string;
  externalEventId: string | null;
  replayKey: string;
  signatureStatus: IntegrationWebhookSignatureStatus;
  payloadSha256: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  occurredAt: string;
}

export interface IntegrationWebhookReceipt {
  event: IntegrationWebhookEvent;
  duplicate: boolean;
}