import { describe, expect, it } from "vitest";

import {
  ONBOARDING_PRESETS,
  type OnboardingPreset,
} from "../../components/whatsapp/WhatsAppGroupOnboardingWizard";

describe("WhatsApp Group Onboarding Wizard", () => {
  it("provides complete presets for VIP, Crypto, Support, and E-commerce communities", () => {
    const keys = Object.keys(ONBOARDING_PRESETS) as OnboardingPreset[];
    expect(keys).toContain("vip_community");
    expect(keys).toContain("crypto_signals");
    expect(keys).toContain("customer_support");
    expect(keys).toContain("ecommerce_hub");
  });

  it("ensures each preset defines tailored welcome announcements and default rules", () => {
    for (const [key, preset] of Object.entries(ONBOARDING_PRESETS)) {
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.welcomeMessage).toContain("J10");
      expect(preset.defaultRules.length).toBeGreaterThan(20);
    }
  });

  it("VIP preset enforces high standards and zero-spam guidelines", () => {
    const vip = ONBOARDING_PRESETS.vip_community;
    expect(vip.welcomeMessage).toContain("!rules");
    expect(vip.defaultRules).toContain("Three strikes");
  });

  it("Crypto signals preset activates Anti-Scam Shield and phishing warnings", () => {
    const crypto = ONBOARDING_PRESETS.crypto_signals;
    expect(crypto.welcomeMessage).toContain("Anti-Scam Shield");
    expect(crypto.defaultRules).toContain("seed phrases");
  });
});
