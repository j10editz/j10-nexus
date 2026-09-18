import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Telegram truthful customer disclosures", () => {
  it("does not present unverified consent, paid-tier, or model-training claims", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/ai/telegram-assistant.ts"),
      "utf8"
    );

    expect(source).not.toContain("By replying, you consent");
    expect(source).not.toContain("Production client conversations utilize paid API tiers");
    expect(source).not.toContain("content is not used for model training");
    expect(source).toContain("Consent and privacy language is not configured");
    expect(source).toContain("A privacy policy is not currently configured");
  });
});
