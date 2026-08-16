import OpenAI from "openai";

import {
  routeJ10Task,
  type J10ModelPreference,
  type J10TaskType,
} from "@/lib/ai/model-router";

/*
============================================================
J10 NEXUS AI RUNTIME
============================================================

SAFE DUAL-MODE ARCHITECTURE

DEVELOPMENT MODE
----------------
J10_AI_MODE=development

- $0 OpenAI API usage
- No OpenAI request is sent
- No API key is required
- Deterministic J10 intelligence
- Rule-based CRM reasoning
- Full UI/API development
- Target GPT model is still calculated by the router

LIVE MODE
---------
J10_AI_MODE=live

- Real OpenAI Responses API
- Uses J10 intelligent model router
- Requires OPENAI_API_KEY
- Paid API usage

IMPORTANT:
Development is the SAFE DEFAULT.

If J10_AI_MODE is missing, invalid or misspelled,
J10 remains in DEVELOPMENT MODE.

============================================================
*/

/*
============================================================
AI MODE
============================================================
*/

export type J10AIMode =
  | "development"
  | "live";

/*
============================================================
OPENAI CLIENT
============================================================
*/

let openAIClient: OpenAI | null =
  null;

function getOpenAIClient() {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Live AI cannot start."
    );
  }

  if (!openAIClient) {
    openAIClient =
      new OpenAI({
        apiKey,
      });
  }

  return openAIClient;
}

/*
============================================================
DETERMINE J10 AI MODE
============================================================
*/

export function getJ10AIMode(): J10AIMode {
  const configuredMode =
    process.env.J10_AI_MODE
      ?.trim()
      .toLowerCase();

  /*
  Only the exact word "live"
  is allowed to enable paid AI.

  Everything else remains free.
  */

  if (
    configuredMode ===
    "live"
  ) {
    return "live";
  }

  return "development";
}

/*
============================================================
INPUT
============================================================
*/

export type RunJ10AIInput = {
  task: J10TaskType;

  input: string;

  instructions?: string;

  preference?: J10ModelPreference;

  maxOutputTokens?: number;
};

/*
============================================================
OUTPUT
============================================================
*/

export type RunJ10AIResult = {
  success: true;

  responseId: string;

  text: string;

  /*
  Target model selected by
  the J10 Model Router.

  In development mode this model
  is NOT actually called.
  */
  model: string;

  displayModel: string;

  task: J10TaskType;

  workload: string;

  reasoningEffort: string;

  reasoningMode: string;

  routingReason: string;

  /*
  Runtime information
  */
  executionMode: J10AIMode;

  simulated: boolean;

  apiCalled: boolean;

  status: string;

  estimatedCostUSD:
    | number
    | null;

  usage: {
    inputTokens: number;

    outputTokens: number;

    totalTokens: number;

    reasoningTokens: number;
  } | null;
};

/*
============================================================
DEFAULT J10 INSTRUCTIONS
============================================================
*/

const DEFAULT_J10_INSTRUCTIONS = `
You are J10 AI, the central intelligence layer of J10 NEXUS.

J10 NEXUS is an AI-powered business operating system,
automation platform and digital workforce.

CORE OPERATING RULES:

1. Make accurate, evidence-based business decisions.

2. Use supplied business context carefully.

3. Never invent CRM records, financial information,
customer information, integrations, workflow executions
or completed actions.

4. Clearly distinguish:
   - analysis
   - recommendation
   - proposed action
   - successfully executed action

5. Never claim an external action occurred unless
J10 NEXUS confirms that action was successfully executed.

6. Respect workspace permissions and human-controlled
actions.

7. Protect business and customer data.

8. When information is missing, acknowledge the
missing information instead of fabricating it.

9. Prioritize useful operational recommendations.

10. Be concise, professional and business-focused.

You are the intelligence layer coordinating the
J10 NEXUS business operating system.
`;

/*
============================================================
DEVELOPMENT SALES OPPORTUNITY
============================================================
*/

