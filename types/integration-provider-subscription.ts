import type {
  IntegrationConnection,
  IntegrationEnvironment,
  IntegrationProviderId,
} from "./integration";

import type {
  IntegrationRuntimeCredentialReader,
  IntegrationRuntimeRateLimit,
} from "./integration-runtime";

export const INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION =
  "j10.integration-provider-subscription.v1" as const;

export const INTEGRATION_PROVIDER_SUBSCRIPTION_MODES = [
  "simulate",
  "live",
] as const;

export type IntegrationProviderSubscriptionMode =
  (typeof INTEGRATION_PROVIDER_SUBSCRIPTION_MODES)[number];

export const INTEGRATION_PROVIDER_SUBSCRIPTION_KINDS = [
  "gmail.mailbox.watch",
  "google-calendar.events.watch",
] as const;

export type IntegrationProviderSubscriptionKind =
  (typeof INTEGRATION_PROVIDER_SUBSCRIPTION_KINDS)[number];

export const INTEGRATION_PROVIDER_SUBSCRIPTION_STATES = [
  "simulated",
  "active",
  "stopped",
  "failed",
] as const;

export type IntegrationProviderSubscriptionState =
  (typeof INTEGRATION_PROVIDER_SUBSCRIPTION_STATES)[number];

export interface IntegrationProviderSubscriptionContext {
  readonly requestId: string;
  readonly correlationId: string;
  readonly userId: string;
  readonly connection: IntegrationConnection;
  readonly environment: IntegrationEnvironment;
  readonly mode: IntegrationProviderSubscriptionMode;
  readonly callbackUrl: string;
  readonly signal: AbortSignal;
  readonly credentials: IntegrationRuntimeCredentialReader;
}

export interface GmailSubscriptionOptions {
  readonly topicName?: string;
  readonly labelIds?: readonly string[];
  readonly labelFilterBehavior?: "include" | "exclude";
}

export interface GoogleCalendarSubscriptionOptions {
  readonly calendarId?: string;
  readonly ttlSeconds?: number;
}

export type IntegrationProviderSubscriptionCreateInvocation =
  | (
      IntegrationProviderSubscriptionContext & {
        readonly providerId: "gmail";
        readonly kind: "gmail.mailbox.watch";
        readonly options: GmailSubscriptionOptions;
      }
    )
  | (
      IntegrationProviderSubscriptionContext & {
        readonly providerId: "google-calendar";
        readonly kind: "google-calendar.events.watch";
        readonly options: GoogleCalendarSubscriptionOptions;
      }
    );

export type IntegrationProviderSubscriptionStopInvocation =
  | (
      IntegrationProviderSubscriptionContext & {
        readonly providerId: "gmail";
        readonly kind: "gmail.mailbox.watch";
      }
    )
  | (
      IntegrationProviderSubscriptionContext & {
        readonly providerId: "google-calendar";
        readonly kind: "google-calendar.events.watch";
        readonly externalChannelId: string;
        readonly externalResourceId: string;
      }
    );

export interface IntegrationProviderHttpRequestPlan {
  readonly method: "POST";
  readonly url: string;
  readonly headerNames: readonly string[];
  readonly body:
    Readonly<Record<string, unknown>> |
    null;
}

export interface IntegrationProviderSubscriptionPlan {
  readonly schemaVersion:
    typeof INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION;

  readonly providerId:
    "gmail" |
    "google-calendar";

  readonly kind:
    IntegrationProviderSubscriptionKind;

  readonly mode:
    IntegrationProviderSubscriptionMode;

  readonly environment:
    IntegrationEnvironment;

  readonly callbackUrl:
    string;

  readonly request:
    IntegrationProviderHttpRequestPlan;

  readonly externalSideEffect:
    boolean;
}

export interface IntegrationProviderSubscriptionResult {
  readonly success: boolean;
  readonly simulated: boolean;
  readonly providerId:
    "gmail" |
    "google-calendar";

  readonly kind:
    IntegrationProviderSubscriptionKind;

  readonly state:
    IntegrationProviderSubscriptionState;

  readonly externalChannelId: string | null;
  readonly externalResourceId: string | null;
  readonly externalHistoryId: string | null;
  readonly expiresAt: string | null;
  readonly channelTokenSha256: string | null;
  readonly providerRequestId: string | null;
  readonly rateLimit: IntegrationRuntimeRateLimit | null;

  readonly plan:
    IntegrationProviderSubscriptionPlan;

  readonly metadata:
    Readonly<Record<string, unknown>>;
}

export interface IntegrationProviderSubscriptionStopResult {
  readonly success: boolean;
  readonly simulated: boolean;
  readonly providerId:
    "gmail" |
    "google-calendar";

  readonly kind:
    IntegrationProviderSubscriptionKind;

  readonly state: "simulated" | "stopped";
  readonly stoppedAt: string;
  readonly providerRequestId: string | null;
  readonly rateLimit: IntegrationRuntimeRateLimit | null;
}

export interface IntegrationProviderSubscriptionAdapterManifest {
  readonly schemaVersion:
    typeof INTEGRATION_PROVIDER_SUBSCRIPTION_SCHEMA_VERSION;

  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly state: "development" | "installed" | "disabled";

  readonly providerIds:
    readonly IntegrationProviderId[];

  readonly kinds:
    readonly IntegrationProviderSubscriptionKind[];

  readonly modes:
    readonly IntegrationProviderSubscriptionMode[];

  readonly supportsStart: boolean;
  readonly supportsStop: boolean;
  readonly requestTimeoutMs: number;
}

export interface IntegrationProviderSubscriptionAdapter {
  readonly manifest:
    IntegrationProviderSubscriptionAdapterManifest;

  create(
    invocation:
      IntegrationProviderSubscriptionCreateInvocation,
  ): Promise<IntegrationProviderSubscriptionResult>;

  stop(
    invocation:
      IntegrationProviderSubscriptionStopInvocation,
  ): Promise<IntegrationProviderSubscriptionStopResult>;
}

export interface IntegrationProviderSubscriptionRuntimeStatus {
  readonly providerId: IntegrationProviderId;
  readonly registered: boolean;
  readonly adapterId: string | null;
  readonly adapterVersion: string | null;
  readonly adapterState:
    "development" |
    "installed" |
    "disabled" |
    "not_installed";

  readonly kinds:
    readonly IntegrationProviderSubscriptionKind[];

  readonly modes:
    readonly IntegrationProviderSubscriptionMode[];

  readonly startReady: boolean;
  readonly stopReady: boolean;
}