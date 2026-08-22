import type {
  IntegrationConnection,
  IntegrationProviderDefinition,
} from "../../types/integration";

import type {
  IntegrationReadinessCheck,
  IntegrationReadinessReport,
  IntegrationReadinessState,
} from "../../types/integration-readiness";

import {
  getIntegrationProvider,
} from "./registry";

function readinessCheck(
  code: string,
  label: string,
  status: "pass" | "warning" | "fail",
  message: string,
): IntegrationReadinessCheck {
  return {
    code,
    label,
    status,
    message,
  };
}

function hasConfigurationValue(
  value: string | number | boolean | null | undefined,
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  return typeof value === "string"
    ? value.trim().length > 0
    : true;
}

function getRequiredConnectionFields(
  provider: IntegrationProviderDefinition,
) {
  return provider.auth.setupFields.filter(
    (field) =>
      field.storage === "connection" &&
      field.required,
  );
}

function getRequiredCredentialFields(
  provider: IntegrationProviderDefinition,
) {
  return provider.auth.setupFields.filter(
    (field) =>
      field.storage === "credential_vault" &&
      field.required,
  );
}

function getReadinessState(
  connection: IntegrationConnection,
  checks: readonly IntegrationReadinessCheck[],
): IntegrationReadinessState {
  const failedCodes = new Set(
    checks
      .filter((check) => check.status === "fail")
      .map((check) => check.code),
  );

  if (
    failedCodes.has("PROVIDER_NOT_AVAILABLE") ||
    failedCodes.has("CONNECTION_LIFECYCLE_BLOCKED") ||
    failedCodes.has("UNSUPPORTED_ENVIRONMENT")
  ) {
    return "blocked";
  }

  if (failedCodes.has("PUBLIC_CONFIGURATION_MISSING")) {
    return "needs_configuration";
  }

  if (failedCodes.has("CREDENTIALS_MISSING")) {
    return "needs_credentials";
  }

  if (
    failedCodes.has("OAUTH_FLOW_UNAVAILABLE") ||
    failedCodes.has("OAUTH_SCOPES_MISSING")
  ) {
    return "needs_authorization";
  }

  if (failedCodes.size > 0) {
    return "blocked";
  }

  if (connection.status === "connected") {
    return "operational";
  }

  if (
    connection.status === "degraded" ||
    connection.status === "disconnected" ||
    connection.status === "error"
  ) {
    return "attention";
  }

  return "ready";
}

function getNextAction(
  state: IntegrationReadinessState,
  providerName: string,
): string {
  switch (state) {
    case "needs_configuration":
      return `Complete the required ${providerName} connection details.`;

    case "needs_credentials":
      return `Secure the required ${providerName} credentials.`;

    case "needs_authorization":
      return `Authorize the required ${providerName} scopes.`;

    case "ready":
      return "Run the configuration health check before enabling workflows.";

    case "operational":
      return "The connection is operational. Recheck it after credential or provider changes.";

    case "attention":
      return "Review the current connection status, then rerun the health check.";

    default:
      return "Resolve the blocking readiness checks before using this connection.";
  }
}

