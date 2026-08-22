export const INTEGRATION_PROVIDER_IDS = [
  "gmail",
  "google-calendar",
  "whatsapp-business",
  "shopify",
  "stripe",
  "generic-webhook",
  "outlook-mail",
  "outlook-calendar",
  "microsoft-teams",
  "slack",
  "discord",
  "telegram",
  "twilio",
  "google-drive",
  "google-sheets",
  "onedrive",
  "dropbox",
  "notion",
  "airtable",
  "zoom",
  "calendly",
  "trello",
  "asana",
  "monday",
  "clickup",
  "hubspot",
  "salesforce",
  "pipedrive",
  "mailchimp",
  "meta-business",
  "instagram-business",
  "youtube",
  "tiktok",
  "linkedin",
  "x",
  "woocommerce",
  "paypal",
  "square",
  "quickbooks",
  "xero",
  "amazon-seller",
  "etsy",
  "ebay",
  "tiktok-shop",
  "github",
  "zapier",
  "make",
  "openai",
  "anthropic",
  "gemini",
  "hugging-face",
  "runway",
  "higgsfield",
  "pika",
  "kling",
] as const;

export type IntegrationProviderId =
  (typeof INTEGRATION_PROVIDER_IDS)[number];

export const INTEGRATION_CATEGORIES = [
  "communication",
  "productivity",
  "file-storage",
  "project-management",
  "crm",
  "marketing",
  "social-media",
  "commerce",
  "payments",
  "finance",
  "automation",
  "developer-tools",
  "ai-models",
  "creative-ai",
] as const;

export type IntegrationCategory =
  (typeof INTEGRATION_CATEGORIES)[number];

export const INTEGRATION_AVAILABILITY = [
  "planned",
  "development",
  "beta",
  "available",
] as const;

export type IntegrationAvailability =
  (typeof INTEGRATION_AVAILABILITY)[number];

export const INTEGRATION_AUTH_TYPES = [
  "oauth2",
  "access_token",
  "secret_key",
  "webhook_secret",
] as const;

export type IntegrationAuthType =
  (typeof INTEGRATION_AUTH_TYPES)[number];

export const INTEGRATION_ENVIRONMENTS = [
  "development",
  "sandbox",
  "production",
] as const;

export type IntegrationEnvironment =
  (typeof INTEGRATION_ENVIRONMENTS)[number];

export const INTEGRATION_CONNECTION_STATUSES = [
  "not_configured",
  "pending",
  "connected",
  "degraded",
  "disconnected",
  "error",
  "revoked",
  "disabled",
] as const;

export type IntegrationConnectionStatus =
  (typeof INTEGRATION_CONNECTION_STATUSES)[number];

export const INTEGRATION_CAPABILITY_KINDS = [
  "trigger",
  "action",
] as const;

export type IntegrationCapabilityKind =
  (typeof INTEGRATION_CAPABILITY_KINDS)[number];

export type IntegrationWebhookSupport =
  | "none"
  | "incoming"
  | "outgoing"
  | "bidirectional";

export type IntegrationSetupFieldKind =
  | "text"
  | "url"
  | "secret";

export type IntegrationSetupFieldStorage =
  | "connection"
  | "credential_vault";

export interface IntegrationSetupFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly kind: IntegrationSetupFieldKind;
  readonly required: boolean;
  readonly storage: IntegrationSetupFieldStorage;
  readonly placeholder?: string;
  readonly helpText?: string;
}

export interface IntegrationAuthDefinition {
  readonly type: IntegrationAuthType;
  readonly requiredScopes: readonly string[];
  readonly supportsRefreshTokens: boolean;
  readonly setupFields: readonly IntegrationSetupFieldDefinition[];
}

export interface IntegrationCapabilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: IntegrationCapabilityKind;
  readonly description: string;
  readonly requiresApprovalByDefault: boolean;
}

export interface IntegrationProviderDefinition {
  readonly id: IntegrationProviderId;
  readonly name: string;
  readonly shortDescription: string;
  readonly category: IntegrationCategory;
  readonly availability: IntegrationAvailability;
  readonly iconKey: string;
  readonly accentColor: string;
  readonly auth: IntegrationAuthDefinition;
  readonly environments: readonly IntegrationEnvironment[];
  readonly webhookSupport: IntegrationWebhookSupport;
  readonly supportsHealthChecks: boolean;
  readonly capabilities: readonly IntegrationCapabilityDefinition[];
}

/**
 * Raw access tokens, API keys, and webhook secrets must never be stored
 * directly on this connection object.
 *
 * credentialReference points to the encrypted credential envelope managed
 * by the Day 14C credential vault.
 */
export interface IntegrationConnection {
  readonly id: string;
  readonly workspaceId: string;
  readonly providerId: IntegrationProviderId;
  readonly name: string;
  readonly status: IntegrationConnectionStatus;
  readonly environment: IntegrationEnvironment;
  readonly credentialReference: string | null;
  readonly externalAccountId: string | null;
  readonly externalAccountLabel: string | null;
  readonly grantedScopes: readonly string[];
  readonly enabledCapabilities: readonly string[];

  /** Only non-sensitive configuration is allowed here. */
  readonly publicConfiguration: Readonly<
    Record<string, string | number | boolean | null>
  >;

  readonly lastConnectedAt: string | null;
  readonly lastHealthCheckAt: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IntegrationRegistryQuery {
  readonly category?: IntegrationCategory;
  readonly availability?: IntegrationAvailability;
  readonly capabilityKind?: IntegrationCapabilityKind;
}