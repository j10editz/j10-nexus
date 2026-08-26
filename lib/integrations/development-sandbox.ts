import "server-only";

import { randomUUID } from "node:crypto";

import type { IntegrationConnection } from "../../types/integration";
import type { IntegrationActionRequest } from "../../types/integration-action";
import type { IntegrationWebhookEvent } from "../../types/integration-webhook";

import {
  INTEGRATION_SANDBOX_SCENARIO_IDS,
  INTEGRATION_SANDBOX_SCHEMA_VERSION,
  type IntegrationSandboxRequest,
  type IntegrationSandboxRun,
  type IntegrationSandboxScenarioId,
  type IntegrationSandboxScenarioResult,
} from "../../types/integration-sandbox";

import {
  createIntegrationActionFingerprint,
  createIntegrationActionPlan,
  evaluateIntegrationActionPolicy,
  executeIntegrationActionPlan,
} from "./external-action-adapter";

import {
  adaptIntegrationWebhookEvent,
} from "./external-trigger-adapter";

import {
  redactIntegrationLogMetadata,
} from "./observability";

import {
  getIntegrationCapability,
  listIntegrationProviders,
} from "./registry";

type ScenarioContext = {
  readonly origin: string;
  readonly seed: string;
};

type ScenarioExecution = {
  readonly assertions: number;
  readonly evidence: Readonly<Record<string, unknown>>;
};

type ScenarioDefinition = {
  readonly id: IntegrationSandboxScenarioId;
  readonly name: string;
  readonly description: string;
  readonly run:
    (context: ScenarioContext) =>
      Promise<ScenarioExecution>;
};

export class IntegrationDevelopmentSandboxError
  extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    message: string,
    code =
      "INTEGRATION_DEVELOPMENT_SANDBOX_ERROR",
    status = 400,
  ) {
    super(message);

    this.name =
      "IntegrationDevelopmentSandboxError";

    this.code =
      code;

    this.status =
      status;
  }
}

function assertSandbox(
  condition: unknown,
  message: string,
) {
  if (!condition) {
    throw new IntegrationDevelopmentSandboxError(
      message,
      "INTEGRATION_SANDBOX_ASSERTION_FAILED",
      500,
    );
  }
}

function createConnection(
  enabledCapabilities:
    readonly string[],
): IntegrationConnection {
  const timestamp =
    "2026-01-01T00:00:00.000Z";

  return {
    id:
      "00000000-0000-4000-8000-000000000014",

    workspaceId:
      "00000000-0000-4000-8000-000000000010",

    providerId:
      "generic-webhook",

    name:
      "J10 Development Sandbox",

    status:
      "connected",

    environment:
      "development",

    credentialReference:
      null,

    externalAccountId:
      null,

    externalAccountLabel:
      "Isolated local adapter",

    grantedScopes:
      [],

    enabledCapabilities,

    publicConfiguration: {
      sandbox:
        true,
    },

    lastConnectedAt:
      timestamp,

    lastHealthCheckAt:
      timestamp,

    lastErrorCode:
      null,

    lastErrorMessage:
      null,

    createdAt:
      timestamp,

    updatedAt:
      timestamp,
  };
}

function requireCapability(
  capabilityId: string,
) {
  const capability =
    getIntegrationCapability(
      "generic-webhook",
      capabilityId,
    );

  if (!capability) {
    throw new IntegrationDevelopmentSandboxError(
      `Sandbox capability is missing: ${capabilityId}`,
      "INTEGRATION_SANDBOX_CAPABILITY_MISSING",
      500,
    );
  }

  return capability;
}

function createActionRequest(
  mode:
    IntegrationActionRequest["mode"],

  capabilityId:
    string,

  seed:
    string,

  input:
    Readonly<Record<string, unknown>>,
): IntegrationActionRequest {
  return {
    capabilityId,

    mode,

    idempotencyKey:
      `day14n:${seed}:${capabilityId}:${mode}`,

    input,
  };
}

