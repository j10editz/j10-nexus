import type {
  IntegrationProviderId,
} from "./integration";

export const EXTERNAL_TRIGGER_SCHEMA_VERSION =
  "j10.external-trigger.v1" as const;

export type ExternalTriggerSchemaVersion =
  typeof EXTERNAL_TRIGGER_SCHEMA_VERSION;

export type ExternalTriggerSourceKind =
  "integration_webhook";

export interface ExternalTriggerSubject {
  type: string;
  id: string | null;
  label: string | null;
}

export interface ExternalTriggerActor {
  type: string;
  id: string | null;
  label: string | null;
}

export interface ExternalTriggerSource {
  kind: ExternalTriggerSourceKind;
  providerId: IntegrationProviderId;
  integrationId: string;
  endpointId: string;
  requestId: string;
  signatureStatus:
    | "valid"
    | "not_required"
    | "not_configured";
}

export interface ExternalTriggerEvent {
  schemaVersion: ExternalTriggerSchemaVersion;
  id: string;
  externalEventId: string | null;
  dedupeKey: string;
  capabilityId: string;
  providerEventType: string;
  workspaceId: string;
  occurredAt: string;
  receivedAt: string;
  source: ExternalTriggerSource;
  subject: ExternalTriggerSubject;
  actor: ExternalTriggerActor | null;
  data: Record<string, unknown>;
  metadata: {
    payloadSha256: string;
    adapterVersion: "day14h.v1";
  };
}