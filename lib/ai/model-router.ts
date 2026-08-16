/*
============================================================
J10 NEXUS AI MODEL ROUTER
============================================================

Central intelligence routing layer.

J10 does NOT use the most expensive model for every task.

Instead:

FAST      -> GPT-5.6 Luna
STANDARD  -> GPT-5.6 Terra
COMPLEX   -> GPT-5.6 Sol
CRITICAL  -> GPT-5.6 Sol + MAX reasoning + PRO mode

============================================================
*/

export type J10ModelPreference =
  | "Automatic"
  | "GPT-5.6 Sol"
  | "GPT-5.6 Terra"
  | "GPT-5.6 Luna";

export type J10Workload =
  | "fast"
  | "standard"
  | "complex"
  | "critical";

export type J10ReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type J10ReasoningMode =
  | "standard"
  | "pro";

export type J10ModelId =
  | "gpt-5.6-sol"
  | "gpt-5.6-terra"
  | "gpt-5.6-luna";

export type J10ModelRoute = {
  provider: "openai";

  model:
    J10ModelId;

  displayName:
    J10ModelPreference;

  workload:
    J10Workload;

  reasoning: {
    effort:
      J10ReasoningEffort;

    mode:
      J10ReasoningMode;
  };

  reason:
    string;
};

/*
============================================================
MODEL DEFINITIONS
============================================================
*/

export const J10_MODELS = {
  sol: {
    id:
      "gpt-5.6-sol" as const,

    displayName:
      "GPT-5.6 Sol" as const,

    purpose:
      "Frontier reasoning, strategic decisions and complex agentic work.",
  },

  terra: {
    id:
      "gpt-5.6-terra" as const,

    displayName:
      "GPT-5.6 Terra" as const,

    purpose:
      "Balanced intelligence, latency and cost.",
  },

  luna: {
    id:
      "gpt-5.6-luna" as const,

    displayName:
      "GPT-5.6 Luna" as const,

    purpose:
      "Fast, efficient and high-volume business tasks.",
  },
};

/*
============================================================
AUTOMATIC ROUTING
============================================================
*/

function automaticRoute(
  workload: J10Workload
): J10ModelRoute {
  switch (workload) {
    /*
    ============================================================
    CRITICAL
    ============================================================
    */

    case "critical":
      return {
        provider:
          "openai",

        model:
          J10_MODELS.sol.id,

        displayName:
          J10_MODELS.sol
            .displayName,

        workload,

        reasoning: {
          effort:
            "max",

          mode:
            "pro",
        },

        reason:
          "Critical J10 NEXUS decision requiring maximum frontier reasoning.",
      };

    /*
    ============================================================
    COMPLEX
    ============================================================
    */

    case "complex":
      return {
        provider:
          "openai",

        model:
          J10_MODELS.sol.id,

        displayName:
          J10_MODELS.sol
            .displayName,

        workload,

        reasoning: {
          effort:
            "xhigh",

          mode:
            "standard",
        },

        reason:
          "Complex multi-step J10 NEXUS task requiring frontier intelligence.",
      };

    /*
    ============================================================
    STANDARD
    ============================================================
    */

    case "standard":
      return {
        provider:
          "openai",

        model:
          J10_MODELS.terra
            .id,

        displayName:
          J10_MODELS.terra
            .displayName,

        workload,

        reasoning: {
          effort:
            "medium",

          mode:
            "standard",
        },

        reason:
          "Standard business task routed for balanced intelligence and efficiency.",
      };

    /*
    ============================================================
    FAST
    ============================================================
    */

    case "fast":
    default:
      return {
        provider:
          "openai",

        model:
          J10_MODELS.luna
            .id,

        displayName:
          J10_MODELS.luna
            .displayName,

        workload:
          "fast",

        reasoning: {
          effort:
            "low",

          mode:
            "standard",
        },

        reason:
          "Fast high-volume task that does not require frontier reasoning.",
      };
  }
}

/*
============================================================
EXPLICIT MODEL ROUTING
============================================================
*/

