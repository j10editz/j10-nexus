export type AutomationFailureMode =
  | "stop"
  | "retry"
  | "continue"
  | "human_review";

export type AutomationRetryExhaustedAction =
  | "stop"
  | "continue"
  | "human_review";

export type AutomationStepFailurePolicy = {
  mode: AutomationFailureMode;
  maxAttempts: number;
  retryDelayMs: number;
  afterRetries: AutomationRetryExhaustedAction;
};

export type AutomationFailureResolution =
  | "retry"
  | "stop"
  | "continue"
  | "human_review";

type DevelopmentFailureSimulation = {
  failAttempts: number;
  message: string;
};

const FAILURE_MODES =
  new Set<AutomationFailureMode>([
    "stop",
    "retry",
    "continue",
    "human_review",
  ]);

const RETRY_EXHAUSTED_ACTIONS =
  new Set<AutomationRetryExhaustedAction>([
    "stop",
    "continue",
    "human_review",
  ]);

const DEFAULT_POLICY: AutomationStepFailurePolicy = {
  mode: "stop",
  maxAttempts: 1,
  retryDelayMs: 0,
  afterRetries: "stop",
};

const MAX_RETRY_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 10_000;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      Math.floor(parsed),
      minimum
    ),
    maximum
  );
}

function normalizeFailureMode(
  value: unknown
): AutomationFailureMode | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(
        /[\s-]+/g,
        "_"
      );

  const aliases: Record<
    string,
    AutomationFailureMode
  > = {
    stop: "stop",
    fail: "stop",
    fail_workflow: "stop",
    retry: "retry",
    retry_on_failure: "retry",
    continue: "continue",
    continue_on_failure: "continue",
    human_review: "human_review",
    review: "human_review",
    require_human_review: "human_review",
  };

  const mode =
    aliases[normalized];

  return mode &&
    FAILURE_MODES.has(mode)
    ? mode
    : null;
}

function normalizeAfterRetries(
  value: unknown
): AutomationRetryExhaustedAction | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(
        /[\s-]+/g,
        "_"
      );

  const aliases: Record<
    string,
    AutomationRetryExhaustedAction
  > = {
    stop: "stop",
    fail: "stop",
    continue: "continue",
    human_review: "human_review",
    review: "human_review",
  };

  const action =
    aliases[normalized];

  return action &&
    RETRY_EXHAUSTED_ACTIONS.has(
      action
    )
    ? action
    : null;
}

function normalizeDevelopmentSimulation(
  value: unknown
): DevelopmentFailureSimulation | null {
  if (
    !isRecord(value)
  ) {
    return null;
  }

  const failAttempts =
    normalizeInteger(
      value.failAttempts,
      0,
      0,
      MAX_RETRY_ATTEMPTS
    );

  if (
    failAttempts <= 0
  ) {
    return null;
  }

  const message =
    typeof value.message ===
      "string" &&
    value.message.trim()
      ? value.message.trim()
      : "J10 development failure simulation.";

  return {
    failAttempts,
    message,
  };
}

export function validateAutomationStepConfig(
  value: unknown
): {
  valid: boolean;
  config: Record<string, unknown>;
  error: string | null;
} {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      valid: true,
      config: {},
      error: null,
    };
  }

  if (
    !isRecord(value)
  ) {
    return {
      valid: false,
      config: {},
      error:
        "Workflow step config must be a JSON object.",
    };
  }

  const config: Record<string, unknown> = {
    ...value,
  };

  if (
    "failurePolicy" in config
  ) {
    const rawPolicy =
      config.failurePolicy;

    if (
      !isRecord(rawPolicy)
    ) {
      return {
        valid: false,
        config,
        error:
          "failurePolicy must be a JSON object.",
      };
    }

    const mode =
      normalizeFailureMode(
        rawPolicy.mode
      );

    if (!mode) {
      return {
        valid: false,
        config,
        error:
          'failurePolicy.mode must be "stop", "retry", "continue", or "human_review".',
      };
    }

    const maxAttempts =
      mode === "retry"
        ? normalizeInteger(
            rawPolicy.maxAttempts,
            3,
            2,
            MAX_RETRY_ATTEMPTS
          )
        : 1;

    const retryDelayMs =
      mode === "retry"
        ? normalizeInteger(
            rawPolicy.retryDelayMs,
            0,
            0,
            MAX_RETRY_DELAY_MS
          )
        : 0;

    let afterRetries:
      AutomationRetryExhaustedAction =
      "stop";

    if (
      mode === "retry"
    ) {
      if (
        rawPolicy.afterRetries !==
          undefined &&
        rawPolicy.afterRetries !==
          null
      ) {
        const normalized =
          normalizeAfterRetries(
            rawPolicy.afterRetries
          );

        if (!normalized) {
          return {
            valid: false,
            config,
            error:
              'failurePolicy.afterRetries must be "stop", "continue", or "human_review".',
          };
        }

        afterRetries =
          normalized;
      }
    }

    config.failurePolicy = {
      mode,
      maxAttempts,
      retryDelayMs,
      afterRetries,
    };
  }

  if (
    "developmentFailureSimulation" in
    config
  ) {
    if (
      config.developmentFailureSimulation !==
        null &&
      !isRecord(
        config.developmentFailureSimulation
      )
    ) {
      return {
        valid: false,
        config,
        error:
          "developmentFailureSimulation must be a JSON object.",
      };
    }

    const simulation =
      normalizeDevelopmentSimulation(
        config.developmentFailureSimulation
      );

    config.developmentFailureSimulation =
      simulation
        ? {
            failAttempts:
              simulation.failAttempts,
            message:
              simulation.message,
          }
        : null;
  }

  return {
    valid: true,
    config,
    error: null,
  };
}

