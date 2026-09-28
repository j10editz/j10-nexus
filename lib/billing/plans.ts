export type PlanId = "starter" | "growth" | "business" | "enterprise" | "founders3";

export type PublicPlanId = "starter" | "growth" | "business" | "enterprise";

export type PlanFeatureKey =
  | "whatsapp_broadcasts"
  | "knowledge_hub_unlimited"
  | "custom_system_prompts"
  | "dedicated_meta_throughput"
  | "custom_webhooks_erp"
  | "priority_sla"
  | "multi_agent_coordination"
  | "sop_suggested_replies";

export interface PlanEntitlements {
  whatsappBroadcasts: boolean;
  aiEmployeesQuota: number;
  knowledgeArticlesQuota: number;
  customSystemPrompts: boolean;
  dedicatedMetaThroughput: boolean;
  customWebhooksErp: boolean;
  teamSeatsQuota: number;
  prioritySla: boolean;
  multiAgentCoordination: boolean;
  sopSuggestedReplies: boolean;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  price: number;
  annualPrice?: number;
  standardPrice?: number;
  introductoryCycleDuration?: number;
  interval: string;
  description: string;
  messageLimit: number;
  aiEmployees: number;
  seatsAllowed?: number;
  connectedChannelsAllowed?: number;
  popular?: boolean;
  quoteOnly?: boolean;
  privateOnly?: boolean;
  features: string[];
  stripePriceMonthly?: string;
  stripePriceAnnual?: string;
  stripePriceLookupKey?: string;
  stripeStandardPriceMonthly?: string;
  stripeStandardPriceLookupKey?: string;
  entitlements: PlanEntitlements;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    price: 19,
    annualPrice: 190,
    interval: "month",
    description: "Essential revenue automation for emerging businesses.",
    messageLimit: 1000,
    aiEmployees: 2,
    seatsAllowed: 1,
    connectedChannelsAllowed: 1,
    popular: false,
    quoteOnly: false,
    privateOnly: false,
    stripePriceLookupKey: "j10_starter_monthly_19",
    features: [
      "$19/month or $190/year (10 monthly payments)",
      "1,000 automated messages/mo",
      "2 active AI Employees",
      "WhatsApp & Telegram integrations",
      "CRM contacts & unified pipeline sync",
      "Knowledge Hub grounding (10 articles)",
      "Standard email support",
      "Provider usage charges billed separately",
    ],
    entitlements: {
      whatsappBroadcasts: false,
      aiEmployeesQuota: 2,
      knowledgeArticlesQuota: 10,
      customSystemPrompts: false,
      dedicatedMetaThroughput: false,
      customWebhooksErp: false,
      teamSeatsQuota: 1,
      prioritySla: false,
      multiAgentCoordination: false,
      sopSuggestedReplies: false,
    },
  },
  {
    id: "growth",
    name: "Growth",
    price: 49,
    annualPrice: 490,
    interval: "month",
    description: "For scaling teams that need autonomous multi-agent sales & marketing.",
    messageLimit: 10000,
    aiEmployees: 10,
    seatsAllowed: 5,
    connectedChannelsAllowed: 5,
    popular: true,
    quoteOnly: false,
    privateOnly: false,
    stripePriceLookupKey: "j10_growth_monthly_49",
    features: [
      "$49/month or $490/year (10 monthly payments)",
      "10,000 automated messages/mo",
      "10 active AI Employees",
      "WhatsApp & Marketing Broadcasts",
      "Full Knowledge Hub grounding (unlimited)",
      "SOP-grounded AI reply suggestions",
      "Stripe payment webhooks & finance sync",
      "Priority latency routing",
      "Provider usage charges billed separately",
    ],
    entitlements: {
      whatsappBroadcasts: true,
      aiEmployeesQuota: 10,
      knowledgeArticlesQuota: 1000,
      customSystemPrompts: false,
      dedicatedMetaThroughput: false,
      customWebhooksErp: false,
      teamSeatsQuota: 5,
      prioritySla: true,
      multiAgentCoordination: true,
      sopSuggestedReplies: true,
    },
  },
  {
    id: "business",
    name: "Business",
    price: 99,
    annualPrice: 990,
    interval: "month",
    description: "Comprehensive operations platform with expanded capacity and priority throughput.",
    messageLimit: 30000,
    aiEmployees: 25,
    seatsAllowed: 15,
    connectedChannelsAllowed: 10,
    popular: false,
    quoteOnly: false,
    privateOnly: false,
    stripePriceLookupKey: "j10_business_monthly_99",
    features: [
      "$99/month or $990/year (10 monthly payments)",
      "30,000 automated messages/mo",
      "25 active AI Employees",
      "Advanced multi-agent coordination",
      "Dedicated channel throughput & ERP webhooks",
      "Full Knowledge Hub & custom SOPs",
      "Priority SLA & dedicated onboarding",
      "Provider usage charges billed separately",
    ],
    entitlements: {
      whatsappBroadcasts: true,
      aiEmployeesQuota: 25,
      knowledgeArticlesQuota: 5000,
      customSystemPrompts: true,
      dedicatedMetaThroughput: false,
      customWebhooksErp: true,
      teamSeatsQuota: 15,
      prioritySla: true,
      multiAgentCoordination: true,
      sopSuggestedReplies: true,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 199,
    interval: "month",
    description: "Dedicated infrastructure, custom SLAs, and custom AI agent workflows. Starting from $199/mo.",
    messageLimit: 100000,
    aiEmployees: 999,
    seatsAllowed: 999,
    connectedChannelsAllowed: 999,
    popular: false,
    quoteOnly: true,
    privateOnly: false,
    features: [
      "Starting from $199/month (custom quote)",
      "Contact sales — no self-service checkout",
      "100,000+ automated messages/mo",
      "Unlimited AI Employees & custom system prompts",
      "Dedicated Meta Graph API throughput",
      "Custom webhooks & ERP integrations",
      "Multi-user RBAC & team management",
      "24/7 dedicated engineering SLA",
      "Provider usage charges billed separately",
    ],
    entitlements: {
      whatsappBroadcasts: true,
      aiEmployeesQuota: 999,
      knowledgeArticlesQuota: 999999,
      customSystemPrompts: true,
      dedicatedMetaThroughput: true,
      customWebhooksErp: true,
      teamSeatsQuota: 999,
      prioritySla: true,
      multiAgentCoordination: true,
      sopSuggestedReplies: true,
    },
  },
  {
    id: "founders3",
    name: "Founder's 3 Pilot",
    price: 29,
    standardPrice: 49,
    introductoryCycleDuration: 12,
    interval: "month",
    description: "Private offer limited to the first three eligible paying customers—Growth tier for $29/month for 12 months, then automatically transitions to normal $49/month Growth price.",
    messageLimit: 10000,
    aiEmployees: 10,
    seatsAllowed: 5,
    connectedChannelsAllowed: 5,
    popular: false,
    quoteOnly: false,
    privateOnly: true,
    stripePriceLookupKey: "j10_founders3_monthly_29",
    stripeStandardPriceLookupKey: "j10_growth_monthly_49",
    features: [
      "$29/mo for your first 12 paid months (then $49/mo Growth)",
      "10,000 automated messages/mo (Growth tier)",
      "10 active AI Employees",
      "WhatsApp & Telegram messaging integrations",
      "Unified Inbox & CRM contact persistence",
      "Lead qualification & human takeover",
      "Services, pricing, business hours & FAQ grounding",
      "Founder concierge setup & direct engineering support",
      "5 team member seats",
      "Provider usage charges billed separately",
    ],
    entitlements: {
      whatsappBroadcasts: true,
      aiEmployeesQuota: 10,
      knowledgeArticlesQuota: 1000,
      customSystemPrompts: false,
      dedicatedMetaThroughput: false,
      customWebhooksErp: false,
      teamSeatsQuota: 5,
      prioritySla: true,
      multiAgentCoordination: true,
      sopSuggestedReplies: true,
    },
  },
];

