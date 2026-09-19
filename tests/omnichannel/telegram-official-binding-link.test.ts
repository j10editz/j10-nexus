import { describe, expect, it } from "vitest";
import { getOfficialTelegramBindingLink } from "@/lib/telegram/official-binding-link";

const validToken = `b_${"a".repeat(43)}`;

describe("official Telegram binding link", () => {
  it("accepts only the signed deep link for the official bot", () => {
    const link = `https://t.me/j10_nexus_leads_bot?start=${validToken}`;

    expect(getOfficialTelegramBindingLink({
      bot: { username: "j10_nexus_leads_bot", shareLink: link },
    })).toBe(link);
  });

  it.each([
    {},
    { bot: { username: "other_bot", shareLink: `https://t.me/other_bot?start=${validToken}` } },
    { bot: { username: "j10_nexus_leads_bot", shareLink: "https://example.test/?start=b_bad" } },
    { bot: { username: "j10_nexus_leads_bot", shareLink: "https://t.me/j10_nexus_leads_bot?start=not-signed" } },
    { bot: { username: "j10_nexus_leads_bot", shareLink: `https://t.me/j10_nexus_leads_bot?start=${validToken}&next=bad` } },
  ])("fails closed for malformed or untrusted responses", (payload) => {
    expect(getOfficialTelegramBindingLink(payload)).toBeNull();
  });
});
