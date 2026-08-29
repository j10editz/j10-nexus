import type {
  J10FlowTriggerNode,
} from "../../types/automation-graph";

type TriggerConfig =
  | Record<string, unknown>
  | null
  | undefined;

export type IntegrationTriggerEvaluation = {
  passed: boolean;
  reason: string;
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual Trigger",
  new_crm_contact: "New CRM Contact",
  crm_status_changed: "CRM Status Changed",
  new_ai_task: "New AI Task",
  ai_task_completed: "AI Task Completed",
  schedule: "Scheduled",
  integration_event: "Integration Event",
};

const SPECIAL_IDENTIFIER_WORDS: Record<string, string> = {
  ai: "AI",
  crm: "CRM",
  gmail: "Gmail",
  google: "Google",
  whatsapp: "WhatsApp",
};

function normalizedString(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function formatIdentifier(
  value: string,
) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => {
      const normalized =
        word.toLowerCase();

      return (
        SPECIAL_IDENTIFIER_WORDS[
          normalized
        ] ??
        `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
      );
    })
    .join(" ");
}

export function evaluateIntegrationTriggerBinding(
  triggerConfig: TriggerConfig,
  payload: Record<string, unknown>,
): IntegrationTriggerEvaluation {
  const provider =
    normalizedString(
      triggerConfig?.provider,
    );

  const eventType =
    normalizedString(
      triggerConfig?.eventType,
    );

  const connectionId =
    normalizedString(
      triggerConfig?.connectionId,
    );

  if (!provider || !eventType) {
    return {
      passed: false,
      reason:
        "J10 blocked this integration workflow because its provider or event type binding is missing.",
    };
  }

  const eventProvider =
    normalizedString(
      payload.providerId,
    );

  const providerEventType =
    normalizedString(
      payload.capabilityId,
    ) ||
    normalizedString(
      payload.providerEventType,
    );

  const eventConnectionId =
    normalizedString(
      payload.integrationId,
    );

  if (
    provider !== eventProvider ||
    eventType !== providerEventType
  ) {
    return {
      passed: false,
      reason:
        "Event ignored because its integration provider or event type did not match this workflow.",
    };
  }

  if (
    connectionId &&
    connectionId !== eventConnectionId
  ) {
    return {
      passed: false,
      reason:
        "Event ignored because its integration connection did not match this workflow.",
    };
  }

  return {
    passed: true,
    reason:
      "Integration provider, event type, and connection matched exactly.",
  };
}

export function getAutomationTriggerDisplayLabel(
  triggerType: string,
  triggerConfig: TriggerConfig = {},
) {
  if (triggerType !== "integration_event") {
    return (
      TRIGGER_LABELS[triggerType] ??
      `Unknown Trigger${
        triggerType
          ? ` · ${formatIdentifier(triggerType)}`
          : ""
      }`
    );
  }

  const provider =
    normalizedString(
      triggerConfig?.provider,
    );

  const eventType =
    normalizedString(
      triggerConfig?.eventType,
    );

  const bindingLabel = [
    provider
      ? formatIdentifier(provider)
      : "",
    eventType
      ? formatIdentifier(eventType)
      : "",
  ]
    .filter(Boolean)
    .join(" / ");

  return bindingLabel
    ? `Integration Event · ${bindingLabel}`
    : "Integration Event";
}

export function buildJ10FlowTriggerConfig({
  triggerConfig,
  scheduleExpression,
  timezone,
}: {
  triggerConfig: TriggerConfig;
  scheduleExpression: string | null;
  timezone: string | null;
}): J10FlowTriggerNode["triggerConfig"] {
  const config:
    J10FlowTriggerNode["triggerConfig"] = {
      scheduleExpression,
      timezone,
    };

  const provider =
    normalizedString(
      triggerConfig?.provider,
    );

  const eventType =
    normalizedString(
      triggerConfig?.eventType,
    );

  const connectionId =
    normalizedString(
      triggerConfig?.connectionId,
    );

  if (provider) {
    config.provider =
      provider;
  }

  if (eventType) {
    config.eventType =
      eventType;
  }

  if (connectionId) {
    config.connectionId =
      connectionId;
  }

  if (
    Array.isArray(
      triggerConfig?.filters,
    )
  ) {
    config.filters =
      triggerConfig.filters as J10FlowTriggerNode["triggerConfig"]["filters"];
  }

  if (
    triggerConfig?.filterMode === "all" ||
    triggerConfig?.filterMode === "any"
  ) {
    config.filterMode =
      triggerConfig.filterMode;
  }

  return config;
}
