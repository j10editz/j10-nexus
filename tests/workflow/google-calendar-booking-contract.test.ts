import { describe, expect, it } from "vitest";

import { getIntegrationProvider } from "@/lib/integrations/registry";
import { getIntegrationOAuthProviderDefinition } from "@/lib/integrations/oauth/provider-registry";

describe("Google Calendar booking integration contract", () => {
  it("publishes availability and appointment lifecycle actions", () => {
    const provider = getIntegrationProvider("google-calendar");
    const capabilityIds = provider.capabilities.map((capability) => capability.id);

    expect(provider.availability).toBe("available");
    expect(capabilityIds).toEqual(expect.arrayContaining([
      "google-calendar.availability.read",
      "google-calendar.event.create",
      "google-calendar.event.update",
      "google-calendar.event.cancel",
    ]));
  });

  it("uses the least Google scopes needed for availability and appointment changes", () => {
    const provider = getIntegrationProvider("google-calendar");
    const oauth = getIntegrationOAuthProviderDefinition("google-calendar");

    expect(provider.auth.requiredScopes).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.events.freebusy",
    ]);
    expect(oauth?.scopes).toEqual(provider.auth.requiredScopes);
    expect(oauth?.authorizationParameters).toEqual(expect.objectContaining({
      access_type: "offline",
      prompt: "consent",
    }));
  });

  it("does not advertise broader calendar or mail scopes", () => {
    const oauth = getIntegrationOAuthProviderDefinition("google-calendar");
    const scopes = oauth?.scopes ?? [];

    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar");
    expect(scopes.some((scope) => scope.includes("gmail"))).toBe(false);
  });
});