function createWebhookEvent(
  seed: string,
): IntegrationWebhookEvent {
  const timestamp =
    "2026-01-01T00:00:00.000Z";

  return {
    id:
      `sandbox-event-${seed}`,

    endpointId:
      "sandbox-endpoint",

    integrationId:
      "00000000-0000-4000-8000-000000000014",

    userId:
      "00000000-0000-4000-8000-000000000010",

    providerId:
      "generic-webhook",

    requestId:
      `sandbox-request-${seed}`,

    eventType:
      "sandbox.acceptance.received",

    externalEventId:
      `external-${seed}`,

    replayKey:
      `replay-${seed}`,

    signatureStatus:
      "not_required",

    processingStatus:
      "pending_adapter",

    payloadSha256:
      "0".repeat(64),

    payload: {
      id:
        `subject-${seed}`,

      subjectType:
        "sandbox_acceptance",

      name:
        "Day 14N deterministic trigger",

      actor: {
        type:
          "sandbox_actor",

        id:
          "j10-development",

        name:
          "J10 Development Sandbox",
      },

      value:
        14,
    },

    headers:
      {},

    occurredAt:
      timestamp,

    receivedAt:
      timestamp,

    normalizedEvent:
      null,

    adaptedAt:
      null,

    processedAt:
      null,

    failureCode:
      null,

    failureMessage:
      null,

    attemptCount:
      0,

    maxAttempts:
      5,

    retryable:
      false,

    nextRetryAt:
      null,

    lastAttemptedAt:
      null,

    lastErrorAt:
      null,
  };
}

