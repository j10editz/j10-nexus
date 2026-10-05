import { describe, it, expect } from "vitest";
import { INTEGRATION_REGISTRY, listIntegrationProviders, getIntegrationProvider } from "@/lib/integrations/registry";
import { INTEGRATION_PROVIDER_IDS, type IntegrationProviderId } from "@/types/integration";

describe("Canonical 42-Connector Integration Ecosystem", () => {
  const EXPECTED_42_PROVIDERS: { id: IntegrationProviderId; name: string }[] = [
    // Messaging (4)
    { id: "whatsapp-business", name: "WhatsApp Business" },
    { id: "telegram", name: "Telegram" },
    { id: "instagram-business", name: "Instagram Business" },
    { id: "messenger", name: "Messenger" },

    // Voice & SMS (2)
    { id: "twilio", name: "Twilio" },
    { id: "telnyx", name: "Telnyx" },

    // Email (2)
    { id: "gmail", name: "Gmail" },
    { id: "outlook-mail", name: "Outlook Mail" },

    // Scheduling (4)
    { id: "google-calendar", name: "Google Calendar" },
    { id: "outlook-calendar", name: "Outlook Calendar" },
    { id: "calendly", name: "Calendly" },
    { id: "acuity-scheduling", name: "Acuity Scheduling" },

    // Payments (3)
    { id: "stripe", name: "Stripe" },
    { id: "square", name: "Square" },
    { id: "paypal", name: "PayPal" },

    // CRM (4)
    { id: "hubspot", name: "HubSpot" },
    { id: "salesforce", name: "Salesforce" },
    { id: "pipedrive", name: "Pipedrive" },
    { id: "clickup", name: "ClickUp" },

    // Commerce (2)
    { id: "shopify", name: "Shopify" },
    { id: "woocommerce", name: "WooCommerce" },

    // Accounting (2)
    { id: "quickbooks", name: "QuickBooks Online" },
    { id: "xero", name: "Xero" },

    // Marketing & Leads (5)
    { id: "meta-lead-ads", name: "Meta Lead Ads" },
    { id: "google-ads", name: "Google Ads" },
    { id: "wordpress", name: "WordPress" },
    { id: "typeform", name: "Typeform" },
    { id: "jotform", name: "Jotform" },

    // Reviews (1)
    { id: "google-business", name: "Google Business Profile" },

    // Files & Data (4)
    { id: "google-drive", name: "Google Drive" },
    { id: "google-sheets", name: "Google Sheets" },
    { id: "onedrive", name: "OneDrive" },
    { id: "dropbox", name: "Dropbox" },

    // Team (2)
    { id: "slack", name: "Slack" },
    { id: "microsoft-teams", name: "Microsoft Teams" },

    // Automation (4)
    { id: "zapier", name: "Zapier" },
    { id: "make", name: "Make" },
    { id: "n8n", name: "n8n" },
    { id: "generic-webhook", name: "Generic Webhook" },

    // Field Services (3)
    { id: "jobber", name: "Jobber" },
    { id: "housecall-pro", name: "Housecall Pro" },
    { id: "mindbody", name: "Mindbody" },
  ];

  it("registers all 42 ecosystem providers in the canonical registry", () => {
    for (const expected of EXPECTED_42_PROVIDERS) {
      const provider = getIntegrationProvider(expected.id);
      expect(provider, `Provider ${expected.id} must be registered`).toBeDefined();
      expect(provider.id).toBe(expected.id);
      expect(provider.name).toBe(expected.name);
      expect(provider.capabilities.length).toBeGreaterThan(0);
      expect(provider.auth).toBeDefined();
    }
  });

  it("ensures all providers in INTEGRATION_PROVIDER_IDS have valid registry entries", () => {
    for (const providerId of INTEGRATION_PROVIDER_IDS) {
      const provider = INTEGRATION_REGISTRY[providerId];
      expect(provider, `Missing registry entry for ${providerId}`).toBeDefined();
      expect(provider.id).toBe(providerId);
    }
  });

  it("lists providers with capability filtering correctly", () => {
    const allProviders = listIntegrationProviders();
    expect(allProviders.length).toBeGreaterThanOrEqual(42);

    const triggerProviders = listIntegrationProviders({ capabilityKind: "trigger" });
    expect(triggerProviders.length).toBeGreaterThan(0);
  });
});
