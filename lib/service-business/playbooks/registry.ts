import type { ServicePlaybook } from "../types";
import { beautyGroomingPlaybook } from "./beauty-grooming";
import { autoDetailingPlaybook } from "./auto-detailing";

export const defaultPlaybook: ServicePlaybook = {
  playbookKey: "general_service",
  industryName: "General Service Business",
  displayName: "Universal Service Business Playbook",
  description: "Default conversion playbook for appointment-based service businesses.",
  terminology: {
    serviceLabel: "service",
    bookingLabel: "appointment",
    providerLabel: "specialist",
  },
  defaultDurationMinutes: 60,
  services: [
    {
      key: "standard_service",
      name: "Standard Service Consultation",
      price: null,
      priceDisplay: "Custom Quote",
      durationMinutes: 60,
      description: "Initial consultation and service delivery.",
      requiresQuote: true,
    },
  ],
  qualificationQuestions: {
    service: "What type of service are you looking for?",
    date: "What date works best for you?",
    time: "What time of day do you prefer?",
  },
  escalationKeywords: ["complaint", "refund", "manager", "human", "supervisor", "speak to someone"],
  systemPromptInstructions:
    "You are a helpful and professional AI receptionist for this service business. Answer customer inquiries, assist with scheduling, and gather qualification details.",
};

const playbooks: Record<string, ServicePlaybook> = {
  beauty_grooming: beautyGroomingPlaybook,
  beauty: beautyGroomingPlaybook, // alias for backwards compatibility
  auto_detailing: autoDetailingPlaybook,
  detailing: autoDetailingPlaybook, // alias
  general_service: defaultPlaybook,
};

/**
 * Retrieves a playbook by key, falling back to defaultPlaybook.
 */
export function getPlaybook(key?: string | null): ServicePlaybook {
  if (!key) return defaultPlaybook;
  const normalized = key.trim().toLowerCase().replace(/-/g, "_");
  return playbooks[normalized] || defaultPlaybook;
}

/**
 * Lists all registered playbooks.
 */
export function listPlaybooks(): ServicePlaybook[] {
  return [beautyGroomingPlaybook, autoDetailingPlaybook, defaultPlaybook];
}

/**
 * Resolves the active playbook for a workspace based on its metadata or configuration.
 */
export function resolvePlaybookForWorkspace(metadata?: Record<string, unknown> | null): ServicePlaybook {
  if (!metadata) return defaultPlaybook;
  const key =
    (typeof metadata.playbook_key === "string" && metadata.playbook_key) ||
    (typeof metadata.playbookKey === "string" && metadata.playbookKey) ||
    (typeof metadata.industry === "string" && metadata.industry) ||
    null;
  return getPlaybook(key);
}