export function evaluateIntegrationReadiness(
  connection: IntegrationConnection,
): IntegrationReadinessReport {
  const provider = getIntegrationProvider(
    connection.providerId,
  );
  const checks: IntegrationReadinessCheck[] = [];

  checks.push(
    provider.availability === "planned"
      ? readinessCheck(
          "PROVIDER_NOT_AVAILABLE",
          "Provider availability",
          "fail",
          `${provider.name} is still planned and cannot be activated yet.`,
        )
      : readinessCheck(
          "PROVIDER_AVAILABLE",
          "Provider availability",
          "pass",
          `${provider.name} is available to the current connector foundation.`,
        ),
  );

  checks.push(
    provider.environments.includes(connection.environment)
      ? readinessCheck(
          "ENVIRONMENT_SUPPORTED",
          "Environment",
          "pass",
          `${connection.environment} is supported by ${provider.name}.`,
        )
      : readinessCheck(
          "UNSUPPORTED_ENVIRONMENT",
          "Environment",
          "fail",
          `${provider.name} does not support the ${connection.environment} environment.`,
        ),
  );

  if (
    connection.status === "revoked" ||
    connection.status === "disabled"
  ) {
    checks.push(
      readinessCheck(
        "CONNECTION_LIFECYCLE_BLOCKED",
        "Connection status",
        "fail",
        `The connection is ${connection.status} and must be re-enabled before use.`,
      ),
    );
  } else if (
    connection.status === "degraded" ||
    connection.status === "disconnected" ||
    connection.status === "error"
  ) {
    checks.push(
      readinessCheck(
        "CONNECTION_NEEDS_ATTENTION",
        "Connection status",
        "warning",
        `The connection is ${connection.status} and needs review.`,
      ),
    );
  } else {
    checks.push(
      readinessCheck(
        "CONNECTION_STATUS_ACCEPTED",
        "Connection status",
        "pass",
        `The ${connection.status} lifecycle state permits readiness evaluation.`,
      ),
    );
  }

  const missingConnectionFields = getRequiredConnectionFields(
    provider,
  ).filter(
    (field) =>
      !hasConfigurationValue(
        connection.publicConfiguration[field.key],
      ),
  );

  checks.push(
    missingConnectionFields.length > 0
      ? readinessCheck(
          "PUBLIC_CONFIGURATION_MISSING",
          "Connection configuration",
          "fail",
          `Missing required fields: ${missingConnectionFields
            .map((field) => field.label)
            .join(", ")}.`,
        )
      : readinessCheck(
          "PUBLIC_CONFIGURATION_READY",
          "Connection configuration",
          "pass",
          "All required non-secret connection fields are configured.",
        ),
  );

  const requiredCredentialFields = getRequiredCredentialFields(
    provider,
  );
  const requiresCredentialEnvelope =
    requiredCredentialFields.length > 0 ||
    provider.auth.type === "oauth2";

  if (
    provider.auth.type === "oauth2" &&
    provider.auth.setupFields.length === 0 &&
    !connection.credentialReference
  ) {
    checks.push(
      readinessCheck(
        "OAUTH_FLOW_UNAVAILABLE",
        "Secure authorization",
        "fail",
        `${provider.name} OAuth authorization is not implemented yet.`,
      ),
    );
  } else if (
    requiresCredentialEnvelope &&
    !connection.credentialReference
  ) {
    checks.push(
      readinessCheck(
        "CREDENTIALS_MISSING",
        "Secure credentials",
        "fail",
        "The encrypted credential envelope has not been configured.",
      ),
    );
  } else {
    checks.push(
      readinessCheck(
        "CREDENTIALS_READY",
        "Secure credentials",
        "pass",
        requiresCredentialEnvelope
          ? "An encrypted credential envelope is present. Its secret values were not read."
          : "This connector does not require a credential envelope.",
      ),
    );
  }

  if (
    provider.auth.type === "oauth2" &&
    connection.credentialReference
  ) {
    const missingScopes = provider.auth.requiredScopes.filter(
      (scope) => !connection.grantedScopes.includes(scope),
    );

    checks.push(
      missingScopes.length > 0
        ? readinessCheck(
            "OAUTH_SCOPES_MISSING",
            "OAuth scopes",
            "fail",
            `Required authorization scopes are missing: ${missingScopes.join(", ")}.`,
          )
        : readinessCheck(
            "OAUTH_SCOPES_READY",
            "OAuth scopes",
            "pass",
            "All required OAuth scopes are recorded.",
          ),
    );
  }

  checks.push(
    provider.supportsHealthChecks
      ? readinessCheck(
          "CONFIGURATION_HEALTH_CHECK_SUPPORTED",
          "Health check",
          "pass",
          "A safe configuration health check is available. No external request will be made.",
        )
      : readinessCheck(
          "HEALTH_CHECK_NOT_SUPPORTED",
          "Health check",
          "warning",
          "This connector does not currently expose a health-check adapter.",
        ),
  );

  const blockers = checks.filter(
    (check) => check.status === "fail",
  );
  const warnings = checks.filter(
    (check) => check.status === "warning",
  );
  const state = getReadinessState(
    connection,
    checks,
  );
  const canRunHealthCheck =
    provider.supportsHealthChecks &&
    blockers.length === 0;

  return {
    connectionId: connection.id,
    providerId: connection.providerId,
    connectionStatus: connection.status,
    evaluatedAt: new Date().toISOString(),
    state,
    readyForUse: state === "operational",
    canRunHealthCheck,
    healthCheckMode: provider.supportsHealthChecks
      ? "configuration"
      : "none",
    checks,
    blockers,
    warnings,
    nextAction: getNextAction(state, provider.name),
  };
}