export interface PlanDefinition {
  id: "starter" | "growth" | "enterprise";
  name: string;
  price: number;
  interval: string;
  description: string;
  messageLimit: number;
  aiEmployees: number;
  popular?: boolean;
  features: string[];
}

export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    interval: "month",
    description: "Perfect for emerging businesses automating WhatsApp and lead capture.",
    messageLimit: 1000,
    aiEmployees: 2,
    features: [
      "1,000 automated messages/mo",
      "2 active AI Employees",
      "WhatsApp Cloud API integration",
      "CRM contacts & pipeline sync",
      "Knowledge Hub grounding (10 articles)",
      "Standard email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 149,
    interval: "month",
    description: "For scaling teams that need autonomous multi-agent sales & marketing.",
    messageLimit: 10000,
    aiEmployees: 10,
    popular: true,
    features: [
      "10,000 automated messages/mo",
      "10 active AI Employees",
      "WhatsApp & Marketing Broadcasts",
      "Full Knowledge Hub grounding (unlimited)",
      "Zero-hallucination AI reply suggestions",
      "Stripe payment webhooks & finance sync",
      "Priority latency routing",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    interval: "month",
    description: "High-volume infrastructure for large operations with custom SLA.",
    messageLimit: 100000,
    aiEmployees: 999,
    features: [
      "100,000 automated messages/mo",
      "Unlimited AI Employees",
      "Dedicated Meta Graph API throughput",
      "Custom system prompts & model routing",
      "Multi-user RBAC & team management",
      "Custom webhooks & ERP integrations",
      "24/7 dedicated engineering SLA",
    ],
  },
];