type DevelopmentOpportunity = {
  name: string;

  status: string;

  priority: string;

  priorityScore: number;

  estimatedValue: number;

  needsFollowUp: boolean;
};

/*
============================================================
PARSE SALES OPPORTUNITIES
============================================================

This allows development mode to perform useful,
deterministic sales reasoning without calling an LLM.

============================================================
*/

function parseSalesOpportunities(
  input: string
): DevelopmentOpportunity[] {
  /*
  Split text into opportunity sections.

  Works with:

  OPPORTUNITY A
  Name: ...
  Status: ...
  */

  const sections =
    input.split(
      /OPPORTUNITY\s+[A-Z0-9]+/i
    );

  const opportunities:
    DevelopmentOpportunity[] = [];

  for (
    const section of sections
  ) {
    const name =
      getField(
        section,
        "Name"
      );

    if (!name) {
      continue;
    }

    const status =
      getField(
        section,
        "Status"
      ) || "Unknown";

    const priority =
      getField(
        section,
        "Priority"
      ) || "Unknown";

    const scoreValue =
      getField(
        section,
        "Priority Score"
      );

    const moneyValue =
      getField(
        section,
        "Estimated Value"
      );

    const followUpValue =
      getField(
        section,
        "Needs Follow-Up"
      );

    const priorityScore =
      parseNumber(
        scoreValue
      );

    const estimatedValue =
      parseMoney(
        moneyValue
      );

    const needsFollowUp =
      followUpValue
        .trim()
        .toLowerCase() ===
      "yes";

    opportunities.push({
      name,

      status,

      priority,

      priorityScore,

      estimatedValue,

      needsFollowUp,
    });
  }

  return opportunities;
}

/*
============================================================
FIELD PARSER
============================================================
*/

function getField(
  text: string,
  field: string
) {
  const escapedField =
    field.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const match =
    text.match(
      new RegExp(
        `^${escapedField}:\\s*(.+)$`,
        "im"
      )
    );

  return (
    match?.[1]?.trim() ??
    ""
  );
}

/*
============================================================
NUMBER PARSER
============================================================
*/

function parseNumber(
  value: string
) {
  const match =
    value.match(
      /-?\d+(?:\.\d+)?/
    );

  if (!match) {
    return 0;
  }

  return Number(
    match[0]
  );
}

/*
============================================================
MONEY PARSER
============================================================
*/

function parseMoney(
  value: string
) {
  const cleaned =
    value.replace(
      /[^0-9.-]/g,
      ""
    );

  const amount =
    Number(cleaned);

  if (
    Number.isNaN(amount)
  ) {
    return 0;
  }

  return amount;
}

/*
============================================================
FORMAT MONEY
============================================================
*/

function formatMoney(
  value: number
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style:
        "currency",

      currency:
        "USD",

      maximumFractionDigits:
        0,
    }
  ).format(value);
}

/*
============================================================
DEVELOPMENT SALES INTELLIGENCE
============================================================
*/