export const PUBLIC_PLANS: PlanDefinition[] = PLANS.filter((p) => !p.privateOnly);

export function getPlanById(planId: string): PlanDefinition {
  const normalized = (planId || "").trim().toLowerCase();
  return PLANS.find((p) => p.id === normalized) || PLANS[0];
}

export function isFeatureEnabledForPlan(planId: string, feature: PlanFeatureKey | string): boolean {
  const plan = getPlanById(planId);
  switch (feature) {
    case "whatsapp_broadcasts":
      return plan.entitlements.whatsappBroadcasts;
    case "knowledge_hub_unlimited":
      return plan.entitlements.knowledgeArticlesQuota > 10;
    case "custom_system_prompts":
      return plan.entitlements.customSystemPrompts;
    case "dedicated_meta_throughput":
      return plan.entitlements.dedicatedMetaThroughput;
    case "custom_webhooks_erp":
      return plan.entitlements.customWebhooksErp;
    case "priority_sla":
      return plan.entitlements.prioritySla;
    case "multi_agent_coordination":
      return plan.entitlements.multiAgentCoordination;
    case "sop_suggested_replies":
    case "whatsapp_reply_suggestions":
      return plan.entitlements.sopSuggestedReplies;
    default:
      // Other operational capability strings (e.g. standard message send) are permitted on all active plans
      return true;
  }
}
