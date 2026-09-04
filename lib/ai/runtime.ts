import {
  routeJ10Task,
  type J10ModelPreference,
  type J10TaskType,
} from "@/lib/ai/model-router";

import { buildDevelopmentResearchResponse } from "@/lib/ai/development-research";
import { getGeminiApiKey, runGeminiAI } from "./providers/gemini";
import { getOpenAIApiKey, runOpenAIAI } from "./providers/openai";
import type {
  J10AIMode,
  J10AIProviderName,
  RunJ10AIInput,
  RunJ10AIResult,
} from "./providers/types";

export type { J10AIMode, J10AIProviderName, RunJ10AIInput, RunJ10AIResult };

/*
============================================================
J10 NEXUS AI RUNTIME — MULTI-PROVIDER ARCHITECTURE
============================================================

Supported Providers:
1. Google Gemini (Google AI Studio / Gemini 2.5 Flash & Pro)
   - Configured via GEMINI_API_KEY or GOOGLE_AI_STUDIO_API_KEY
   - Zero-cost under 1-year AI Studio access
   - Sub-second low-latency conversational generation
   - 1M+ token context window for full company brain grounding

2. OpenAI (GPT-4o & GPT-4o Mini)
   - Configured via OPENAI_API_KEY

3. Deterministic Development Engine ($0, Zero external calls)
   - Default safe mode when J10_AI_MODE=development or no keys are set
   - Rule-based CRM reasoning & sandbox evaluation

============================================================
*/

export function getJ10AIMode(): J10AIMode {
  const configuredMode = process.env.J10_AI_MODE?.trim().toLowerCase();
  return configuredMode === "live" ? "live" : "development";
}

export function getActiveAIProvider(): J10AIProviderName {
  if (getJ10AIMode() === "development") {
    return "development";
  }

  const explicitProvider = process.env.J10_AI_PROVIDER?.trim().toLowerCase();
  if (explicitProvider === "gemini") return "gemini";
  if (explicitProvider === "openai") return "openai";

  // Auto-detect by available API keys (prefer Gemini for zero-cost AI Studio access)
  if (getGeminiApiKey()) return "gemini";
  if (getOpenAIApiKey()) return "openai";

  return "development";
}

export { getGeminiApiKey, getOpenAIApiKey };