function buildSalesDevelopmentResponse(
  input: string
) {
  const opportunities =
    parseSalesOpportunities(
      input
    );

  /*
  If we cannot parse structured opportunities,
  return a safe generic development response.
  */

  if (
    opportunities.length ===
    0
  ) {
    return `
J10 AI DEVELOPMENT INTELLIGENCE

The Sales Agent analyzed the supplied CRM context using the development rules engine.

Recommendation:
Prioritize opportunities using deal value, pipeline stage, priority score and follow-up urgency.

No CRM action was executed.

Execution mode: Development Simulation
API usage: $0
`.trim();
  }

  /*
  ============================================================
  STRATEGIC PRIORITY
  ============================================================

  Highest opportunity value first.
  Priority score breaks ties.

  ============================================================
  */

  const strategic =
    [...opportunities].sort(
      (a, b) => {
        if (
          b.estimatedValue !==
          a.estimatedValue
        ) {
          return (
            b.estimatedValue -
            a.estimatedValue
          );
        }

        return (
          b.priorityScore -
          a.priorityScore
        );
      }
    )[0];

  /*
  ============================================================
  IMMEDIATE OUTREACH
  ============================================================

  Follow-up required first.
  New leads second.
  Priority score third.

  ============================================================
  */

  const immediate =
    [...opportunities].sort(
      (a, b) => {
        const aUrgency =
          calculateOutreachUrgency(
            a
          );

        const bUrgency =
          calculateOutreachUrgency(
            b
          );

        if (
          bUrgency !==
          aUrgency
        ) {
          return (
            bUrgency -
            aUrgency
          );
        }

        return (
          b.priorityScore -
          a.priorityScore
        );
      }
    )[0];

  const recommendations =
    opportunities
      .map(
        (opportunity) => {
          return buildOpportunityRecommendation(
            opportunity
          );
        }
      )
      .join(
        "\n\n"
      );

  return `
J10 AI DEVELOPMENT INTELLIGENCE

STRATEGIC PRIORITY

${strategic.name}

Opportunity Value:
${formatMoney(
  strategic.estimatedValue
)}

Priority Score:
${strategic.priorityScore}/100

Reason:
This opportunity has the strongest combination of pipeline value and priority score.


IMMEDIATE OUTREACH PRIORITY

${immediate.name}

Status:
${immediate.status}

Follow-Up Required:
${
  immediate.needsFollowUp
    ? "Yes"
    : "No"
}

Reason:
This opportunity currently has the strongest outreach urgency based on follow-up requirement, pipeline stage and priority score.


RECOMMENDED NEXT ACTIONS

${recommendations}


J10 SALES INTELLIGENCE SUMMARY

Strategic priority and outreach urgency are not always the same.

A high-value opportunity may deserve the greatest strategic attention while another lead may require more immediate communication.

No CRM action was executed.

Execution Mode:
Development Simulation

OpenAI API Called:
No

API Cost:
$0
`.trim();
}

/*
============================================================
OUTREACH URGENCY
============================================================
*/

function calculateOutreachUrgency(
  opportunity:
    DevelopmentOpportunity
) {
  let score = 0;

  if (
    opportunity.needsFollowUp
  ) {
    score += 100;
  }

  if (
    opportunity.status
      .toLowerCase() ===
    "new"
  ) {
    score += 50;
  }

  score +=
    opportunity.priorityScore;

  return score;
}

/*
============================================================
OPPORTUNITY RECOMMENDATION
============================================================
*/

function buildOpportunityRecommendation(
  opportunity:
    DevelopmentOpportunity
) {
  const status =
    opportunity.status
      .trim()
      .toLowerCase();

  if (
    status === "new"
  ) {
    return `${opportunity.name}: Contact the lead and begin qualification.`;
  }

  if (
    status ===
    "contacted"
  ) {
    return `${opportunity.name}: Continue monitoring the opportunity and prepare qualification.`;
  }

  if (
    status ===
    "qualified"
  ) {
    return `${opportunity.name}: Evaluate buying intent and determine whether the opportunity should move to Interested.`;
  }

  if (
    status ===
    "interested"
  ) {
    return `${opportunity.name}: Continue the sales process and prepare the opportunity for human-controlled closing.`;
  }

  if (
    status === "won"
  ) {
    return `${opportunity.name}: Opportunity is already Won. No additional sales-stage movement is required.`;
  }

  if (
    status === "lost"
  ) {
    return `${opportunity.name}: Opportunity is Lost. Preserve the record for analysis and future learning.`;
  }

  return `${opportunity.name}: Review the CRM record and determine the appropriate next sales action.`;
}

/*
============================================================
GENERAL DEVELOPMENT INTELLIGENCE
============================================================
*/

