import type {
  IntegrationAuthType,
  IntegrationCapabilityDefinition,
  IntegrationCategory,
  IntegrationProviderDefinition,
  IntegrationProviderId,
  IntegrationRegistryQuery,
  IntegrationWebhookSupport,
} from "../../types/integration";

function capability(
  id: string,
  name: string,
  kind: "trigger" | "action",
  description: string,
  requiresApprovalByDefault = false,
): IntegrationCapabilityDefinition {
  return {
    id,
    name,
    kind,
    description,
    requiresApprovalByDefault,
  };
}

type PlannedProviderInput = {
  id: IntegrationProviderId;
  name: string;
  description: string;
  category: IntegrationCategory;
  accentColor: string;
  authType?: IntegrationAuthType;
  webhookSupport?: IntegrationWebhookSupport;
  triggers: readonly string[];
  actions: readonly string[];
};

function capabilitySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function plannedProvider(
  input: PlannedProviderInput,
): IntegrationProviderDefinition {
  const authType = input.authType ?? "oauth2";

  return {
    id: input.id,
    name: input.name,
    shortDescription: input.description,
    category: input.category,
    availability: "planned",
    iconKey: input.category,
    accentColor: input.accentColor,
    auth: {
      type: authType,
      requiredScopes: [],
      supportsRefreshTokens: authType === "oauth2",
      setupFields: [],
    },
    environments: ["development", "production"],
    webhookSupport: input.webhookSupport ?? "incoming",
    supportsHealthChecks: false,
    capabilities: [
      ...input.triggers.map((name) =>
        capability(
          `${input.id}.${capabilitySegment(name)}`,
          name,
          "trigger",
          `Starts a workflow when ${input.name} reports: ${name}.`,
        ),
      ),
      ...input.actions.map((name) =>
        capability(
          `${input.id}.${capabilitySegment(name)}`,
          name,
          "action",
          `Performs ${name} through the connected ${input.name} account.`,
          true,
        ),
      ),
    ],
  };
}

export const INTEGRATION_REGISTRY: Readonly<
  Record<IntegrationProviderId, IntegrationProviderDefinition>
