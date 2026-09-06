export type PlanId = "starter" | "growth" | "enterprise";

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
  interval: string;
  description: string;
  messageLimit: number;
  aiEmployees: number;
  popular?: boolean;
  features: string[];
  stripePriceMonthly?: string;
  stripePriceAnnual?: string;
  entitlements: PlanEntitlements;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    annualPrice: 39,
    interval: "month",
    description: "Perfect for emerging businesses automating WhatsApp and lead capture.",
    messageLimit: 1000,
    aiEmployees: 2,
    stripePriceMonthly: "price_starter_monthly",
    features: [
      "1,000 automated messages/mo",
      "2 active AI Employees",
      "WhatsApp Cloud API integration",
      "CRM contacts & pipeline sync",
      "Knowledge Hub grounding (10 articles)",
      "Standard email support",
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
    price: 149,
    annualPrice: 119,
    interval: "month",
    description: "For scaling teams that need autonomous multi-agent sales & marketing.",
    messageLimit: 10000,
    aiEmployees: 10,
    popular: true,
    stripePriceMonthly: "price_growth_monthly",
    features: [
      "10,000 automated messages/mo",
      "10 active AI Employees",
      "WhatsApp & Marketing Broadcasts",
      "Full Knowledge Hub grounding (unlimited)",
      "SOP-grounded AI reply suggestions",
      "Stripe payment webhooks & finance sync",
      "Priority latency routing",
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
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    annualPrice: 399,
    interval: "month",
    description: "High-volume infrastructure for large operations with custom SLA.",
    messageLimit: 100000,
    aiEmployees: 999,
    stripePriceMonthly: "price_enterprise_monthly",
    stripePriceAnnual: "tier_enterprise_annual",
    features: [
      "100,000 automated messages/mo",
      "Unlimited AI Employees",
      "Dedicated Meta Graph API throughput",
      "Custom system prompts & model routing",
      "Multi-user RBAC & team management",
      "Custom webhooks & ERP integrations",
      "24/7 dedicated engineering SLA",
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
];

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