const SCENARIOS:
  readonly ScenarioDefinition[] = [
    {
      id:
        "registry_integrity",

      name:
        "Connector registry integrity",

      description:
        "Verifies unique providers, unique capabilities, and installed development connectors.",

      async run() {
        const providers =
          listIntegrationProviders();

        const providerIds =
          providers.map(
            (provider) =>
              provider.id,
          );

        const capabilityIds =
          providers.flatMap(
            (provider) =>
              provider.capabilities.map(
                (capability) =>
                  capability.id,
              ),
          );

        const duplicateProviders =
          providerIds.filter(
            (
              id,
              index,
            ) =>
              providerIds.indexOf(
                id,
              ) !== index,
          );

        const duplicateCapabilities =
          capabilityIds.filter(
            (
              id,
              index,
            ) =>
              capabilityIds.indexOf(
                id,
              ) !== index,
          );

        const developmentProviders =
          providers.filter(
            (provider) =>
              provider.availability ===
              "development",
          );

        assertSandbox(
          providers.length > 0,
          "The integration registry is empty.",
        );

        assertSandbox(
          duplicateProviders.length ===
            0,
          "The integration registry contains duplicate provider IDs.",
        );

        assertSandbox(
          duplicateCapabilities.length ===
            0,
          "The integration registry contains duplicate capability IDs.",
        );

        assertSandbox(
          developmentProviders.length >=
            6,
          "The six Day 14 development providers are not all registered.",
        );

        return {
          assertions:
            4,

          evidence: {
            providers:
              providers.length,

            capabilities:
              capabilityIds.length,

            developmentProviders:
              developmentProviders.map(
                (provider) =>
                  provider.id,
              ),

            duplicateProviders:
              0,

            duplicateCapabilities:
              0,
          },
        };
      },
    },

    {
      id:
        "action_simulation",

      name:
        "Zero-side-effect action simulation",

      description:
        "Exercises the real action planner and executor without sending an HTTP request.",

      async run(
        context,
      ) {
        const capabilityId =
          "webhook.response.return";

        const connection =
          createConnection([
            capabilityId,
          ]);

        const capability =
          requireCapability(
            capabilityId,
          );

        const request =
          createActionRequest(
            "simulate",
            capabilityId,
            context.seed,
            {
              statusCode:
                200,

              body: {
                accepted:
                  true,
              },
            },
          );

        const policy =
          evaluateIntegrationActionPolicy(
            connection,
            capability,
            request.mode,
          );

        const plan =
          createIntegrationActionPlan(
            connection,
            capability,
            request,
            context.origin,
          );

        const result =
          await executeIntegrationActionPlan(
            plan,
            request,
            `simulation-${context.seed}`,
          );

        assertSandbox(
          policy.allowed,
          "Simulation policy was unexpectedly blocked.",
        );

        assertSandbox(
          plan.target ===
            "no-external-request",
          "Simulation created an external target.",
        );

        assertSandbox(
          result.success,
          "Simulation adapter did not succeed.",
        );

        assertSandbox(
          result.metadata
            .externalRequestSent ===
            false,
          "Simulation attempted an external request.",
        );

        return {
          assertions:
            4,

          evidence: {
            policyCode:
              policy.code,

            target:
              plan.target,

            method:
              plan.method,

            simulated:
              result.metadata
                .simulated,

            externalRequestSent:
              result.metadata
                .externalRequestSent,
          },
        };
      },
    },

    {
      id:
        "internal_sandbox_receipt",

      name:
        "Isolated internal adapter receipt",

      description:
        "Executes against J10's local endpoint and verifies that no external side effect occurred.",

      async run(
        context,
      ) {
        const capabilityId =
          "webhook.response.return";

        const connection =
          createConnection([
            capabilityId,
          ]);

        const capability =
          requireCapability(
            capabilityId,
          );

        const request =
          createActionRequest(
            "sandbox",
            capabilityId,
            context.seed,
            {
              statusCode:
                202,

              body: {
                message:
                  "Day 14N isolated acceptance",
              },
            },
          );

        const policy =
          evaluateIntegrationActionPolicy(
            connection,
            capability,
            request.mode,
          );

        const plan =
          createIntegrationActionPlan(
            connection,
            capability,
            request,
            context.origin,
          );

        const result =
          await executeIntegrationActionPlan(
            plan,
            request,
            `sandbox-${context.seed}`,
          );

        const receipt =
          result.metadata.receipt as
            | Record<
                string,
                unknown
              >
            | undefined;

        assertSandbox(
          policy.allowed &&
            !policy
              .requiresHumanApproval,

          "Safe local sandbox action was unexpectedly blocked.",
        );

        assertSandbox(
          result.success &&
            result.responseStatus ===
              200,

          "The internal sandbox endpoint did not return a successful receipt.",
        );

        assertSandbox(
          receipt?.sandbox ===
            true,

          "The internal receipt is not marked as sandboxed.",
        );

        assertSandbox(
          receipt
            ?.externalSideEffect ===
            false,

          "The internal sandbox reported an external side effect.",
        );

        return {
          assertions:
            4,

          evidence: {
            policyCode:
              policy.code,

            adapter:
              plan.adapter,

            responseStatus:
              result.responseStatus,

            receiptId:
              receipt?.receiptId ??
              null,

            externalSideEffect:
              receipt
                ?.externalSideEffect ??
              null,
          },
        };
      },
    },

    {
      id:
        "live_mode_guardrail",

      name:
        "Live provider guardrail",

      description:
        "Confirms an unavailable live adapter cannot execute, even when configured.",

      async run() {
        const capabilityId =
          "webhook.response.return";

        const policy =
          evaluateIntegrationActionPolicy(
            createConnection([
              capabilityId,
            ]),

            requireCapability(
              capabilityId,
            ),

            "live",
          );

        assertSandbox(
          !policy.allowed,
          "Live mode was incorrectly allowed.",
        );

        assertSandbox(
          policy
            .requiresHumanApproval,

          "Live mode lost its approval requirement.",
        );

        assertSandbox(
          policy.code ===
            "INTEGRATION_LIVE_ENVIRONMENT_REQUIRED",

          "Live mode returned the wrong guardrail code.",
        );

        return {
          assertions:
            3,

          evidence: {
            allowed:
              policy.allowed,

            requiresHumanApproval:
              policy
                .requiresHumanApproval,

            policyCode:
              policy.code,

            externalRequestSent:
              false,
          },
        };
      },
    },

    {
      id:
        "approval_guardrail",

      name:
        "Human approval guardrail",

      description:
        "Confirms side-effecting sandbox actions remain approval-gated.",

      async run() {
        const capabilityId =
          "webhook.request.send";

        const policy =
          evaluateIntegrationActionPolicy(
            createConnection([
              capabilityId,
            ]),

            requireCapability(
              capabilityId,
            ),

            "sandbox",
          );

        assertSandbox(
          policy.allowed,
          "Development sandbox rejected the installed connector.",
        );

        assertSandbox(
          policy
            .requiresHumanApproval,

          "Side-effecting sandbox action bypassed human approval.",
        );

        assertSandbox(
          policy.code ===
            "DEVELOPMENT_SANDBOX_ALLOWED",

          "Sandbox approval policy returned the wrong code.",
        );

        return {
          assertions:
            3,

          evidence: {
            allowed:
              policy.allowed,

            requiresHumanApproval:
              policy
                .requiresHumanApproval,

            risk:
              policy.risk,

            policyCode:
              policy.code,

            executed:
              false,
          },
        };
      },
    },

    {
      id:
        "trigger_normalization",

      name:
        "External trigger normalization",

      description:
        "Runs a deterministic webhook receipt through the installed trigger adapter.",

      async run(
        context,
      ) {
        const normalized =
          adaptIntegrationWebhookEvent(
            createWebhookEvent(
              context.seed,
            ),
          );

        assertSandbox(
          normalized.capabilityId ===
            "webhook.request.received",

          "Webhook normalized to the wrong capability.",
        );

        assertSandbox(
          normalized.dedupeKey ===
            `replay-${context.seed}`,

          "Webhook replay key was not preserved.",
        );

        assertSandbox(
          normalized.source.kind ===
            "integration_webhook",

          "Normalized event has the wrong source kind.",
        );

        assertSandbox(
          normalized.subject.id ===
            `subject-${context.seed}`,

          "Normalized event lost its subject identity.",
        );

        return {
          assertions:
            4,

          evidence: {
            schemaVersion:
              normalized
                .schemaVersion,

            capabilityId:
              normalized
                .capabilityId,

            dedupeKey:
              normalized
                .dedupeKey,

            sourceKind:
              normalized
                .source.kind,

            subject:
              normalized.subject,
          },
        };
      },
    },

    {
      id:
        "idempotency_contract",

      name:
        "Idempotency fingerprint contract",

      description:
        "Verifies identical actions collide safely while changed input creates a new fingerprint.",

      async run(
        context,
      ) {
        const capabilityId =
          "webhook.response.return";

        const connection =
          createConnection([
            capabilityId,
          ]);

        const firstRequest =
          createActionRequest(
            "simulate",
            capabilityId,
            context.seed,
            {
              statusCode:
                200,

              body: {
                order:
                  14,

                accepted:
                  true,
              },
            },
          );

        const reorderedRequest = {
          ...firstRequest,

          input: {
            body: {
              accepted:
                true,

              order:
                14,
            },

            statusCode:
              200,
          },
        } satisfies
          IntegrationActionRequest;

        const changedRequest = {
          ...firstRequest,

          input: {
            statusCode:
              200,

            body: {
              order:
                15,

              accepted:
                true,
            },
          },
        } satisfies
          IntegrationActionRequest;

        const firstFingerprint =
          createIntegrationActionFingerprint(
            connection,
            firstRequest,
          );

        const reorderedFingerprint =
          createIntegrationActionFingerprint(
            connection,
            reorderedRequest,
          );

        const changedFingerprint =
          createIntegrationActionFingerprint(
            connection,
            changedRequest,
          );

        assertSandbox(
          firstFingerprint ===
            reorderedFingerprint,

          "Stable input ordering produced different fingerprints.",
        );

        assertSandbox(
          firstFingerprint !==
            changedFingerprint,

          "Changed action input reused the original fingerprint.",
        );

        assertSandbox(
          firstFingerprint.length ===
            64,

          "Action fingerprint is not a SHA-256 digest.",
        );

        return {
          assertions:
            3,

          evidence: {
            stableAcrossKeyOrder:
              true,

            changedInputDetected:
              true,

            algorithm:
              "SHA-256",

            fingerprintPrefix:
              firstFingerprint.slice(
                0,
                12,
              ),
          },
        };
      },
    },

    {
      id:
        "credential_redaction",

      name:
        "Credential redaction boundary",

      description:
        "Runs sensitive sample metadata through the production observability redactor.",

      async run() {
        const secret =
          "j10_day14n_secret_value";

        const redacted =
          redactIntegrationLogMetadata({
            authorization:
              `Bearer ${secret}`,

            accessToken:
              secret,

            nested: {
              api_key:
                secret,

              message:
                `Authorization: Bearer ${secret}`,
            },

            safeValue:
              "day14n",
          });

        const serialized =
          JSON.stringify(
            redacted,
          );

        assertSandbox(
          !serialized.includes(
            secret,
          ),

          "Sensitive credential material survived redaction.",
        );

        assertSandbox(
          redacted.authorization ===
            "[REDACTED]",

          "Authorization metadata was not redacted.",
        );

        assertSandbox(
          redacted.accessToken ===
            "[REDACTED]",

          "Access token metadata was not redacted.",
        );

        assertSandbox(
          redacted.safeValue ===
            "day14n",

          "Safe operational metadata was incorrectly removed.",
        );

        return {
          assertions:
            4,

          evidence: {
            credentialsExposed:
              false,

            authorization:
              redacted.authorization,

            accessToken:
              redacted.accessToken,

            safeValue:
              redacted.safeValue,
          },
        };
      },
    },
  ];