> = {
  gmail: {
    id: "gmail",
    name: "Gmail",
    shortDescription:
      "Receive, organize, send, and reply to business email.",
    category: "communication",
    availability: "development",
    iconKey: "mail",
    accentColor: "#EA4335",
    auth: {
      type: "oauth2",
      requiredScopes: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      supportsRefreshTokens: true,
      setupFields: [],
    },
    environments: ["development", "production"],
    webhookSupport: "incoming",
    supportsHealthChecks: true,
    capabilities: [
      capability(
        "gmail.message.received",
        "Email Received",
        "trigger",
        "Starts a workflow when a new Gmail message is received.",
      ),
      capability(
        "gmail.message.send",
        "Send Email",
        "action",
        "Sends a new email through the connected Gmail account.",
        true,
      ),
      capability(
        "gmail.message.reply",
        "Reply to Email",
        "action",
        "Replies to an existing Gmail conversation.",
        true,
      ),
      capability(
        "gmail.message.add_label",
        "Add Email Label",
        "action",
        "Adds a Gmail label to an email or conversation.",
      ),
    ],
  },

  "google-calendar": {
    id: "google-calendar",
    name: "Google Calendar",
    shortDescription:
      "Create, update, cancel, and monitor calendar events.",
    category: "productivity",
    availability: "development",
    iconKey: "calendar-days",
    accentColor: "#4285F4",
    auth: {
      type: "oauth2",
      requiredScopes: [
        "https://www.googleapis.com/auth/calendar.events",
      ],
      supportsRefreshTokens: true,
      setupFields: [],
    },
    environments: ["development", "production"],
    webhookSupport: "incoming",
    supportsHealthChecks: true,
    capabilities: [
      capability(
        "google-calendar.event.created",
        "Event Created",
        "trigger",
        "Starts a workflow when a calendar event is created.",
      ),
      capability(
        "google-calendar.event.updated",
        "Event Updated",
        "trigger",
        "Starts a workflow when a calendar event is updated.",
      ),
      capability(
        "google-calendar.event.cancelled",
        "Event Cancelled",
        "trigger",
        "Starts a workflow when a calendar event is cancelled.",
      ),
      capability(
        "google-calendar.event.create",
        "Create Event",
        "action",
        "Creates a new Google Calendar event.",
        true,
      ),
      capability(
        "google-calendar.event.update",
        "Update Event",
        "action",
        "Updates an existing Google Calendar event.",
        true,
      ),
      capability(
        "google-calendar.event.cancel",
        "Cancel Event",
        "action",
        "Cancels an existing Google Calendar event.",
        true,
      ),
    ],
  },

  "whatsapp-business": {
    id: "whatsapp-business",
    name: "WhatsApp Business",
    shortDescription:
      "Automate customer conversations using WhatsApp Business.",
    category: "communication",
    availability: "development",
    iconKey: "message-circle",
    accentColor: "#25D366",
    auth: {
      type: "access_token",
      requiredScopes: [],
      supportsRefreshTokens: false,
      setupFields: [
        {
          key: "access_token",
          label: "Access Token",
          kind: "secret",
          required: true,
          storage: "credential_vault",
          helpText: "Permanent or system-user access token from Meta.",
        },
        {
          key: "webhook_verify_token",
          label: "Webhook Verify Token",
          kind: "secret",
          required: true,
          storage: "credential_vault",
        },
        {
          key: "app_secret",
          label: "Meta App Secret",
          kind: "secret",
          required: true,
          storage: "credential_vault",
          helpText:
            "Used to validate signed WhatsApp webhook deliveries from Meta.",
        },
        {
          key: "phone_number_id",
          label: "Phone Number ID",
          kind: "text",
          required: true,
          storage: "connection",
        },
        {
          key: "business_account_id",
          label: "Business Account ID",
          kind: "text",
          required: true,
          storage: "connection",
        },
      ],
    },
    environments: ["development", "production"],
    webhookSupport: "bidirectional",
    supportsHealthChecks: true,
    capabilities: [
      capability(
        "whatsapp.message.received",
        "Message Received",
        "trigger",
        "Starts a workflow when a WhatsApp message is received.",
      ),
      capability(
        "whatsapp.message.status_updated",
        "Message Status Updated",
        "trigger",
        "Starts a workflow when message delivery status changes.",
      ),
      capability(
        "whatsapp.message.send",
        "Send Message",
        "action",
        "Sends a WhatsApp message to a customer.",
        true,
      ),
      capability(
        "whatsapp.template.send",
        "Send Template",
        "action",
        "Sends an approved WhatsApp message template.",
        true,
      ),
      capability(
        "whatsapp.media.send",
        "Send Media",
        "action",
        "Sends an image, document, audio file, or video.",
        true,
      ),
    ],
  },

  shopify: {
    id: "shopify",
    name: "Shopify",
    shortDescription:
      "Connect orders, customers, products, and inventory.",
    category: "commerce",
    availability: "development",
    iconKey: "shopping-bag",
    accentColor: "#95BF47",
    auth: {
      type: "access_token",
      requiredScopes: [],
      supportsRefreshTokens: false,
      setupFields: [
        {
          key: "store_domain",
          label: "Store Domain",
          kind: "url",
          required: true,
          storage: "connection",
          placeholder: "your-store.myshopify.com",
        },
        {
          key: "admin_access_token",
          label: "Admin API Access Token",
          kind: "secret",
          required: true,
          storage: "credential_vault",
        },
        {
          key: "webhook_secret",
          label: "Webhook Secret",
          kind: "secret",
          required: true,
          storage: "credential_vault",
        },
      ],
    },
    environments: ["development", "sandbox", "production"],
    webhookSupport: "bidirectional",
    supportsHealthChecks: true,
    capabilities: [
      capability(
        "shopify.order.created",
        "Order Created",
        "trigger",
        "Starts a workflow when a Shopify order is created.",
      ),
      capability(
        "shopify.order.paid",
        "Order Paid",
        "trigger",
        "Starts a workflow when an order is paid.",
      ),
      capability(
        "shopify.customer.created",
        "Customer Created",
        "trigger",
        "Starts a workflow when a new customer is created.",
      ),
      capability(
        "shopify.order.add_tag",
        "Add Order Tag",
        "action",
        "Adds a tag to a Shopify order.",
      ),
      capability(
        "shopify.order.fulfill",
        "Fulfill Order",
        "action",
        "Creates fulfillment for a Shopify order.",
        true,
      ),
      capability(
        "shopify.inventory.adjust",
        "Adjust Inventory",
        "action",
        "Changes the available inventory for a product.",
        true,
      ),
    ],
  },

  stripe: {
    id: "stripe",
    name: "Stripe",
    shortDescription:
      "Monitor payments and automate supported billing actions.",
    category: "payments",
    availability: "development",
    iconKey: "credit-card",
    accentColor: "#635BFF",
    auth: {
      type: "secret_key",
      requiredScopes: [],
      supportsRefreshTokens: false,
      setupFields: [
        {
          key: "secret_key",
          label: "Stripe Secret Key",
          kind: "secret",
          required: true,
          storage: "credential_vault",
        },
        {
          key: "webhook_signing_secret",
          label: "Webhook Signing Secret",
          kind: "secret",
          required: true,
          storage: "credential_vault",
        },
      ],
    },
    environments: ["development", "sandbox", "production"],
    webhookSupport: "bidirectional",
    supportsHealthChecks: true,
    capabilities: [
      capability(
        "stripe.payment.succeeded",
        "Payment Succeeded",
        "trigger",
        "Starts a workflow after a successful payment.",
      ),
      capability(
        "stripe.payment.failed",
        "Payment Failed",
        "trigger",
        "Starts a workflow after a failed payment.",
      ),
      capability(
        "stripe.subscription.updated",
        "Subscription Updated",
        "trigger",
        "Starts a workflow when a subscription changes.",
      ),
      capability(
        "stripe.payment_link.create",
        "Create Payment Link",
        "action",
        "Creates a Stripe payment link.",
        true,
      ),
      capability(
        "stripe.payment.refund",
        "Refund Payment",
        "action",
        "Refunds an eligible Stripe payment.",
        true,
      ),
      capability(
        "stripe.subscription.cancel",
        "Cancel Subscription",
        "action",
        "Cancels a Stripe subscription.",
        true,
      ),
    ],
  },

  "generic-webhook": {
    id: "generic-webhook",
    name: "Generic Webhook",
    shortDescription:
      "Receive external events and send authenticated HTTP requests.",
    category: "developer-tools",
    availability: "development",
    iconKey: "webhook",
    accentColor: "#8B5CF6",
    auth: {
      type: "webhook_secret",
      requiredScopes: [],
      supportsRefreshTokens: false,
      setupFields: [
        {
          key: "signing_secret",
          label: "Signing Secret",
          kind: "secret",
          required: false,
          storage: "credential_vault",
          helpText:
            "Optional secret used to verify or sign webhook requests.",
        },
      ],
    },
    environments: ["development", "sandbox", "production"],
    webhookSupport: "bidirectional",
    supportsHealthChecks: false,
    capabilities: [
      capability(
        "webhook.request.received",
        "Webhook Received",
        "trigger",
        "Starts a workflow when the generated webhook URL receives a request.",
      ),
      capability(
        "webhook.request.send",
        "Send HTTP Request",
        "action",
        "Sends an outbound HTTP request to an approved endpoint.",
        true,
      ),
      capability(
        "webhook.response.return",
        "Return Webhook Response",
        "action",
        "Returns a structured response to the original webhook request.",
      ),
    ],
  },

  "outlook-mail": plannedProvider({
    id: "outlook-mail",
    name: "Outlook Mail",
    description: "Read, organize, send, and reply to Microsoft 365 email.",
    category: "communication",
    accentColor: "#0078D4",
    triggers: ["Email Received", "Email Flagged"],
    actions: ["Send Email", "Reply to Email", "Move Email"],
  }),
  "outlook-calendar": plannedProvider({
    id: "outlook-calendar",
    name: "Outlook Calendar",
    description: "Create and manage Microsoft 365 meetings and events.",
    category: "productivity",
    accentColor: "#0078D4",
    triggers: ["Event Created", "Event Updated"],
    actions: ["Create Event", "Update Event", "Cancel Event"],
  }),
  "microsoft-teams": plannedProvider({
    id: "microsoft-teams",
    name: "Microsoft Teams",
    description: "Coordinate messages, meetings, and team notifications.",
    category: "communication",
    accentColor: "#6264A7",
    triggers: ["Channel Message Received", "Meeting Created"],
    actions: ["Send Channel Message", "Create Meeting"],
  }),
  slack: plannedProvider({
    id: "slack",
    name: "Slack",
    description: "Automate channels, messages, alerts, and team workflows.",
    category: "communication",
    accentColor: "#4A154B",
    webhookSupport: "bidirectional",
    triggers: ["Message Received", "Reaction Added"],
    actions: ["Send Message", "Create Channel", "Add Reaction"],
  }),
  discord: plannedProvider({
    id: "discord",
    name: "Discord",
    description: "Power community bots, moderation, roles, and announcements.",
    category: "communication",
    accentColor: "#5865F2",
    webhookSupport: "bidirectional",
    triggers: ["Message Received", "Member Joined"],
    actions: ["Send Message", "Assign Role", "Moderate Member"],
  }),
  telegram: plannedProvider({
    id: "telegram",
    name: "Telegram",
    description: "Build Telegram bots for support, sales, and notifications.",
    category: "communication",
    accentColor: "#229ED9",
    authType: "access_token",
    webhookSupport: "bidirectional",
    triggers: ["Message Received", "Member Joined"],
    actions: ["Send Message", "Send Media", "Manage Chat"],
  }),
  twilio: plannedProvider({
    id: "twilio",
    name: "Twilio",
    description: "Automate SMS, phone calls, verification, and messaging.",
    category: "communication",
    accentColor: "#F22F46",
    authType: "access_token",
    webhookSupport: "bidirectional",
    triggers: ["SMS Received", "Call Completed"],
    actions: ["Send SMS", "Start Phone Call", "Send Verification"],
  }),
  "google-drive": plannedProvider({
    id: "google-drive",
    name: "Google Drive",
    description: "Store, find, share, and automate business files.",
    category: "file-storage",
    accentColor: "#4285F4",
    triggers: ["File Created", "File Updated"],
    actions: ["Upload File", "Create Folder", "Share File"],
  }),
  "google-sheets": plannedProvider({
    id: "google-sheets",
    name: "Google Sheets",
    description: "Turn spreadsheet rows into live business workflows.",
    category: "productivity",
    accentColor: "#0F9D58",
    triggers: ["Row Added", "Row Updated"],
    actions: ["Add Row", "Update Row", "Create Spreadsheet"],
  }),
  onedrive: plannedProvider({
    id: "onedrive",
    name: "OneDrive",
    description: "Connect Microsoft cloud files and shared folders.",
    category: "file-storage",
    accentColor: "#0078D4",
    triggers: ["File Created", "File Updated"],
    actions: ["Upload File", "Create Folder", "Share File"],
  }),
  dropbox: plannedProvider({
    id: "dropbox",
    name: "Dropbox",
    description: "Sync, organize, and share files across workflows.",
    category: "file-storage",
    accentColor: "#0061FF",
    triggers: ["File Added", "File Changed"],
    actions: ["Upload File", "Create Folder", "Share File"],
  }),
  notion: plannedProvider({
    id: "notion",
    name: "Notion",
    description: "Connect pages, databases, knowledge, and team operations.",
    category: "productivity",
    accentColor: "#FFFFFF",
    triggers: ["Page Updated", "Database Item Created"],
    actions: ["Create Page", "Update Page", "Add Database Item"],
  }),
  airtable: plannedProvider({
    id: "airtable",
    name: "Airtable",
    description: "Automate structured records, tables, and lightweight apps.",
    category: "productivity",
    accentColor: "#18BFFF",
    triggers: ["Record Created", "Record Updated"],
    actions: ["Create Record", "Update Record", "Delete Record"],
  }),
  zoom: plannedProvider({
    id: "zoom",
    name: "Zoom",
    description: "Schedule meetings and react to meeting activity.",
    category: "productivity",
    accentColor: "#2D8CFF",
    triggers: ["Meeting Started", "Meeting Ended"],
    actions: ["Create Meeting", "Update Meeting", "Cancel Meeting"],
  }),
  calendly: plannedProvider({
    id: "calendly",
    name: "Calendly",
    description: "Turn bookings and cancellations into automated follow-up.",
    category: "productivity",
    accentColor: "#006BFF",
    triggers: ["Invitee Created", "Invitee Cancelled"],
    actions: ["Create Scheduling Link", "Cancel Event"],
  }),
  trello: plannedProvider({
    id: "trello",
    name: "Trello",
    description: "Automate boards, lists, cards, and team delivery.",
    category: "project-management",
    accentColor: "#0C66E4",
    authType: "access_token",
    triggers: ["Card Created", "Card Moved"],
    actions: ["Create Card", "Move Card", "Add Comment"],
  }),
  asana: plannedProvider({
    id: "asana",
    name: "Asana",
    description: "Connect tasks, projects, assignments, and delivery updates.",
    category: "project-management",
    accentColor: "#F06A6A",
    triggers: ["Task Created", "Task Completed"],
    actions: ["Create Task", "Update Task", "Add Comment"],
  }),
  monday: plannedProvider({
    id: "monday",
    name: "monday.com",
    description: "Automate boards, items, owners, and status changes.",
    category: "project-management",
    accentColor: "#FF3D57",
    triggers: ["Item Created", "Status Changed"],
    actions: ["Create Item", "Update Item", "Assign Owner"],
  }),
  clickup: plannedProvider({
    id: "clickup",
    name: "ClickUp",
    description: "Coordinate tasks, spaces, lists, and project execution.",
    category: "project-management",
    accentColor: "#7B68EE",
    triggers: ["Task Created", "Task Status Changed"],
    actions: ["Create Task", "Update Task", "Add Comment"],
  }),
  hubspot: plannedProvider({
    id: "hubspot",
    name: "HubSpot",
    description: "Connect CRM contacts, companies, deals, and pipelines.",
    category: "crm",
    accentColor: "#FF7A59",
    webhookSupport: "bidirectional",
    triggers: ["Contact Created", "Deal Stage Changed"],
    actions: ["Create Contact", "Update Deal", "Add Note"],
  }),
  salesforce: plannedProvider({
    id: "salesforce",
    name: "Salesforce",
    description: "Automate enterprise leads, accounts, opportunities, and cases.",
    category: "crm",
    accentColor: "#00A1E0",
    triggers: ["Lead Created", "Opportunity Updated"],
    actions: ["Create Lead", "Update Opportunity", "Create Case"],
  }),
  pipedrive: plannedProvider({
    id: "pipedrive",
    name: "Pipedrive",
    description: "Move leads and deals through a focused sales pipeline.",
    category: "crm",
    accentColor: "#017737",
    triggers: ["Person Created", "Deal Updated"],
    actions: ["Create Person", "Create Deal", "Update Deal"],
  }),
  mailchimp: plannedProvider({
    id: "mailchimp",
    name: "Mailchimp",
    description: "Automate audiences, email campaigns, and engagement.",
    category: "marketing",
    accentColor: "#FFE01B",
    triggers: ["Subscriber Added", "Campaign Sent"],
    actions: ["Add Subscriber", "Create Campaign", "Tag Contact"],
  }),
  "meta-business": plannedProvider({
    id: "meta-business",
    name: "Meta Business",
    description: "Connect Facebook Pages, leads, campaigns, and business assets.",
    category: "marketing",
    accentColor: "#0866FF",
    webhookSupport: "bidirectional",
    triggers: ["Lead Received", "Page Event Received"],
    actions: ["Create Campaign", "Publish Page Post", "Reply to Lead"],
  }),
  "instagram-business": plannedProvider({
    id: "instagram-business",
    name: "Instagram Business",
    description: "Publish content and automate business messages and insights.",
    category: "social-media",
    accentColor: "#E1306C",
    webhookSupport: "bidirectional",
    triggers: ["Comment Received", "Message Received"],
    actions: ["Publish Media", "Reply to Comment", "Send Reply"],
  }),
  youtube: plannedProvider({
    id: "youtube",
    name: "YouTube",
    description: "Manage videos, playlists, channel activity, and analytics.",
    category: "social-media",
    accentColor: "#FF0000",
    triggers: ["Video Published", "Comment Received"],
    actions: ["Upload Video", "Update Video", "Add to Playlist"],
  }),
  tiktok: plannedProvider({
    id: "tiktok",
    name: "TikTok",
    description: "Publish approved content and connect creator activity.",
    category: "social-media",
    accentColor: "#25F4EE",
    triggers: ["Post Status Updated", "Video Published"],
    actions: ["Upload Content", "Publish Content"],
  }),
  linkedin: plannedProvider({
    id: "linkedin",
    name: "LinkedIn",
    description: "Connect professional pages, posts, leads, and campaigns.",
    category: "social-media",
    accentColor: "#0A66C2",
    triggers: ["Lead Received", "Organization Post Updated"],
    actions: ["Publish Post", "Create Campaign", "Reply to Lead"],
  }),
  x: plannedProvider({
    id: "x",
    name: "X",
    description: "Publish posts and monitor conversations and engagement.",
    category: "social-media",
    accentColor: "#FFFFFF",
    triggers: ["Mention Received", "Post Engagement Updated"],
    actions: ["Publish Post", "Reply to Post", "Send Direct Message"],
  }),
  woocommerce: plannedProvider({
    id: "woocommerce",
    name: "WooCommerce",
    description: "Connect products, customers, orders, inventory, and refunds.",
    category: "commerce",
    accentColor: "#96588A",
    authType: "access_token",
    webhookSupport: "bidirectional",
    triggers: ["Order Created", "Order Updated"],
    actions: ["Create Order", "Update Product", "Issue Refund"],
  }),
  paypal: plannedProvider({
    id: "paypal",
    name: "PayPal",
    description: "Monitor payments, invoices, disputes, and refunds.",
    category: "payments",
    accentColor: "#003087",
    webhookSupport: "bidirectional",
    triggers: ["Payment Completed", "Dispute Created"],
    actions: ["Create Invoice", "Issue Refund", "Capture Payment"],
  }),
  square: plannedProvider({
    id: "square",
    name: "Square",
    description: "Connect point-of-sale payments, customers, and orders.",
    category: "payments",
    accentColor: "#FFFFFF",
    webhookSupport: "bidirectional",
    triggers: ["Payment Updated", "Order Updated"],
    actions: ["Create Payment", "Create Customer", "Issue Refund"],
  }),
  quickbooks: plannedProvider({
    id: "quickbooks",
    name: "QuickBooks Online",
    description: "Automate customers, invoices, expenses, and accounting records.",
    category: "finance",
    accentColor: "#2CA01C",
    triggers: ["Invoice Updated", "Payment Received"],
    actions: ["Create Invoice", "Create Customer", "Record Expense"],
  }),
  xero: plannedProvider({
    id: "xero",
    name: "Xero",
    description: "Connect invoices, bills, contacts, and financial reporting.",
    category: "finance",
    accentColor: "#13B5EA",
    triggers: ["Invoice Updated", "Payment Updated"],
    actions: ["Create Invoice", "Create Contact", "Create Bill"],
  }),
  "amazon-seller": plannedProvider({
    id: "amazon-seller",
    name: "Amazon Seller",
    description: "Automate seller orders, inventory, listings, and fulfillment.",
    category: "commerce",
    accentColor: "#FF9900",
    triggers: ["Order Created", "Inventory Changed"],
    actions: ["Update Inventory", "Update Listing", "Confirm Shipment"],
  }),
  etsy: plannedProvider({
    id: "etsy",
    name: "Etsy",
    description: "Connect listings, orders, inventory, and buyer activity.",
    category: "commerce",
    accentColor: "#F1641E",
    triggers: ["Receipt Created", "Listing Updated"],
    actions: ["Create Listing", "Update Inventory", "Update Receipt"],
  }),
  ebay: plannedProvider({
    id: "ebay",
    name: "eBay",
    description: "Automate listings, orders, fulfillment, and buyer operations.",
    category: "commerce",
    accentColor: "#E53238",
    triggers: ["Order Created", "Offer Received"],
    actions: ["Create Listing", "Update Inventory", "Fulfill Order"],
  }),
  "tiktok-shop": plannedProvider({
    id: "tiktok-shop",
    name: "TikTok Shop",
    description: "Connect social commerce orders, products, and fulfillment.",
    category: "commerce",
    accentColor: "#FE2C55",
    triggers: ["Order Created", "Order Status Changed"],
    actions: ["Update Product", "Update Inventory", "Fulfill Order"],
  }),
  github: plannedProvider({
    id: "github",
    name: "GitHub",
    description: "Connect repositories, issues, pull requests, and deployments.",
    category: "developer-tools",
    accentColor: "#FFFFFF",
    webhookSupport: "bidirectional",
    triggers: ["Push Received", "Pull Request Opened"],
    actions: ["Create Issue", "Add Comment", "Dispatch Workflow"],
  }),
  zapier: plannedProvider({
    id: "zapier",
    name: "Zapier",
    description: "Bridge J10 NEXUS with existing Zapier automation workflows.",
    category: "automation",
    accentColor: "#FF4F00",
    webhookSupport: "bidirectional",
    triggers: ["Zap Event Received"],
    actions: ["Trigger Zap"],
  }),
  make: plannedProvider({
    id: "make",
    name: "Make",
    description: "Connect J10 workflows with Make scenarios and webhooks.",
    category: "automation",
    accentColor: "#6D00CC",
    webhookSupport: "bidirectional",
    triggers: ["Scenario Event Received"],
    actions: ["Trigger Scenario"],
  }),
  openai: plannedProvider({
    id: "openai",
    name: "OpenAI",
    description: "Use language, vision, audio, image, and agent capabilities.",
    category: "ai-models",
    accentColor: "#10A37F",
    authType: "secret_key",
    webhookSupport: "none",
    triggers: ["Batch Completed"],
    actions: ["Generate Response", "Analyze Media", "Generate Image"],
  }),
  anthropic: plannedProvider({
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Use Claude models for reasoning, documents, and agent work.",
    category: "ai-models",
    accentColor: "#D97757",
    authType: "secret_key",
    webhookSupport: "none",
    triggers: ["Batch Completed"],
    actions: ["Generate Message", "Analyze Document", "Use Tools"],
  }),
  gemini: plannedProvider({
    id: "gemini",
    name: "Google Gemini",
    description: "Use multimodal Gemini models and Google AI capabilities.",
    category: "ai-models",
    accentColor: "#8E75FF",
    authType: "secret_key",
    webhookSupport: "none",
    triggers: ["Batch Completed"],
    actions: ["Generate Content", "Analyze Media", "Create Embedding"],
  }),
  "hugging-face": plannedProvider({
    id: "hugging-face",
    name: "Hugging Face",
    description: "Access open models, inference providers, and embeddings.",
    category: "ai-models",
    accentColor: "#FFD21E",
    authType: "access_token",
    webhookSupport: "none",
    triggers: ["Inference Completed"],
    actions: ["Run Inference", "Generate Embedding", "Classify Content"],
  }),
  runway: plannedProvider({
    id: "runway",
    name: "Runway",
    description: "Generate and transform video, image, and audio assets.",
    category: "creative-ai",
    accentColor: "#6C5CE7",
    authType: "secret_key",
    webhookSupport: "outgoing",
    triggers: ["Generation Completed"],
    actions: ["Generate Video", "Generate Image", "Transform Media"],
  }),
  higgsfield: plannedProvider({
    id: "higgsfield",
    name: "Higgsfield",
    description: "Create cinematic AI video and motion-first content.",
    category: "creative-ai",
    accentColor: "#FF5C35",
    authType: "secret_key",
    webhookSupport: "outgoing",
    triggers: ["Generation Completed"],
    actions: ["Generate Video", "Apply Motion", "Create Ad Creative"],
  }),
  pika: plannedProvider({
    id: "pika",
    name: "Pika",
    description: "Create and transform short-form AI video assets.",
    category: "creative-ai",
    accentColor: "#9B5CFF",
    authType: "secret_key",
    webhookSupport: "outgoing",
    triggers: ["Generation Completed"],
    actions: ["Generate Video", "Modify Video", "Add Effects"],
  }),
  kling: plannedProvider({
    id: "kling",
    name: "Kling AI",
    description: "Generate cinematic video and image content for campaigns.",
    category: "creative-ai",
    accentColor: "#4F7CFF",
    authType: "secret_key",
    webhookSupport: "outgoing",
    triggers: ["Generation Completed"],
    actions: ["Generate Video", "Generate Image", "Animate Image"],
  }),
};

export function isIntegrationProviderId(
  value: string,
): value is IntegrationProviderId {
  return Object.prototype.hasOwnProperty.call(
    INTEGRATION_REGISTRY,
    value,
  );
}

export function getIntegrationProvider(
  providerId: IntegrationProviderId,
): IntegrationProviderDefinition {
  return INTEGRATION_REGISTRY[providerId];
}

export function listIntegrationProviders(
  query: IntegrationRegistryQuery = {},
): IntegrationProviderDefinition[] {
  const providers: readonly IntegrationProviderDefinition[] =
    Object.values(INTEGRATION_REGISTRY);

  return providers.filter((provider) => {
    if (query.category && provider.category !== query.category) {
      return false;
    }

    if (
      query.availability &&
      provider.availability !== query.availability
    ) {
      return false;
    }

    if (
      query.capabilityKind &&
      !provider.capabilities.some(
        (item) => item.kind === query.capabilityKind,
      )
    ) {
      return false;
    }

    return true;
  });
}

export function getIntegrationCapability(
  providerId: IntegrationProviderId,
  capabilityId: string,
): IntegrationCapabilityDefinition | undefined {
  return INTEGRATION_REGISTRY[providerId].capabilities.find(
    (item) => item.id === capabilityId,
  );
}