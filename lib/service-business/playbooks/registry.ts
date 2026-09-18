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
  services: [],
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
  beauty: beautyGroomingPlaybook,
  auto_detailing: autoDetailingPlaybook,
  detailing: autoDetailingPlaybook,
  general_service: defaultPlaybook,
};

/**
 * Checks if a key maps to a registered playbook.
 */
export function isValidPlaybookKey(key?: string | null): boolean {
  if (!key) return false;
  const normalized = key.trim().toLowerCase().replace(/-/g, "_");
  return Object.prototype.hasOwnProperty.call(playbooks, normalized);
}

/**
 * Retrieves a playbook by key, falling back to defaultPlaybook safely.
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
 * Authoritatively resolves the validated canonical playbook key from workspace and integration configuration.
 * Safe fallback to 'general_service' for missing or invalid keys.
 */
export function resolveAuthoritativePlaybookKey(sources?: {
  workspaceMetadata?: Record<string, unknown> | null;
  integrationConfig?: Record<string, unknown> | null;
  requestedKey?: string | null;
} | null): string {
  if (!sources) return "general_service";

  const candidates: Array<unknown> = [
    sources.requestedKey,
    sources.workspaceMetadata?.playbook_key,
    sources.workspaceMetadata?.playbookKey,
    sources.workspaceMetadata?.industry,
    sources.integrationConfig?.playbook_key,
    sources.integrationConfig?.playbookKey,
    sources.integrationConfig?.industry,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const normalized = c.trim().toLowerCase().replace(/-/g, "_");
      if (playbooks[normalized]) {
        return playbooks[normalized].playbookKey;
      }
    }
  }

  return "general_service";
}

/**
 * Resolves the active playbook for a workspace authoritatively.
 */
export function resolvePlaybookForWorkspace(
  metadata?: Record<string, unknown> | null,
  integrationConfig?: Record<string, unknown> | null
): ServicePlaybook {
  const canonicalKey = resolveAuthoritativePlaybookKey({
    workspaceMetadata: metadata,
    integrationConfig,
  });
  return getPlaybook(canonicalKey);
}
