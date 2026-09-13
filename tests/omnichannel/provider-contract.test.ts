import { describe, expect, it, vi } from "vitest";

import { adaptVerifiedTelegramUpdate, inboundReceiptKey } from "@/lib/omnichannel/provider-contract";
import { sendChannelProviderMessage } from "@/lib/omnichannel/dispatch";

describe("provider-neutral inbound contract", () => {
  const input = {
    workspaceId: "workspace-a",
    externalAccountId: "bot-123",
    rawPayloadReference: "webhook_events:receipt-1",
    update: { update_id: 10, message: { message_id: 7, date: 1_700_000_000, text: "Hello J10", chat: { id: 88 }, from: { id: 99, first_name: "Avery" } } },
  };

  it("normalizes a verified Telegram message without using browser tenancy", () => {
    const envelope = adaptVerifiedTelegramUpdate(input);
    expect(envelope).toMatchObject({ provider: "telegram", channel: "telegram", workspaceId: "workspace-a", externalAccountId: "bot-123", externalConversationId: "88", externalContactId: "99", externalMessageId: "7", text: "Hello J10" });
  });

  it("scopes replay identity by workspace and provider account", () => {
    const envelope = adaptVerifiedTelegramUpdate(input);
    expect(inboundReceiptKey(envelope)).not.toBe(inboundReceiptKey({ ...envelope, workspaceId: "workspace-b" }));
    expect(inboundReceiptKey(envelope)).not.toBe(inboundReceiptKey({ ...envelope, externalAccountId: "bot-456" }));
  });

  it("rejects provider payloads without a genuine text message", () => {
    expect(() => adaptVerifiedTelegramUpdate({ ...input, update: { message: { message_id: 7, chat: { id: 88 }, from: { id: 99 } } } })).toThrow("Telegram message text is required.");
  });
});

describe("Telegram outbound dispatch contract", () => {
  it("returns unavailable when Telegram bot token is unconfigured", async () => {
    const res = await sendChannelProviderMessage({
      channel: "telegram",
      recipient: "123456",
      body: "Hello from J10",
    });
    expect(res.provider).toBe("telegram");
    expect(res.status).toBe("unavailable");
  });

  it("dispatches outbound message via Telegram Bot API sendMessage when configured", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: any, init?: any) => {
      expect(String(url)).toBe("https://api.telegram.org/bottest_token_123/sendMessage");
      const body = JSON.parse(init?.body as string);
      expect(body).toEqual({
        chat_id: "chat_987",
        text: "Outbound reply from desk",
      });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            message_id: 5544,
            date: 1700001000,
            chat: { id: 987 },
          },
        }),
      } as any;
    });

    try {
      globalThis.fetch = fetchMock;
      const res = await sendChannelProviderMessage({
        channel: "telegram",
        recipient: "chat_987",
        body: "Outbound reply from desk",
        credentials: {
          telegramBotToken: "test_token_123",
        },
      });

      expect(res.provider).toBe("telegram");
      expect(res.status).toBe("sent");
      expect(res.externalId).toBe("5544");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns failed with error description when Telegram API returns an error", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return {
        ok: false,
        statusText: "Bad Request",
        json: async () => ({
          ok: false,
          description: "Bad Request: chat not found",
        }),
      } as any;
    });

    try {
      globalThis.fetch = fetchMock;
      const res = await sendChannelProviderMessage({
        channel: "telegram",
        recipient: "invalid_chat",
        body: "Test failure",
        credentials: {
          telegramBotToken: "test_token_123",
        },
      });

      expect(res.provider).toBe("telegram");
      expect(res.status).toBe("failed");
      expect(res.error).toBe("Bad Request: chat not found");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