function explicitRoute(
  preference:
    Exclude<
      J10ModelPreference,
      "Automatic"
    >,

  workload:
    J10Workload
): J10ModelRoute {
  /*
  ============================================================
  SOL
  ============================================================
  */

  if (
    preference ===
    "GPT-5.6 Sol"
  ) {
    return {
      provider:
        "openai",

      model:
        J10_MODELS.sol.id,

      displayName:
        J10_MODELS.sol
          .displayName,

      workload,

      reasoning: {
        effort:
          workload ===
          "critical"
            ? "max"
            : workload ===
                "complex"
              ? "xhigh"
              : workload ===
                  "standard"
                ? "high"
                : "medium",

        mode:
          workload ===
          "critical"
            ? "pro"
            : "standard",
      },

      reason:
        "Workspace explicitly selected GPT-5.6 Sol.",
    };
  }

  /*
  ============================================================
  TERRA
  ============================================================
  */

  if (
    preference ===
    "GPT-5.6 Terra"
  ) {
    return {
      provider:
        "openai",

      model:
        J10_MODELS.terra
          .id,

      displayName:
        J10_MODELS.terra
          .displayName,

      workload,

      reasoning: {
        effort:
          workload ===
            "critical" ||
          workload ===
            "complex"
            ? "xhigh"
            : workload ===
                "standard"
              ? "medium"
              : "low",

        mode:
          "standard",
      },

      reason:
        "Workspace explicitly selected GPT-5.6 Terra.",
    };
  }

  /*
  ============================================================
  LUNA
  ============================================================
  */

  return {
    provider:
      "openai",

    model:
      J10_MODELS.luna.id,

    displayName:
      J10_MODELS.luna
        .displayName,

    workload,

    reasoning: {
      effort:
        workload ===
          "critical" ||
        workload ===
          "complex"
          ? "high"
          : workload ===
              "standard"
            ? "medium"
            : "low",

      mode:
        "standard",
    },

    reason:
      "Workspace explicitly selected GPT-5.6 Luna.",
  };
}

/*
============================================================
PUBLIC MODEL ROUTER
============================================================
*/

export function resolveJ10Model({
  preference = "Automatic",
  workload = "standard",
}: {
  preference?:
    J10ModelPreference;

  workload?:
    J10Workload;
}): J10ModelRoute {
  if (
    preference ===
    "Automatic"
  ) {
    return automaticRoute(
      workload
    );
  }

  return explicitRoute(
    preference,
    workload
  );
}

/*
============================================================
J10 TASK CLASSIFIER
============================================================

This determines how much intelligence a task deserves.

This is NOT an AI call.
It is a deterministic routing layer.

============================================================
*/

export type J10TaskType =
  | "status_update"
  | "classification"
  | "data_extraction"
  | "simple_message"
  | "customer_support"
  | "summarization"
  | "content_generation"
  | "crm_analysis"
  | "sales_decision"
  | "automation_planning"
  | "business_intelligence"
  | "research"
  | "executive_strategy"
  | "critical_decision";

export function classifyJ10Workload(
  task:
    J10TaskType
): J10Workload {
  switch (task) {
    /*
    ============================================================
    FAST
    ============================================================
    */

    case "status_update":
    case "classification":
    case "data_extraction":
    case "simple_message":
      return "fast";

    /*
    ============================================================
    STANDARD
    ============================================================
    */

    case "customer_support":
    case "summarization":
    case "content_generation":
      return "standard";

    /*
    ============================================================
    COMPLEX
    ============================================================
    */

    case "crm_analysis":
    case "sales_decision":
    case "automation_planning":
    case "business_intelligence":
      return "complex";

    /*
    ============================================================
    CRITICAL
    ============================================================
    */

    case "research":
    case "executive_strategy":
    case "critical_decision":
      return "critical";

    default:
      return "standard";
  }
}

/*
============================================================
TASK -> MODEL
============================================================
*/

export function routeJ10Task({
  task,
  preference = "Automatic",
}: {
  task:
    J10TaskType;

  preference?:
    J10ModelPreference;
}) {
  const workload =
    classifyJ10Workload(
      task
    );

  return resolveJ10Model({
    preference,
    workload,
  });
}

/*
============================================================
EXAMPLES
============================================================

routeJ10Task({
  task: "status_update",
});

=> GPT-5.6 Luna
=> low reasoning


routeJ10Task({
  task: "customer_support",
});

=> GPT-5.6 Terra
=> medium reasoning


routeJ10Task({
  task: "sales_decision",
});

=> GPT-5.6 Sol
=> xhigh reasoning


routeJ10Task({
  task: "executive_strategy",
});

=> GPT-5.6 Sol
=> MAX reasoning
=> PRO mode

============================================================
*/