function normalizeSeed(
  value: unknown,
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return "day14n";
  }

  const seed =
    value.trim();

  if (
    seed.length > 64 ||
    !/^[A-Za-z0-9._:-]+$/.test(
      seed,
    )
  ) {
    throw new IntegrationDevelopmentSandboxError(
      "Sandbox seed must contain 1-64 safe characters.",
      "INVALID_INTEGRATION_SANDBOX_SEED",
    );
  }

  return seed;
}

function normalizeScenarioIds(
  value: unknown,
): readonly IntegrationSandboxScenarioId[] {
  if (
    value === undefined ||
    value === null
  ) {
    return INTEGRATION_SANDBOX_SCENARIO_IDS;
  }

  if (
    !Array.isArray(
      value,
    )
  ) {
    throw new IntegrationDevelopmentSandboxError(
      "Sandbox scenarioIds must be an array.",
      "INVALID_INTEGRATION_SANDBOX_SCENARIOS",
    );
  }

  const allowed =
    new Set<string>(
      INTEGRATION_SANDBOX_SCENARIO_IDS,
    );

  const scenarioIds =
    Array.from(
      new Set(
        value,
      ),
    );

  if (
    scenarioIds.length === 0 ||
    scenarioIds.some(
      (scenarioId) =>
        typeof scenarioId !==
          "string" ||
        !allowed.has(
          scenarioId,
        ),
    )
  ) {
    throw new IntegrationDevelopmentSandboxError(
      "Sandbox request contains an unsupported scenario ID.",
      "INVALID_INTEGRATION_SANDBOX_SCENARIOS",
    );
  }

  return scenarioIds as
    IntegrationSandboxScenarioId[];
}

