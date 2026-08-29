import "server-only";

import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  J10FlowActionNode,
  J10FlowGraph,
  J10FlowTriggerNode,
  J10FlowValidationIssue,
} from "@/types/automation-graph";

import {
  getIntegrationConnectionById,
} from "@/lib/integrations/database";

import {
  evaluateIntegrationReadiness,
} from "@/lib/integrations/readiness";

import {
  evaluateIntegrationActionPolicy,
  parseIntegrationActionMode,
  resolveIntegrationActionCapability,
} from "@/lib/integrations/external-action-adapter";

import {
  getIntegrationRuntimeAdapter,
} from "@/lib/integrations/runtime-registry";

import {
  getIntegrationCapability,
} from "@/lib/integrations/registry";

export type J10FlowReadinessResult = {
  ready: boolean;
  errors: J10FlowValidationIssue[];
  warnings: J10FlowValidationIssue[];
};

export async function validateJ10FlowIntegrationReadiness(args: {
  supabase: SupabaseClient;
  userId: string;
  graph: J10FlowGraph;
}): Promise<J10FlowReadinessResult> {
  const errors: J10FlowValidationIssue[] = [];
  const warnings: J10FlowValidationIssue[] = [];

  const integrationNodes = args.graph.nodes.filter(
    (node): node is J10FlowActionNode =>
      node.enabled &&
      node.kind === "action" &&
      node.actionType === "integration_action",
  );

  const integrationTriggers = args.graph.nodes.filter(
    (node): node is J10FlowTriggerNode =>
      node.enabled &&
      node.kind === "trigger" &&
      node.triggerType === "integration_event",
  );

  for (const node of integrationTriggers) {
    const providerId = node.triggerConfig.provider;
    const capabilityId = node.triggerConfig.eventType;
    const connectionId = node.triggerConfig.connectionId;

    if (!providerId || !capabilityId || !connectionId) {
      errors.push({
        code: "missing_integration_trigger_connection",
        message:
          "Select an authorized workspace connection for this integration trigger.",
        nodeId: node.id,
      });
      continue;
    }

    const connection = await getIntegrationConnectionById(
      args.supabase,
      args.userId,
      connectionId,
    );

    if (!connection || connection.providerId !== providerId) {
      errors.push({
        code: "integration_trigger_connection_invalid",
        message:
          "The selected trigger connection is missing or belongs to another provider.",
        nodeId: node.id,
      });
      continue;
    }

    const capability = getIntegrationCapability(
      connection.providerId,
      capabilityId,
    );

    if (
      !capability ||
      capability.kind !== "trigger" ||
      !connection.enabledCapabilities.includes(capability.id)
    ) {
      errors.push({
        code: "integration_trigger_capability_disabled",
        message:
          "The trigger capability is not enabled for the selected connection.",
        nodeId: node.id,
      });
      continue;
    }

    const readiness = evaluateIntegrationReadiness(connection);

    if (!readiness.readyForUse) {
      errors.push({
        code: "integration_trigger_connection_not_ready",
        message: readiness.blockers[0]?.message ?? readiness.nextAction,
        nodeId: node.id,
      });
    }

    const adapter = getIntegrationRuntimeAdapter(connection.providerId);
    const runtimeCapability = adapter?.manifest.capabilities.find(
      (item) =>
        item.capabilityId === capability.id && item.kind === "trigger",
    );

    if (!runtimeCapability) {
      errors.push({
        code: "integration_trigger_runtime_unavailable",
        message:
          "The selected trigger has no registered runtime adapter contract.",
        nodeId: node.id,
      });
      continue;
    }

    const missingScopes = runtimeCapability.requiredScopes.filter(
      (scope) => !connection.grantedScopes.includes(scope),
    );

    if (missingScopes.length > 0) {
      errors.push({
        code: "integration_trigger_scopes_missing",
        message: `Missing required OAuth scopes: ${missingScopes.join(", ")}.`,
        nodeId: node.id,
      });
    }
  }

  for (const node of integrationNodes) {
    const integration = node.config.integration;

    if (!integration?.connectionId) {
      errors.push({
        code: "missing_integration_connection",
        message: "Select a workspace connection before publishing this node.",
        nodeId: node.id,
      });
      continue;
    }

    const connection = await getIntegrationConnectionById(
      args.supabase,
      args.userId,
      integration.connectionId,
    );

    if (!connection) {
      errors.push({
        code: "integration_connection_not_owned",
        message:
          "The selected integration connection does not exist in this workspace.",
        nodeId: node.id,
      });
      continue;
    }

    if (connection.providerId !== integration.provider) {
      errors.push({
        code: "integration_provider_mismatch",
        message:
          "The selected connection belongs to a different integration provider.",
        nodeId: node.id,
      });
      continue;
    }

    try {
      const capability = resolveIntegrationActionCapability(
        connection,
        integration.capability,
      );
      const mode = parseIntegrationActionMode(integration.mode);
      const policy = evaluateIntegrationActionPolicy(
        connection,
        capability,
        mode,
      );

      if (!policy.allowed) {
        errors.push({
          code: policy.code.toLowerCase(),
          message: policy.reason,
          nodeId: node.id,
        });
      }

      if (mode !== "simulate") {
        const readiness = evaluateIntegrationReadiness(connection);

        if (!readiness.readyForUse) {
          errors.push({
            code: "integration_connection_not_ready",
            message:
              readiness.blockers[0]?.message ??
              readiness.nextAction,
            nodeId: node.id,
          });
        }
      }

      const adapter = getIntegrationRuntimeAdapter(connection.providerId);
      const runtimeCapability = adapter?.manifest.capabilities.find(
        (item) => item.capabilityId === capability.id,
      );

      if (!runtimeCapability) {
        errors.push({
          code: "integration_runtime_capability_unavailable",
          message:
            "The selected capability has no registered runtime contract.",
          nodeId: node.id,
        });
        continue;
      }

      const missingScopes = runtimeCapability.requiredScopes.filter(
        (scope) => !connection.grantedScopes.includes(scope),
      );

      if (missingScopes.length > 0) {
        errors.push({
          code: "integration_oauth_scopes_missing",
          message: `Missing required OAuth scopes: ${missingScopes.join(", ")}.`,
          nodeId: node.id,
        });
      }

      if (mode === "live") {
        if (!runtimeCapability.modes.includes("live")) {
          errors.push({
            code: "integration_live_capability_unavailable",
            message:
              "The selected capability has not passed live runtime acceptance.",
            nodeId: node.id,
          });
        }

        if (!node.requiresApproval) {
          errors.push({
            code: "integration_live_approval_required",
            message: "Live integration actions require human approval.",
            nodeId: node.id,
          });
        }
      }

      if (
        mode === "simulate" &&
        connection.status !== "connected"
      ) {
        warnings.push({
          code: "integration_simulation_connection_attention",
          message:
            "Simulation is safe, but the selected connection is not currently connected.",
          nodeId: node.id,
        });
      }
    } catch (error) {
      errors.push({
        code: "integration_readiness_invalid",
        message:
          error instanceof Error
            ? error.message
            : "Integration readiness validation failed.",
        nodeId: node.id,
      });
    }
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
  };
}
