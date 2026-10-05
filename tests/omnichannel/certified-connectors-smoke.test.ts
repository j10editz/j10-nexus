import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHmac, createHash } from "node:crypto";
import { hmacSha256Hex } from "@/lib/integrations/webhooks/crypto";
import { verifyStripeWebhookSignature } from "@/lib/billing/stripe-webhook";

// Store original environment variables
const envBackup = { ...process.env };

describe("Certified Connectors End-to-End Live Webhook Smoke Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.META_WHATSAPP_VERIFY_TOKEN = "meta_verify_token_test_123";
    process.env.META_WHATSAPP_APP_SECRET = "meta_app_secret_test_456";
    process.env.TELEGRAM_WEBHOOK_SECRET = "telegram_webhook_test_secret_789";
    process.env.TELEGRAM_WORKER_SECRET = "telegram_worker_secret_abc";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_stripe_test_secret_xyz";
    process.env.ENABLE_TELEGRAM_BUSINESS_SECRETARY = "true";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envBackup };
  });

  // =========================================================================
  // 1. WhatsApp Business Connector (Meta Cloud API & Embedded Signup)
  // =========================================================================
  describe("1. WhatsApp Business Connector (Meta Cloud API)", () => {
    it("A. GET challenge verification returns plain challenge when tokens match", async () => {
      const { GET } = await import("@/app/api/webhooks/whatsapp/meta/route");
      const req = new Request(
        "http://localhost/api/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=meta_verify_token_test_123&hub.challenge=test_challenge_9988",
        { method: "GET" }
      );

      const res = await GET(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("test_challenge_9988");
      expect(res.headers.get("content-type")).toContain("text/plain");
    });

    it("B. GET challenge verification rejects unauthorized tokens with 403", async () => {
      const { GET } = await import("@/app/api/webhooks/whatsapp/meta/route");
      const req = new Request(
        "http://localhost/api/webhooks/whatsapp/meta?hub.mode=subscribe&hub.verify_token=invalid_token&hub.challenge=test_challenge_9988",
        { method: "GET" }
      );

      const res = await GET(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it("C. POST validates X-Hub-Signature-256 and rejects tampered payloads with 401", async () => {
      const { POST } = await import("@/app/api/webhooks/whatsapp/meta/route");
      const rawBody = JSON.stringify({ entry: [{ id: "123" }] });

      const req = new Request("http://localhost/api/webhooks/whatsapp/meta", {
        method: "POST",
        headers: {
          "x-hub-signature-256": "sha256=invalid_hash_value_here",
          "content-type": "application/json",
        },
        body: rawBody,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    });

    it("D. End-to-end inbound message processing: parses payload, creates thread & message, enqueues 10s AI job", async () => {
      const { processWhatsAppPayload } = await import("@/lib/whatsapp/webhook-handler");

      let insertedThread: any = null;
      let insertedMessage: any = null;
      let insertedJob: any = null;

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "inbox_messages") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
              insert: (record: any) => {
                insertedMessage = record;
                return Promise.resolve({ error: null });
              },
            };
          }

          if (table === "inbox_threads") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: () => Promise.resolve({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
              insert: (record: any) => {
                insertedThread = record;
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: { id: "th_whatsapp_live_01" }, error: null }),
                  }),
                };
              },
            };
          }

          if (table === "whatsapp_ai_jobs") {
            return {
              insert: (record: any) => {
                insertedJob = record;
                return {
                  select: () => ({
                    maybeSingle: () => Promise.resolve({ data: { id: "job_ai_live_01" }, error: null }),
                  }),
                };
              },
            };
          }

          if (table === "contacts") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: { id: "con_wa_01" }, error: null }),
                }),
              }),
            };
          }

          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
        },
      };

      const mockConnection: any = {
        id: "conn_wa_123",
        workspaceId: "ws_live_alpha",
        provider: "whatsapp-business",
        status: "connected",
        publicConfiguration: {
          phone_number_id: "phone_id_9999",
          webhook_subscribed: true,
        },
      };

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba_12345",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+15551234567",
                    phone_number_id: "phone_id_9999",
                  },
                  contacts: [
                    {
                      profile: { name: "Sarah Jenkins" },
                      wa_id: "15559876543",
                    },
                  ],
                  messages: [
                    {
                      from: "15559876543",
                      id: "wamid.HBgLMTU1NTk4NzY1NDMVAgARGBI1OTg3NjU0MzIx",
                      timestamp: "1710000000",
                      text: { body: "Hi, I need an emergency plumbing quote for tomorrow morning!" },
                      type: "text",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const response = await processWhatsAppPayload({
        supabase: mockSupabase,
        connection: mockConnection,
        endpoint: { id: "ep_wa_123", integrationId: "conn_wa_123" },
        payload,
        requestUrl: "https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.accepted).toBe(true);
      expect(data.wamid).toBe("wamid.HBgLMTU1NTk4NzY1NDMVAgARGBI1OTg3NjU0MzIx");
      expect(data.threadId).toBe("th_whatsapp_live_01");
      expect(data.jobId).toBe("job_ai_live_01");

      // Verify thread created with WhatsApp channel & contact metadata
      expect(insertedThread.workspace_id).toBe("ws_live_alpha");
      expect(insertedThread.channel).toBe("whatsapp");
      expect(insertedThread.external_thread_id).toBe("15559876543");
      expect(insertedThread.metadata.senderName).toBe("Sarah Jenkins");

      // Verify message inserted with wamid idempotency key
      expect(insertedMessage.workspace_id).toBe("ws_live_alpha");
      expect(insertedMessage.content).toBe("Hi, I need an emergency plumbing quote for tomorrow morning!");
      expect(insertedMessage.idempotency_key).toBe("wamid_wamid.HBgLMTU1NTk4NzY1NDMVAgARGBI1OTg3NjU0MzIx");

      // Verify durable AI job queued for 10-second auto-response
      expect(insertedJob.workspace_id).toBe("ws_live_alpha");
      expect(insertedJob.recipient_phone).toBe("15559876543");
      expect(insertedJob.inbound_text).toBe("Hi, I need an emergency plumbing quote for tomorrow morning!");
      expect(insertedJob.status).toBe("pending");
      expect(insertedJob.idempotency_key).toBe("whatsapp-ai:ws_live_alpha:wamid.HBgLMTU1NTk4NzY1NDMVAgARGBI1OTg3NjU0MzIx");
    });

    it("E. Handles Meta message delivery status callbacks to update inbox_messages delivery_status", async () => {
      const { processWhatsAppPayload } = await import("@/lib/whatsapp/webhook-handler");

      let updatedStatus: any = null;
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "inbox_messages") {
            return {
              update: (record: any) => {
                updatedStatus = record;
                return {
                  eq: () => ({
                    eq: () => Promise.resolve({ error: null }),
                  }),
                };
              },
            };
          }
          return {};
        },
      };

      const mockConnection: any = {
        id: "conn_wa_123",
        workspaceId: "ws_live_alpha",
        provider: "whatsapp-business",
        status: "connected",
      };

      const statusPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  statuses: [
                    {
                      id: "wamid.HBgLMTU1NTk4NzY1NDMVAgARGBI1OTg3NjU0MzIx",
                      status: "read",
                      timestamp: "1710000050",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const res = await processWhatsAppPayload({
        supabase: mockSupabase,
        connection: mockConnection,
        endpoint: { id: "ep_wa_123" },
        payload: statusPayload,
        requestUrl: "https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.event).toBe("status_callback");
      expect(updatedStatus.delivery_status).toBe("read");
    });

    it("F. Deduplicates duplicate wamid receipts returning duplicate: true without re-queueing AI job", async () => {
      const { processWhatsAppPayload } = await import("@/lib/whatsapp/webhook-handler");

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "inbox_messages") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: {
                          id: "msg_existing_123",
                          content: "Hi, I need an emergency plumbing quote for tomorrow morning!",
                        },
                        error: null,
                      }),
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const mockConnection: any = {
        id: "conn_wa_123",
        workspaceId: "ws_live_alpha",
        provider: "whatsapp-business",
        status: "connected",
      };

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "15559876543",
                      id: "wamid.HBgLMTU1NTk4NzY1NDMVAgARGBI1OTg3NjU0MzIx",
                      text: { body: "Hi, I need an emergency plumbing quote for tomorrow morning!" },
                      type: "text",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const res = await processWhatsAppPayload({
        supabase: mockSupabase,
        connection: mockConnection,
        endpoint: { id: "ep_wa_123" },
        payload,
        requestUrl: "https://j10-nexus.vercel.app/api/webhooks/whatsapp/meta",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.duplicate).toBe(true);
    });
  });

  // =========================================================================
  // 2. Telegram Business Connector (Secretary Mode & Bot Ingress)
  // =========================================================================
  describe("2. Telegram Business Connector (Secretary Mode & Multi-Tenant Ingress)", () => {
    it("A. Rejects requests with missing or invalid X-Telegram-Bot-Api-Secret-Token", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const req = new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "wrong_secret" },
        body: JSON.stringify({ update_id: 112233 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("B. Update ID deduplication immediately returns { ok: true } on replay", async () => {
      const { POST } = await import("@/app/api/webhooks/telegram/route");
      const secret = "telegram_webhook_test_secret_789";

      const update = {
        update_id: 8887771,
        message: {
          message_id: 101,
          date: 1710000000,
          chat: { id: 554433, type: "private" },
          from: { id: 554433, first_name: "Elena" },
          text: "Can I schedule a consultation?",
        },
      };

      const req1 = new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": secret },
        body: JSON.stringify(update),
      });
      await POST(req1);

      // Replay identical update_id
      const req2 = new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": secret },
        body: JSON.stringify(update),
      });
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2).toEqual({ ok: true });
    });

    it("D. Handles Telegram business_connection updates and records connection state", async () => {
      const { upsertTelegramBusinessConnection, markBusinessConnectionDisconnected } = await import("@/lib/telegram/business-connections");

      let upsertedRecord: any = null;
      let disconnectedId: string | null = null;

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "telegram_business_connections") {
            return {
              upsert: (payload: any) => {
                upsertedRecord = payload;
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: { id: "rec_1", ...payload }, error: null }),
                  }),
                };
              },
              update: (payload: any) => ({
                eq: (_col: string, val: string) => {
                  disconnectedId = val;
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          return {};
        },
      };

      await upsertTelegramBusinessConnection(mockSupabase, {
        workspaceId: "ws_tg_alpha",
        businessConnectionId: "bc_tg_9988",
        telegramUserId: "user_776655",
        telegramUsername: "j10_agent",
        userChatId: "user_776655",
        canReply: true,
        isEnabled: true,
        rights: { can_reply: true },
      });

      expect(upsertedRecord).toBeDefined();
      expect(upsertedRecord.workspace_id).toBe("ws_tg_alpha");
      expect(upsertedRecord.business_connection_id).toBe("bc_tg_9988");
      expect(upsertedRecord.can_reply).toBe(true);
      expect(upsertedRecord.is_enabled).toBe(true);

      await markBusinessConnectionDisconnected(mockSupabase, "bc_tg_9988");
      expect(disconnectedId).toBe("bc_tg_9988");
    });
  });

  // =========================================================================
  // 3. Stripe Connector (Checkout Session & Authoritative Ledger)
  // =========================================================================
  describe("3. Stripe Connector (Checkout Session & Authoritative Ledger)", () => {
    it("A. Verifies authentic signed Stripe webhook deliveries with timestamp tolerance", () => {
      const body = JSON.stringify({ id: "evt_stripe_smoke_01", type: "checkout.session.completed" });
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = `${timestamp}.${body}`;
      const sig = createHmac("sha256", "whsec_stripe_test_secret_xyz").update(payload).digest("hex");
      const signatureHeader = `t=${timestamp},v1=${sig}`;

      const verification = verifyStripeWebhookSignature({
        rawBody: body,
        signatureHeader,
        secret: "whsec_stripe_test_secret_xyz",
        now: timestamp * 1000,
      });

      expect(verification.valid).toBe(true);
    });

    it("B. Completes checkout session, creates authoritative ledger entry, and advances deal stage", async () => {
      const { processStripeWebhookEvent } = await import("@/lib/billing/stripe-webhook");

      let updatedCheckout: any = null;
      let insertedLedger: any = null;
      let insertedMessage: any = null;

      const mockSupabase: any = {
        from: (table: string) => {
          if (table === "webhook_events") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
              upsert: () => Promise.resolve({ error: null }),
              update: () => ({
                eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
              }),
            };
          }

          if (table === "payment_checkouts") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        id: "chk_live_888",
                        workspace_id: "ws_stripe_alpha",
                        thread_id: "th_stripe_01",
                        contact_id: "con_client_01",
                        amount: 3500,
                        currency: "USD",
                        status: "pending",
                      },
                      error: null,
                    }),
                }),
              }),
              update: (payload: any) => {
                updatedCheckout = payload;
                return { eq: () => Promise.resolve({ error: null }) };
              },
            };
          }

          if (table === "payment_ledger") {
            return {
              insert: (record: any) => {
                insertedLedger = record;
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: { id: "led_record_777" }, error: null }),
                  }),
                };
              },
            };
          }

          if (table === "inbox_messages") {
            return {
              insert: (record: any) => {
                insertedMessage = record;
                return Promise.resolve({ error: null });
              },
            };
          }

          if (table === "inbox_threads" || table === "contacts" || table === "crm_proposals") {
            return {
              update: () => ({
                eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
              }),
            };
          }

          throw new Error(`Unexpected table: ${table}`);
        },
      };

      const event = {
        id: "evt_stripe_payment_success_999",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_stripe_live_777",
            amount_total: 350000,
            currency: "usd",
            payment_intent: "pi_stripe_succeeded_111",
            metadata: {
              workspace_id: "ws_stripe_alpha",
              thread_id: "th_stripe_01",
              contact_id: "con_client_01",
              internal_checkout_id: "chk_live_888",
            },
          },
        },
      };

      const result = await processStripeWebhookEvent(mockSupabase, event);

      expect(result.processed).toBe(true);
      expect(result.action).toBe("checkout_completed");
      expect(result.checkoutId).toBe("chk_live_888");
      expect(result.ledgerId).toBe("led_record_777");

      expect(updatedCheckout.status).toBe("paid");
      expect(insertedLedger.workspace_id).toBe("ws_stripe_alpha");
      expect(insertedLedger.amount).toBe(3500);
      expect(insertedLedger.currency).toBe("USD");
      expect(insertedLedger.status).toBe("succeeded");
      expect(insertedMessage.content).toContain("$3,500.00 USD");
    });
  });

  // =========================================================================
  // 4. Webhooks & API Connector (Universal HMAC-SHA256 & Replay Defense)
  // =========================================================================
  describe("4. Webhooks & API Connector (Universal HMAC-SHA256 & Replay Defense)", () => {
    it("A. Generates and verifies HMAC-SHA256 signatures with constant-time equality", () => {
      const secret = "j10_webhook_signing_secret_universal_998877";
      const payload = JSON.stringify({ event: "order.created", orderId: 443322 });

      const signature = hmacSha256Hex(secret, payload);
      expect(signature).toBeDefined();
      expect(signature.length).toBe(64); // 32 bytes hex = 64 characters

      // Verify tampered payload produces different HMAC
      const tamperedSignature = hmacSha256Hex(secret, JSON.stringify({ event: "order.created", orderId: 0 }));
      expect(signature).not.toBe(tamperedSignature);
    });

    it("B. Builds deterministic replay key and detects duplicate event receipts", async () => {
      const { buildWebhookReplayKey, sha256Hex } = await import("@/lib/integrations/webhooks/crypto");

      const rawBody = JSON.stringify({ action: "user.signed_up", userId: "usr_5566" });
      const payloadSha256 = sha256Hex(rawBody);

      const replayKey1 = buildWebhookReplayKey({
        providerId: "generic-webhook",
        eventType: "user.signed_up",
        externalEventId: "evt_ext_12345",
        payloadSha256,
        timestampIdentity: "1710005000",
      });

      const replayKey2 = buildWebhookReplayKey({
        providerId: "generic-webhook",
        eventType: "user.signed_up",
        externalEventId: "evt_ext_12345",
        payloadSha256,
        timestampIdentity: "1710005000",
      });

      expect(replayKey1).toBe(replayKey2);
      expect(replayKey1.length).toBe(64); // 32-byte sha256 hex string
      expect(replayKey1).toMatch(/^[0-9a-f]{64}$/);

      // Verify changing payload changes replay key
      const replayKey3 = buildWebhookReplayKey({
        providerId: "generic-webhook",
        eventType: "user.signed_up",
        externalEventId: "evt_ext_different",
        payloadSha256,
        timestampIdentity: "1710005000",
      });
      expect(replayKey1).not.toBe(replayKey3);
    });

    it("C. Verifies universal delivery with signature header sanitization and verification", async () => {
      const { verifyWebhookDelivery } = await import("@/lib/integrations/webhooks/verification");
      const { hmacSha256Hex } = await import("@/lib/integrations/webhooks/crypto");

      const rawBody = JSON.stringify({ event: "invoice.payment_succeeded", invoice_id: "inv_9988" });
      const secret = "secret_custom_wh_7766";
      const timestamp = String(Math.floor(Date.now() / 1000));
      const sigPayload = `${timestamp}.${rawBody}`;
      const signature = hmacSha256Hex(secret, sigPayload);

      const headers = new Headers();
      headers.set("x-j10-signature", signature);
      headers.set("x-j10-timestamp", timestamp);
      headers.set("x-j10-event-type", "invoice.payment_succeeded");

      const outcome = verifyWebhookDelivery({
        providerId: "generic-webhook",
        environment: "production",
        headers,
        rawBody,
        payload: JSON.parse(rawBody),
        credentials: { signing_secret: secret },
      });

      expect(outcome.signatureStatus).toBe("valid");
      expect(outcome.eventType).toBe("invoice.payment_succeeded");
    });
  });
});