export function parseIntegrationSandboxRequest(
  value: unknown,
): IntegrationSandboxRequest {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      scenarioIds:
        INTEGRATION_SANDBOX_SCENARIO_IDS,

      seed:
        "day14n",
    };
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new IntegrationDevelopmentSandboxError(
      "Sandbox request must be a JSON object.",
      "INVALID_INTEGRATION_SANDBOX_REQUEST",
    );
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  return {
    scenarioIds:
      normalizeScenarioIds(
        record.scenarioIds,
      ),

    seed:
      normalizeSeed(
        record.seed,
      ),
  };
}

async function executeScenario(
  definition:
    ScenarioDefinition,

  context:
    ScenarioContext,
): Promise<IntegrationSandboxScenarioResult> {
  const startedAt =
    performance.now();

  try {
    const result =
      await definition.run(
        context,
      );

    return {
      id:
        definition.id,

      name:
        definition.name,

      description:
        definition.description,

      status:
        "passed",

      assertions:
        result.assertions,

      durationMs:
        Math.max(
          0,

          Math.round(
            (
              performance.now() -
              startedAt
            ) * 100,
          ) / 100,
        ),

      evidence:
        result.evidence,

      error:
        null,
    };
  } catch (error) {
    return {
      id:
        definition.id,

      name:
        definition.name,

      description:
        definition.description,

      status:
        "failed",

      assertions:
        0,

      durationMs:
        Math.max(
          0,

          Math.round(
            (
              performance.now() -
              startedAt
            ) * 100,
          ) / 100,
        ),

      evidence:
        {},

      error:
        error instanceof Error
          ? error.message
          : "Sandbox scenario failed.",
    };
  }
}

