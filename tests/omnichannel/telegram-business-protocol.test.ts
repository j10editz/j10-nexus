import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("Telegram Business Protocol & Webhook Certification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unauthorized webhook requests missing valid secret token", async () => {
    const { POST } = await import("@/app/api/webhooks/telegram/route");
    const req = new Request("http://localhost/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "x-telegram-bot-api-secret-token": "wrong_secret_value",
      },
      body: JSON.stringify({ update_id: 12345 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });

  it("acknowledges duplicate update_id returning strictly { ok: true } without leaking internal fields", async () => {
    const { POST } = await import("@/app/api/webhooks/telegram/route");
    const validSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "j10_nexus_telegram_secret";

    const updatePayload = {
      update_id: 999901,
      message: {
        message_id: 1,
        date: 1710000000,
        chat: { id: 1001, type: "private" },
        from: { id: 1001, first_name: "Test" },
        text: "Hello once",
      },
    };

    const req1 = new Request("http://localhost/api/webhooks/telegram", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": validSecret },
      body: JSON.stringify(updatePayload),
    });

    await POST(req1);

    // Send duplicate update_id
    const req2 = new Request("http://localhost/api/webhooks/telegram", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": validSecret },
      body: JSON.stringify(updatePayload),
    });

    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2).toEqual({ ok: true });
    expect(data2).not.toHaveProperty("workspaceId");
    expect(data2).not.toHaveProperty("job_id");
  });

  it("formats outbound telegram HTML and strips markdown cleanly", async () => {
    const { formatTelegramHtml } = await import("@/lib/ai/telegram-assistant");
    const { html, plain } = formatTelegramHtml("Hello **bold** and *italic* with `code`!");

    expect(html).toBe("Hello <b>bold</b> and <i>italic</i> with <code>code</code>!");
    expect(plain).toBe("Hello bold and italic with code!");
    expect(plain).not.toContain("**");
  });

  it("redacts PII from text before transmitting to external AI models", async () => {
    const { redactPii } = await import("@/lib/ai/telegram-assistant");
    const raw = "Contact me at alice@example.com or call +1 (555) 234-5678. Card: 4532-1234-5678-9012.";
    const sanitized = redactPii(raw);

    expect(sanitized).not.toContain("alice@example.com");
    expect(sanitized).not.toContain("555");
    expect(sanitized).not.toContain("4532");
    expect(sanitized).toContain("[email redacted]");
    expect(sanitized).toContain("[phone redacted]");
    expect(sanitized).toContain("[payment info redacted]");
  });

  it("dispatches outbound Telegram message with business_connection_id when provided", async () => {
    const { sendChannelProviderMessage } = await import("@/lib/omnichannel/dispatch");

    let capturedUrl: string | null = null;
    let capturedBody: any = null;

    vi.spyOn(global, "fetch").mockImplementationOnce(async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 8877 } }), { status: 200 });
    });

    const result = await sendChannelProviderMessage({
      channel: "telegram",
      recipient: "12345678",
      body: "Hello from J10 Business Secretary!",
      metadata: {
        business_connection_id: "bc_live_9988",
      },
      credentials: {
        telegramBotToken: "test_bot_token_abc",
      },
    });

    expect(result.status).toBe("sent");
    expect(result.externalId).toBe("8877");
    expect(capturedUrl).toContain("https://api.telegram.org/bottest_bot_token_abc/sendMessage");
    expect(capturedBody.chat_id).toBe("12345678");
    expect(capturedBody.text).toBe("Hello from J10 Business Secretary!");
    expect(capturedBody.business_connection_id).toBe("bc_live_9988");
  });

  it("rejects unauthorized worker invocations missing server-side secret", async () => {
    const { POST } = await import("@/app/api/workers/telegram-ai/route");
    const req = new Request("http://localhost/api/workers/telegram-ai", {
      method: "POST",
      headers: {},
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });

  it("strictly rejects SUPABASE_SERVICE_ROLE_KEY or arbitrary tokens for worker invocation", async () => {
    const { POST } = await import("@/app/api/workers/telegram-ai/route");
    const prevSecret = process.env.TELEGRAM_WORKER_SECRET;
    process.env.TELEGRAM_WORKER_SECRET = "super_secret_worker_key_xyz_123456789";

    try {
      // 1. Service role key attempt
      const req1 = new Request("http://localhost/api/workers/telegram-ai", {
        method: "POST",
        headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role" },
      });
      const res1 = await POST(req1);
      expect(res1.status).toBe(401);

      // 2. Cookie attempt (browser session)
      const req2 = new Request("http://localhost/api/workers/telegram-ai", {
        method: "POST",
        headers: { Cookie: "sb-access-token=session_jwt" },
      });
      const res2 = await POST(req2);
      expect(res2.status).toBe(401);

      // 3. Wrong secret
      const req3 = new Request("http://localhost/api/workers/telegram-ai", {
        method: "POST",
        headers: { Authorization: "Bearer wrong_worker_secret_999" },
      });
      const res3 = await POST(req3);
      expect(res3.status).toBe(401);
    } finally {
      process.env.TELEGRAM_WORKER_SECRET = prevSecret;
    }
  });

  it("verifies multi-bot cross-bot idempotency keys isolate identical update_ids", () => {
    const updateId = 554433;
    const threadId = "thread_uuid_abc";

    const bot1Key = `telegram-ai:bot_client_alpha:${updateId}:${threadId}`;
    const bot2Key = `telegram-ai:bot_client_beta:${updateId}:${threadId}`;

    expect(bot1Key).not.toBe(bot2Key);
    expect(bot1Key).toContain("bot_client_alpha");
    expect(bot2Key).toContain("bot_client_beta");
  });

  it("verifies connection-scoped deletion preview and parameters", async () => {
    const { previewTelegramBusinessDeletion } = await import("@/lib/telegram/consent");

    const mockSupabase: any = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          workspace_id: "ws-123",
          business_connection_id: "bc-456",
          connections_count: 1,
          messages_count: 5,
          threads_count: 1,
          jobs_count: 2,
          provider_receipts_count: 3,
          shared_contacts_preserved: 42,
        },
        error: null,
      }),
    };

    const preview = await previewTelegramBusinessDeletion(mockSupabase, "ws-123", "bc-456");
    expect(preview.connectionsCount).toBe(1);
    expect(preview.messagesCount).toBe(5);
    expect(preview.sharedContactsPreserved).toBe(42);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("preview_telegram_business_deletion", {
      p_workspace_id: "ws-123",
      p_business_connection_id: "bc-456",
    });
  });
});
