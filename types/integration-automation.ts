import type {
  IntegrationActionMode,
} from "./integration-action";

export const INTEGRATION_AUTOMATION_TRIGGER_TYPE =
  "integration_event" as const;

export const INTEGRATION_AUTOMATION_ACTION_TYPE =
  "integration_action" as const;

export const INTEGRATION_AUTOMATION_BRIDGE_VERSION =
  "j10.integration-automation.v1" as const;

export type IntegrationAutomationTriggerType =
  typeof INTEGRATION_AUTOMATION_TRIGGER_TYPE;

export type IntegrationAutomationActionType =
  typeof INTEGRATION_AUTOMATION_ACTION_TYPE;

export interface IntegrationAutomationActionConfig {
  readonly connectionId: string;
  readonly capabilityId: string;
  readonly mode: IntegrationActionMode;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface IntegrationAutomationActionBridgeResult {
  readonly success: boolean;

  readonly status:
    | "completed"
    | "awaiting_approval"
    | "failed";

  readonly resultText: string;

  readonly requiresHumanApproval: boolean;

  readonly sideEffectBlocked: boolean;

  readonly metadata: Readonly<Record<string, unknown>>;
}