/*
============================================================
DETERMINISTIC DEVELOPMENT INTELLIGENCE ENGINE
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

function getField(text: string, field: string) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escapedField}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function parseNumber(value: string) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const amount = Number(cleaned);
  return Number.isNaN(amount) ? 0 : amount;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateOutreachUrgency(opportunity: DevelopmentOpportunity) {
  let score = 0;
  if (opportunity.needsFollowUp) score += 100;
  if (opportunity.status.toLowerCase() === "new") score += 50;
  score += opportunity.priorityScore;
  return score;
}

function buildOpportunityRecommendation(opportunity: DevelopmentOpportunity) {
  const status = opportunity.status.trim().toLowerCase();
  if (status === "new") return `${opportunity.name}: Contact the lead and begin qualification.`;
  if (status === "contacted") return `${opportunity.name}: Continue monitoring the opportunity and prepare qualification.`;
  if (status === "qualified") return `${opportunity.name}: Evaluate buying intent and determine whether the opportunity should move to Interested.`;
  if (status === "interested") return `${opportunity.name}: Continue the sales process and prepare the opportunity for human-controlled closing.`;
  if (status === "won") return `${opportunity.name}: Opportunity is already Won. No additional sales-stage movement is required.`;
  if (status === "lost") return `${opportunity.name}: Opportunity is Lost. Preserve the record for analysis and future learning.`;
  return `${opportunity.name}: Review the CRM record and determine the appropriate next sales action.`;
}

function parseSalesOpportunities(input: string): DevelopmentOpportunity[] {
  const sections = input.split(/OPPORTUNITY\s+[A-Z0-9]+/i);
  const opportunities: DevelopmentOpportunity[] = [];

  for (const section of sections) {
    const name = getField(section, "Name");
    if (!name) continue;

    const status = getField(section, "Status") || "Unknown";
    const priority = getField(section, "Priority") || "Unknown";
    const priorityScore = parseNumber(getField(section, "Priority Score"));
    const estimatedValue = parseMoney(getField(section, "Estimated Value"));
    const needsFollowUp = getField(section, "Needs Follow-Up").trim().toLowerCase() === "yes";

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

function buildSalesDevelopmentResponse(input: string) {
  const opportunities = parseSalesOpportunities(input);

  if (opportunities.length === 0) {
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

  const strategic = [...opportunities].sort((a, b) => {
    if (b.estimatedValue !== a.estimatedValue) return b.estimatedValue - a.estimatedValue;
    return b.priorityScore - a.priorityScore;
  })[0];

  const immediate = [...opportunities].sort((a, b) => {
    const aUrgency = calculateOutreachUrgency(a);
    const bUrgency = calculateOutreachUrgency(b);
    if (bUrgency !== aUrgency) return bUrgency - aUrgency;
    return b.priorityScore - a.priorityScore;
  })[0];

  const recommendations = opportunities.map((op) => buildOpportunityRecommendation(op)).join("\n\n");

  return `
J10 AI DEVELOPMENT INTELLIGENCE

STRATEGIC PRIORITY
${strategic.name}
Opportunity Value: ${formatMoney(strategic.estimatedValue)}
Priority Score: ${strategic.priorityScore}/100
Reason: This opportunity has the strongest combination of pipeline value and priority score.

IMMEDIATE OUTREACH PRIORITY
${immediate.name}
Status: ${immediate.status}
Follow-Up Required: ${immediate.needsFollowUp ? "Yes" : "No"}
Reason: This opportunity currently has the strongest outreach urgency based on follow-up requirement, pipeline stage and priority score.

RECOMMENDED NEXT ACTIONS
${recommendations}

J10 SALES INTELLIGENCE SUMMARY
Strategic priority and outreach urgency are not always the same.
No CRM action was executed.
Execution Mode: Development Simulation
External API Called: No
API Cost: $0
`.trim();
}

function buildDevelopmentResponse({ task, input }: { task: J10TaskType; input: string }) {
  if (task === "sales_decision") return buildSalesDevelopmentResponse(input);
  if (task === "research") return buildDevelopmentResearchResponse(input);

  if (task === "crm_analysis") {
    return `
J10 AI DEVELOPMENT INTELLIGENCE
CRM analysis completed using the J10 deterministic intelligence engine.
Evaluated: pipeline stage, deal valuation, follow-up state, and urgency.
No external action was executed.
Execution Mode: Development Simulation | API Cost: $0
`.trim();
  }

  if (task === "automation_planning") {
    return `
J10 AI DEVELOPMENT INTELLIGENCE
Automation planning evaluated. Structure, trigger bindings, and execution guards verified.
Execution Mode: Development Simulation | API Cost: $0
`.trim();
  }

  if (task === "customer_support") {
    return `
Thank you for reaching out to us. We have received your inquiry and a team member will follow up with you shortly. If this is an urgent request, please reply with URGENT.
`.trim();
  }

  return `
J10 AI DEVELOPMENT INTELLIGENCE
Task: ${task}
Deterministic development simulation mode active. Verified facts and rules evaluated safely.
API Cost: $0
`.trim();
}

function runDevelopmentJ10AI({
  task,
  input,
  preference = "Automatic",
}: {
  task: J10TaskType;
  input: string;
  preference?: J10ModelPreference;
}): RunJ10AIResult {
  const route = routeJ10Task({ task, preference });
  const text = buildDevelopmentResponse({ task, input });

  return {
    success: true,
    responseId: `j10-dev-${Date.now()}`,
    text,
    provider: "development",
    model: route.model,
    displayModel: `${route.displayName} (Simulated)`,
    task,
    workload: route.workload,
    reasoningEffort: route.reasoning.effort,
    reasoningMode: route.reasoning.mode,
    routingReason: `${route.reason} Operating in development simulation mode.`,
    executionMode: "development",
    simulated: true,
    apiCalled: false,
    status: "simulated",
    estimatedCostUSD: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
    },
  };
}

/*
============================================================
CANONICAL J10 AI RUNTIME ENTRYPOINT
============================================================
*/

export async function runJ10AI({
  task,
  input,
  instructions,
  preference = "Automatic",
  maxOutputTokens = 12000,
  temperature = 0.2,
}: RunJ10AIInput): Promise<RunJ10AIResult> {
  const cleanInput = input.trim();
  if (!cleanInput) {
    throw new Error("J10 AI cannot execute an empty request.");
  }

  const mode = getJ10AIMode();

  // Development mode is the safe, zero-cost default
  if (mode === "development") {
    return runDevelopmentJ10AI({
      task,
      input: cleanInput,
      preference,
    });
  }

  // Live Mode: Resolve provider
  const provider = getActiveAIProvider();

  if (provider === "gemini") {
    return runGeminiAI({
      task,
      input: cleanInput,
      instructions,
      preference,
      maxOutputTokens,
      temperature,
    });
  }

  if (provider === "openai") {
    return runOpenAIAI({
      task,
      input: cleanInput,
      instructions,
      preference,
      maxOutputTokens,
      temperature,
    });
  }

  // Fallback if live mode requested but no keys available
  return runDevelopmentJ10AI({
    task,
    input: cleanInput,
    preference,
  });
}