function buildDevelopmentResponse({
  task,
  input,
}: {
  task:
    J10TaskType;

  input:
    string;
}) {
  /*
  ============================================================
  SALES
  ============================================================
  */

  if (
    task ===
    "sales_decision"
  ) {
    return buildSalesDevelopmentResponse(
      input
    );
  }

  /*
  ============================================================
  CRM ANALYSIS
  ============================================================
  */

  if (
    task ===
    "crm_analysis"
  ) {
    return `
J10 AI DEVELOPMENT INTELLIGENCE

CRM analysis completed using the J10 deterministic intelligence engine.

The system can evaluate:
- pipeline stage
- opportunity value
- follow-up state
- CRM status
- priority scoring
- recommended next actions

No external action was executed.

Execution Mode: Development Simulation
OpenAI API Called: No
API Cost: $0
`.trim();
  }

  /*
  ============================================================
  AUTOMATION
  ============================================================
  */

  if (
    task ===
    "automation_planning"
  ) {
    return `
J10 AI DEVELOPMENT INTELLIGENCE

Automation planning request received.

Development mode can validate workflow structure, triggers, required integrations, execution readiness and deterministic workflow rules.

No paid AI request was made.

Execution Mode: Development Simulation
OpenAI API Called: No
API Cost: $0
`.trim();
  }

  /*
  ============================================================
  CUSTOMER SUPPORT
  ============================================================
  */

  if (
    task ===
    "customer_support"
  ) {
    return `
J10 AI DEVELOPMENT INTELLIGENCE

Customer support request received.

Development mode is currently using deterministic response logic.

Live conversational generation will become available when J10 AI live mode is enabled.

OpenAI API Called: No
API Cost: $0
`.trim();
  }

  /*
  ============================================================
  BUSINESS INTELLIGENCE
  ============================================================
  */

  if (
    task ===
      "business_intelligence" ||
    task ===
      "executive_strategy" ||
    task ===
      "critical_decision"
  ) {
    return `
J10 AI DEVELOPMENT INTELLIGENCE

The request was routed successfully through the J10 intelligence architecture.

Advanced semantic reasoning is currently operating in safe development simulation mode.

J10 can continue building:
- business data pipelines
- permissions
- AI employee architecture
- workflow execution
- CRM intelligence
- analytics
- recommendation systems

No OpenAI request was made.

Execution Mode: Development Simulation
OpenAI API Called: No
API Cost: $0
`.trim();
  }

  /*
  ============================================================
  DEFAULT
  ============================================================
  */

  return `
J10 AI DEVELOPMENT INTELLIGENCE

Task received successfully.

Task Type:
${task}

The J10 AI architecture is operating in development simulation mode.

No external model was called.

OpenAI API Called: No
API Cost: $0
`.trim();
}

/*
============================================================
RUN DEVELOPMENT MODE
============================================================
*/

function runDevelopmentJ10AI({
  task,
  input,
  preference,
}: {
  task:
    J10TaskType;

  input:
    string;

  preference:
    J10ModelPreference;
}): RunJ10AIResult {
  /*
  The router still determines which model
  J10 WOULD use in production.

  This lets us build and test routing now
  without spending money.
  */

  const route =
    routeJ10Task({
      task,
      preference,
    });

  const text =
    buildDevelopmentResponse({
      task,
      input,
    });

  return {
    success: true,

    responseId:
      `j10-dev-${Date.now()}`,

    text,

    /*
    TARGET MODEL ONLY.

    No API request is made.
    */
    model:
      route.model,

    displayModel:
      route.displayName,

    task,

    workload:
      route.workload,

    reasoningEffort:
      route.reasoning
        .effort,

    reasoningMode:
      route.reasoning
        .mode,

    routingReason:
      `${route.reason} Development mode prevented external model execution.`,

    executionMode:
      "development",

    simulated:
      true,

    apiCalled:
      false,

    status:
      "simulated",

    estimatedCostUSD:
      0,

    usage: {
      inputTokens:
        0,

      outputTokens:
        0,

      totalTokens:
        0,

      reasoningTokens:
        0,
    },
  };
}

/*
============================================================
RUN LIVE OPENAI MODE
============================================================
*/

