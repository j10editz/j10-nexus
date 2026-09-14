import { describe, expect, it } from "vitest";
import { getBindingSigningKey, hashBindingToken } from "@/lib/telegram/binding-token";
import { formatTelegramHtml } from "@/lib/ai/telegram-assistant";

describe("Telegram Hardening v2 Unit Tests", () => {
  it("Correction 2: HKDF-derived domain separation guarantees signing key != raw encryption key", () => {
    process.env.J10_INTEGRATION_ENCRYPTION_KEY = "my-super-secret-master-encryption-key-32";
    delete process.env.J10_TELEGRAM_BINDING_SIGNING_KEY;

    const signingKey = getBindingSigningKey();
    expect(signingKey).toBeInstanceOf(Buffer);
    expect(signingKey.length).toBe(32);

    // Assert that the derived key is NOT equal to the raw encryption key
    expect(signingKey.toString("hex")).not.toBe(
      Buffer.from(process.env.J10_INTEGRATION_ENCRYPTION_KEY).toString("hex")
    );

    // If explicit J10_TELEGRAM_BINDING_SIGNING_KEY is provided, it must be used
    process.env.J10_TELEGRAM_BINDING_SIGNING_KEY = "dedicated-signing-key-for-telegram-binding";
    const explicitKey = getBindingSigningKey();
    expect(explicitKey).toBeInstanceOf(Buffer);
    expect(explicitKey.toString("hex")).not.toBe(signingKey.toString("hex"));
  });

  it("Correction 1: Hash generation is deterministic SHA-256 hex string", () => {
    const token = "b_test_token_12345";
    const hash = hashBindingToken(token);
    expect(hash).toHaveLength(64); // 32 bytes hex = 64 characters
    expect(hash).toBe(hashBindingToken(token));
  });

  it("Telegram formatting sanitization converts markdown to HTML without raw ** tags", () => {
    const markdown = "Hello **Alex**! Your order *#123* is **ready**.";
    const { html, plain } = formatTelegramHtml(markdown);

    expect(html).toContain("<b>Alex</b>");
    expect(html).toContain("<b>ready</b>");
    expect(html).not.toContain("**");
    expect(plain).toBe("Hello Alex! Your order #123 is ready.");
  });
});