export async function runIntegrationDevelopmentSandbox(
  request:
    IntegrationSandboxRequest,

  origin:
    string,
): Promise<IntegrationSandboxRun> {
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    throw new IntegrationDevelopmentSandboxError(
      "Development sandbox is unavailable in production.",
      "INTEGRATION_SANDBOX_PRODUCTION_DISABLED",
      404,
    );
  }

  const scenarioIds =
    normalizeScenarioIds(
      request.scenarioIds,
    );

  const seed =
    normalizeSeed(
      request.seed,
    );

  const definitions =
    scenarioIds.map(
      (scenarioId) => {
        const definition =
          SCENARIOS.find(
            (candidate) =>
              candidate.id ===
              scenarioId,
          );

        if (!definition) {
          throw new IntegrationDevelopmentSandboxError(
            `Sandbox scenario is unavailable: ${scenarioId}`,
            "INTEGRATION_SANDBOX_SCENARIO_UNAVAILABLE",
            500,
          );
        }

        return definition;
      },
    );

  const startedAt =
    new Date();

  const startedPerformance =
    performance.now();

  const scenarios:
    IntegrationSandboxScenarioResult[] =
      [];

  for (
    const definition
    of definitions
  ) {
    scenarios.push(
      await executeScenario(
        definition,
        {
          origin,
          seed,
        },
      ),
    );
  }

  const completedAt =
    new Date();

  const passed =
    scenarios.filter(
      (scenario) =>
        scenario.status ===
        "passed",
    ).length;

  const failed =
    scenarios.length -
    passed;

  const assertions =
    scenarios.reduce(
      (
        total,
        scenario,
      ) =>
        total +
        scenario.assertions,

      0,
    );

  return {
    schemaVersion:
      INTEGRATION_SANDBOX_SCHEMA_VERSION,

    runId:
      randomUUID(),

    environment:
      "development",

    deterministic:
      true,

    seed,

    startedAt:
      startedAt.toISOString(),

    completedAt:
      completedAt.toISOString(),

    durationMs:
      Math.max(
        0,

        Math.round(
          (
            performance.now() -
            startedPerformance
          ) * 100,
        ) / 100,
      ),

    success:
      failed === 0,

    summary: {
      total:
        scenarios.length,

      passed,

      failed,

      assertions,

      internalRequests:
        scenarioIds.includes(
          "internal_sandbox_receipt",
        )
          ? 1
          : 0,

      externalRequests:
        0,

      externalSideEffects:
        0,

      databaseWrites:
        0,

      aiRequests:
        0,

      estimatedCostUsd:
        0,
    },

    scenarios,
  };
}