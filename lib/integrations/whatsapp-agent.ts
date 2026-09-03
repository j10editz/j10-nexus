import type { IntegrationConnection } from "@/types/integration";

export const WHATSAPP_AGENT_CONFIG_KEY = "whatsapp_ai_agent_config";

export type WhatsAppAgentMode = "suggestions" | "supervised";

export type WhatsAppAgentConfig = {
  agentName: string;
  businessName: string;
  role: string;
  tone: string;
  languages: string;
  businessKnowledge: string;
  instructions: string;
  escalationRules: string;
  prohibitedTopics: string;
  mode: WhatsAppAgentMode;
  active: boolean;
};

export const DEFAULT_WHATSAPP_AGENT_CONFIG: WhatsAppAgentConfig = {
  agentName: "J10 Assistant",
  businessName: "",
  role: "Customer support",
  tone: "Professional and friendly",
  languages: "Reply in the customer's language",
  businessKnowledge: "",
  instructions: "Be concise, helpful, and honest.",
  escalationRules: "Escalate requests involving refunds, legal issues, complaints, or account security.",
  prohibitedTopics: "Never invent prices, policies, availability, order status, or completed actions.",
  mode: "suggestions",
  active: false,
};

const limit = (value: unknown, max: number, fallback = "") =>
  typeof value === "string" ? value.trim().slice(0, max) : fallback;

export function parseWhatsAppAgentConfig(value: unknown): WhatsAppAgentConfig {
  let source: Record<string, unknown> = {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) source = parsed as Record<string, unknown>;
  } catch {}

  const mode = source.mode === "supervised" ? "supervised" : "suggestions";
  return {
    agentName: limit(source.agentName, 80, DEFAULT_WHATSAPP_AGENT_CONFIG.agentName),
    businessName: limit(source.businessName, 120),
    role: limit(source.role, 80, DEFAULT_WHATSAPP_AGENT_CONFIG.role),
    tone: limit(source.tone, 80, DEFAULT_WHATSAPP_AGENT_CONFIG.tone),
    languages: limit(source.languages, 200, DEFAULT_WHATSAPP_AGENT_CONFIG.languages),
    businessKnowledge: limit(source.businessKnowledge, 16000),
    instructions: limit(source.instructions, 4000, DEFAULT_WHATSAPP_AGENT_CONFIG.instructions),
    escalationRules: limit(source.escalationRules, 4000, DEFAULT_WHATSAPP_AGENT_CONFIG.escalationRules),
    prohibitedTopics: limit(source.prohibitedTopics, 4000, DEFAULT_WHATSAPP_AGENT_CONFIG.prohibitedTopics),
    mode,
    active: source.active === true,
  };
}

export function getWhatsAppAgentConfig(connection: IntegrationConnection) {
  return parseWhatsAppAgentConfig(connection.publicConfiguration[WHATSAPP_AGENT_CONFIG_KEY]);
}

export function getWhatsAppAgentReadiness(config: WhatsAppAgentConfig) {
  const missing: string[] = [];
  if (!config.businessName) missing.push("Business name");
  if (config.businessKnowledge.length < 20) missing.push("Business knowledge");
  if (config.instructions.length < 10) missing.push("Agent instructions");
  if (config.escalationRules.length < 10) missing.push("Escalation rules");
  return { ready: missing.length === 0, missing };
}

export function buildWhatsAppAgentInstructions(config: WhatsAppAgentConfig) {
  return `You are ${config.agentName}, the ${config.role} WhatsApp agent for ${config.businessName || "this business"}.
Tone: ${config.tone}.
Language policy: ${config.languages}.
Business knowledge (the only source of business-specific facts):
${config.businessKnowledge || "No verified business knowledge has been supplied."}
Operating instructions: ${config.instructions}
Escalation rules: ${config.escalationRules}
Safety rules: ${config.prohibitedTopics}
Write one concise, natural WhatsApp reply. Use only verified knowledge above. When information is missing or escalation is required, say so and ask for the minimum useful detail. Never claim an action was completed. Do not include analysis, labels, quotation marks, or markdown.`;
}