async function runLiveJ10AI({
  task,
  input,
  instructions,
  preference,
  maxOutputTokens,
}: {
  task:
    J10TaskType;

  input:
    string;

  instructions?:
    string;

  preference:
    J10ModelPreference;

  maxOutputTokens:
    number;
}): Promise<RunJ10AIResult> {
  /*
  ============================================================
  ROUTE MODEL
  ============================================================
  */

  const route =
    routeJ10Task({
      task,
      preference,
    });

  /*
  ============================================================
  OPENAI CLIENT
  ============================================================
  */

  const client =
    getOpenAIClient();

  /*
  ============================================================
  OPENAI RESPONSES API
  ============================================================
  */

  const response =
    await client.responses.create({
      model:
        route.model,

      reasoning: {
        effort:
          route.reasoning
            .effort,

        mode:
          route.reasoning
            .mode,
      },

      instructions:
        instructions?.trim() ||
        DEFAULT_J10_INSTRUCTIONS,

      input,

      max_output_tokens:
        maxOutputTokens,

      store:
        false,
    });

  /*
  ============================================================
  OUTPUT TEXT
  ============================================================
  */

  const text =
    response.output_text?.trim() ??
    "";

  /*
  ============================================================
  INCOMPLETE RESPONSE
  ============================================================
  */

  if (
    response.status ===
      "incomplete" &&
    !text
  ) {
    const reason =
      response
        .incomplete_details
        ?.reason ??
      "unknown";

    throw new Error(
      `OpenAI response was incomplete before producing visible output. Reason: ${reason}.`
    );
  }

  /*
  ============================================================
  EMPTY RESPONSE
  ============================================================
  */

  if (!text) {
    throw new Error(
      "OpenAI completed the request but returned no visible text output."
    );
  }

  /*
  ============================================================
  TOKEN USAGE
  ============================================================
  */

  const usage =
    response.usage
      ? {
          inputTokens:
            response.usage
              .input_tokens,

          outputTokens:
            response.usage
              .output_tokens,

          totalTokens:
            response.usage
              .total_tokens,

          reasoningTokens:
            response.usage
              .output_tokens_details
              ?.reasoning_tokens ??
            0,
        }
      : null;

  /*
  ============================================================
  RETURN
  ============================================================
  */

  return {
    success: true,

    responseId:
      response.id,

    text,

    model:
      route.model,

    displayModel:
      route.displayName,

    task,

    workload:
      route.workload,

    reasoningEffort:
      route.reasoning
        .effort,

    reasoningMode:
      route.reasoning
        .mode,

    routingReason:
      route.reason,

    executionMode:
      "live",

    simulated:
      false,

    apiCalled:
      true,

    status:
      response.status ??
      "unknown",

    /*
    We will build exact cost tracking later
    using J10 usage records.
    */
    estimatedCostUSD:
      null,

    usage,
  };
}

/*
============================================================
PUBLIC J10 AI RUNTIME
============================================================
*/

export async function runJ10AI({
  task,

  input,

  instructions,

  preference = "Automatic",

  maxOutputTokens = 12000,
}: RunJ10AIInput): Promise<RunJ10AIResult> {
  /*
  ============================================================
  VALIDATE INPUT
  ============================================================
  */

  const cleanInput =
    input.trim();

  if (!cleanInput) {
    throw new Error(
      "J10 AI cannot execute an empty request."
    );
  }

  /*
  ============================================================
  CHECK MODE FIRST
  ============================================================

  CRITICAL SAFETY RULE:

  We determine development/live mode BEFORE
  creating an OpenAI client.

  Therefore development mode cannot accidentally
  send an OpenAI API request.

  ============================================================
  */

  const mode =
    getJ10AIMode();

  /*
  ============================================================
  FREE DEVELOPMENT MODE
  ============================================================
  */

  if (
    mode ===
    "development"
  ) {
    return runDevelopmentJ10AI({
      task,

      input:
        cleanInput,

      preference,
    });
  }

  /*
  ============================================================
  LIVE MODE
  ============================================================

  Only reachable if:

  J10_AI_MODE=live

  ============================================================
  */

  return runLiveJ10AI({
    task,

    input:
      cleanInput,

    instructions,

    preference,

    maxOutputTokens,
  });
}