export function getAutomationStepFailurePolicy(
  config: unknown
): AutomationStepFailurePolicy {
  const validation =
    validateAutomationStepConfig(
      config
    );

  if (
    !validation.valid
  ) {
    return {
      ...DEFAULT_POLICY,
    };
  }

  const rawPolicy =
    validation.config.failurePolicy;

  if (
    !isRecord(rawPolicy)
  ) {
    return {
      ...DEFAULT_POLICY,
    };
  }

  const mode =
    normalizeFailureMode(
      rawPolicy.mode
    ) ??
    DEFAULT_POLICY.mode;

  return {
    mode,

    maxAttempts:
      mode === "retry"
        ? normalizeInteger(
            rawPolicy.maxAttempts,
            3,
            2,
            MAX_RETRY_ATTEMPTS
          )
        : 1,

    retryDelayMs:
      mode === "retry"
        ? normalizeInteger(
            rawPolicy.retryDelayMs,
            0,
            0,
            MAX_RETRY_DELAY_MS
          )
        : 0,

    afterRetries:
      mode === "retry"
        ? normalizeAfterRetries(
            rawPolicy.afterRetries
          ) ??
          "stop"
        : "stop",
  };
}

export function resolveAutomationFailure(
  policy: AutomationStepFailurePolicy,
  attempt: number
): AutomationFailureResolution {
  if (
    policy.mode ===
      "retry"
  ) {
    if (
      attempt <
      policy.maxAttempts
    ) {
      return "retry";
    }

    return policy.afterRetries;
  }

  return policy.mode;
}

export function getRetryAttemptFromPayload(
  inputPayload: unknown
) {
  if (
    !isRecord(inputPayload)
  ) {
    return 0;
  }

  const retry =
    inputPayload.retry;

  if (
    !isRecord(retry)
  ) {
    return 0;
  }

  return normalizeInteger(
    retry.attempt,
    0,
    0,
    10_000
  );
}

export function getNextRetryAttempt(
  payloads: unknown[]
) {
  let highestAttempt =
    0;

  for (
    const payload of
      payloads
  ) {
    highestAttempt =
      Math.max(
        highestAttempt,
        getRetryAttemptFromPayload(
          payload
        )
      );
  }

  return highestAttempt + 1;
}

export function buildRetryMetadata(args: {
  attempt: number;
  policy: AutomationStepFailurePolicy;
  resolution?: AutomationFailureResolution | null;
  previousAttempts?: number;
}) {
  return {
    attempt:
      args.attempt,

    maxAttempts:
      args.policy.maxAttempts,

    isRetry:
      args.attempt > 1,

    policy:
      args.policy.mode,

    retryDelayMs:
      args.policy.retryDelayMs,

    afterRetries:
      args.policy.afterRetries,

    resolution:
      args.resolution ??
      null,

    previousAttempts:
      args.previousAttempts ??
      Math.max(
        0,
        args.attempt - 1
      ),
  };
}

export function shouldSimulateDevelopmentFailure(args: {
  config: unknown;
  attempt: number;
  executionMode: string | null | undefined;
}) {
  if (
    args.executionMode !==
    "development"
  ) {
    return null;
  }

  if (
    !isRecord(
      args.config
    )
  ) {
    return null;
  }

  const simulation =
    normalizeDevelopmentSimulation(
      args.config
        .developmentFailureSimulation
    );

  if (
    !simulation ||
    args.attempt >
      simulation.failAttempts
  ) {
    return null;
  }

  return simulation.message;
}

export async function waitForRetry(
  policy: AutomationStepFailurePolicy
) {
  if (
    policy.retryDelayMs <=
    0
  ) {
    return;
  }

  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        policy.retryDelayMs
      );
    }
  );
}